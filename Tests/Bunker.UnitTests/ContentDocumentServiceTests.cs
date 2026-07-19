using System.Text;
using Bunker.Services.OwnerContent;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Bunker.UnitTests;

public sealed class ContentDocumentServiceTests
{
	[Fact]
	public async Task RegistryIncludesOnlyJsonInsideAllowedRootAndRejectsRawOrUnknownKeys()
	{
		await using var fixture = await ContentFixture.CreateAsync();
		await File.WriteAllTextAsync(
			Path.Combine(fixture.ContentRoot, "notes.txt"),
			"not content");
		await File.WriteAllTextAsync(
			Path.Combine(fixture.Root, "outside.json"),
			"""{"outside":true}""");
		var nestedDirectory = Directory.CreateDirectory(
			Path.Combine(fixture.ContentRoot, "nested"));
		await File.WriteAllTextAsync(
			Path.Combine(nestedDirectory.FullName, "nested.json"),
			"""{"nested":true}""");
		var linkedOutside = false;
		try
		{
			Directory.CreateSymbolicLink(
				Path.Combine(fixture.ContentRoot, "linked-outside"),
				fixture.Root);
			linkedOutside = true;
		}
		catch (Exception exception) when (
			exception is UnauthorizedAccessException or IOException or PlatformNotSupportedException)
		{
		}

		var registry = fixture.CreateRegistry();
		var documents = registry.List();

		Assert.Equal(2, documents.Count);
		Assert.Contains(documents, item => item.DisplayName == "sample.json");
		Assert.Contains(
			documents,
			item => item.DisplayName == "nested.json" &&
				item.RelativePath.Contains("nested/nested.json"));
		Assert.DoesNotContain(documents, item => item.RelativePath.Contains("outside"));
		if (linkedOutside)
		{
			Assert.DoesNotContain(
				documents,
				item => item.RelativePath.Contains("linked-outside"));
		}
		Assert.False(registry.TryResolve("../outside.json", out _));
		Assert.False(registry.TryResolve(
			Path.GetFullPath(Path.Combine(fixture.Root, "outside.json")),
			out _));
		Assert.False(registry.TryResolve(new string('a', 64), out _));
	}

	[Fact]
	public async Task LoadAndValidationReturnHashAndNeverWriteInvalidJson()
	{
		await using var fixture = await ContentFixture.CreateAsync();
		var service = fixture.CreateService();
		var descriptor = Assert.Single(await service.ListAsync());

		var loaded = await service.LoadAsync(descriptor.Key);
		var invalid = await service.ValidateAsync(descriptor.Key, """{"broken":""");
		var duplicate = await service.ValidateAsync(
			descriptor.Key,
			"""[{"id":"same"},{"id":"same"}]""");

		Assert.Equal(64, loaded.Sha256.Length);
		Assert.True(loaded.Content.Contains("\"items\"", StringComparison.Ordinal));
		Assert.False(invalid.IsValid);
		Assert.Contains(invalid.Errors, error => error.Code == "invalid_json");
		Assert.False(duplicate.IsValid);
		Assert.Contains(duplicate.Errors, error => error.Code == "duplicate_id");
		var exception = await Assert.ThrowsAsync<ContentEditorException>(() =>
			service.SaveAsync(
				Guid.NewGuid(),
				descriptor.Key,
				loaded.Sha256,
				"""{"broken":""",
				true,
				"invalid-command"));
		Assert.Equal("validation_failed", exception.Code);
		Assert.Equal(loaded.Content, await File.ReadAllTextAsync(fixture.DocumentPath));
	}

	[Fact]
	public async Task ValidSaveCreatesBackupAndConflictOrAtomicFailureDoesNotOverwriteTarget()
	{
		await using var fixture = await ContentFixture.CreateAsync();
		var service = fixture.CreateService();
		var descriptor = Assert.Single(await service.ListAsync());
		var original = await service.LoadAsync(descriptor.Key);
		const string proposed = """{"items":[{"id":"one","value":2}]}""";

		var saved = await service.SaveAsync(
			fixture.OwnerId,
			descriptor.Key,
			original.Sha256,
			proposed,
			true,
			"save-one");
		var backups = await service.ListBackupsAsync(descriptor.Key);

		Assert.True(saved.Success);
		Assert.Single(backups);
		Assert.Equal(original.Sha256, backups[0].OriginalHash);
		Assert.Equal(proposed, await File.ReadAllTextAsync(fixture.DocumentPath));

		var conflict = await Assert.ThrowsAsync<ContentEditorException>(() =>
			service.SaveAsync(
				fixture.OwnerId,
				descriptor.Key,
				original.Sha256,
				"""{"items":[]}""",
				true,
				"save-conflict"));
		Assert.Equal("content_conflict", conflict.Code);
		Assert.Equal(proposed, await File.ReadAllTextAsync(fixture.DocumentPath));

		fixture.Faults.FailBeforeReplace = true;
		var latest = await service.LoadAsync(descriptor.Key);
		var failure = await Assert.ThrowsAsync<ContentEditorException>(() =>
			service.SaveAsync(
				fixture.OwnerId,
				descriptor.Key,
				latest.Sha256,
				"""{"items":[{"id":"two"}]}""",
				true,
				"save-failure"));
		Assert.Equal("save_failed", failure.Code);
		Assert.Equal(proposed, await File.ReadAllTextAsync(fixture.DocumentPath));
	}

	[Fact]
	public async Task RestoreIsSafeIdempotentAndInvokesInvalidationAfterMutations()
	{
		await using var fixture = await ContentFixture.CreateAsync(maxBackups: 3);
		var service = fixture.CreateService();
		var descriptor = Assert.Single(await service.ListAsync());
		var original = await service.LoadAsync(descriptor.Key);

		var save = await service.SaveAsync(
			fixture.OwnerId,
			descriptor.Key,
			original.Sha256,
			"""{"items":[{"id":"changed"}]}""",
			true,
			"save-restore");
		var saveReplay = await service.SaveAsync(
			fixture.OwnerId,
			descriptor.Key,
			original.Sha256,
			"""{"items":[{"id":"changed"}]}""",
			true,
			"save-restore");
		var backup = Assert.Single(await service.ListBackupsAsync(descriptor.Key));
		var current = await service.LoadAsync(descriptor.Key);
		var restored = await service.RestoreBackupAsync(
			fixture.OwnerId,
			descriptor.Key,
			backup.BackupId,
			current.Sha256,
			true,
			"restore-one");
		var restoreReplay = await service.RestoreBackupAsync(
			fixture.OwnerId,
			descriptor.Key,
			backup.BackupId,
			current.Sha256,
			true,
			"restore-one");

		Assert.Equal(save.CurrentHash, saveReplay.CurrentHash);
		Assert.True(saveReplay.IdempotentReplay);
		Assert.True(restoreReplay.IdempotentReplay);
		Assert.Equal(original.Content, await File.ReadAllTextAsync(fixture.DocumentPath));
		Assert.Equal(2, fixture.ReloadCoordinator.CallCount);
		Assert.Equal("restart_required", restored.ReloadStatus);
		Assert.Equal(2, (await service.ListBackupsAsync(descriptor.Key)).Count);
	}

	[Fact]
	public async Task BackupRetentionKeepsConfiguredCountAndDtosExposeNoAbsolutePathsOrContent()
	{
		await using var fixture = await ContentFixture.CreateAsync(maxBackups: 2);
		var service = fixture.CreateService();
		var descriptor = Assert.Single(await service.ListAsync());

		for (var index = 0; index < 4; index++)
		{
			var current = await service.LoadAsync(descriptor.Key);
			await service.SaveAsync(
				fixture.OwnerId,
				descriptor.Key,
				current.Sha256,
				$$"""{"items":[{"id":"item-{{index}}"}]}""",
				true,
				$"retention-{index}");
		}

		var backups = await service.ListBackupsAsync(descriptor.Key);
		Assert.Equal(2, backups.Count);
		Assert.All(backups, backup =>
		{
			var serialized = System.Text.Json.JsonSerializer.Serialize(backup);
			Assert.DoesNotContain(fixture.Root, serialized, StringComparison.OrdinalIgnoreCase);
			Assert.DoesNotContain("\"items\"", serialized, StringComparison.Ordinal);
		});
	}

	private sealed class ContentFixture : IAsyncDisposable
	{
		private ContentFixture(
			string root,
			ContentEditorOptions options,
			ContentDocumentServiceFaults faults)
		{
			Root = root;
			Options = options;
			Faults = faults;
			ReloadCoordinator = new TestReloadCoordinator();
		}

		public string Root { get; }
		public string ContentRoot => Path.Combine(Root, "content");
		public string DocumentPath => Path.Combine(ContentRoot, "sample.json");
		public Guid OwnerId { get; } = Guid.NewGuid();
		public ContentEditorOptions Options { get; }
		public ContentDocumentServiceFaults Faults { get; }
		public TestReloadCoordinator ReloadCoordinator { get; }

		public static async Task<ContentFixture> CreateAsync(int maxBackups = 5)
		{
			var root = Path.Combine(
				Path.GetTempPath(),
				"bunker-owner-content-" + Guid.NewGuid().ToString("N"));
			Directory.CreateDirectory(Path.Combine(root, "content"));
			await File.WriteAllTextAsync(
				Path.Combine(root, "content", "sample.json"),
				"""{"items":[{"id":"one","value":1}]}""",
				new UTF8Encoding(false));
			return new ContentFixture(
				root,
				new ContentEditorOptions
				{
					Enabled = true,
					AllowedRoots = ["content"],
					BackupRoot = "backups",
					MaxDocumentBytes = 1024 * 1024,
					MaxBackupsPerFile = maxBackups
				},
				new ContentDocumentServiceFaults());
		}

		public ContentDocumentRegistry CreateRegistry() =>
			new(Root, Options);

		public ContentDocumentService CreateService()
		{
			return new ContentDocumentService(
				CreateRegistry(),
				new GenericContentDocumentValidator(),
				new ContentFileLockManager(),
				new ContentEditorCommandRegistry(),
				ReloadCoordinator,
				Faults,
				Microsoft.Extensions.Options.Options.Create(Options),
				new TestEnvironment(Root),
				TimeProvider.System,
				NullLogger<ContentDocumentService>.Instance);
		}

		public ValueTask DisposeAsync()
		{
			try
			{
				Directory.Delete(Root, recursive: true);
			}
			catch
			{
			}

			return ValueTask.CompletedTask;
		}
	}

	private sealed class TestReloadCoordinator : IContentReloadCoordinator
	{
		public int CallCount { get; private set; }

		public Task<string> InvalidateAsync(
			string fileKey,
			string relativePath,
			CancellationToken cancellationToken = default)
		{
			CallCount++;
			return Task.FromResult("restart_required");
		}
	}

	private sealed class TestEnvironment : IWebHostEnvironment
	{
		public TestEnvironment(string contentRootPath)
		{
			ContentRootPath = contentRootPath;
		}

		public string EnvironmentName { get; set; } = Environments.Development;
		public string ApplicationName { get; set; } = "Bunker.UnitTests";
		public string ContentRootPath { get; set; }
		public IFileProvider ContentRootFileProvider { get; set; } =
			new NullFileProvider();
		public string WebRootPath { get; set; } = Path.Combine(
			Path.GetTempPath(),
			"bunker-owner-content-test-webroot");
		public IFileProvider WebRootFileProvider { get; set; } =
			new NullFileProvider();
	}
}
