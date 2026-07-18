using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace Bunker.Services.OwnerContent;

public sealed class ContentDocumentService : IContentDocumentService
{
	private const int MaximumChangedPaths = 200;
	private static readonly UTF8Encoding StrictUtf8 = new(false, true);
	private readonly IContentDocumentRegistry _registry;
	private readonly IContentDocumentValidator _validator;
	private readonly ContentFileLockManager _lockManager;
	private readonly ContentEditorCommandRegistry _commands;
	private readonly IContentReloadCoordinator _reloadCoordinator;
	private readonly ContentDocumentServiceFaults _faults;
	private readonly ContentEditorOptions _options;
	private readonly string _backupRoot;
	private readonly TimeProvider _timeProvider;
	private readonly ILogger<ContentDocumentService> _logger;

	public ContentDocumentService(
		IContentDocumentRegistry registry,
		IContentDocumentValidator validator,
		ContentFileLockManager lockManager,
		ContentEditorCommandRegistry commands,
		IContentReloadCoordinator reloadCoordinator,
		ContentDocumentServiceFaults faults,
		IOptions<ContentEditorOptions> options,
		IWebHostEnvironment environment,
		TimeProvider timeProvider,
		ILogger<ContentDocumentService> logger)
	{
		_registry = registry;
		_validator = validator;
		_lockManager = lockManager;
		_commands = commands;
		_reloadCoordinator = reloadCoordinator;
		_faults = faults;
		_options = options.Value;
		_backupRoot = Path.GetFullPath(
			Path.IsPathRooted(_options.BackupRoot)
				? _options.BackupRoot
				: Path.Combine(environment.ContentRootPath, _options.BackupRoot));
		var webRoot = Path.GetFullPath(environment.WebRootPath);
		if (IsWithinOrEqual(_backupRoot, webRoot))
		{
			throw new InvalidOperationException(
				"ContentEditor:BackupRoot must be outside the web root.");
		}
		_timeProvider = timeProvider;
		_logger = logger;
	}

	public Task<IReadOnlyList<ContentDocumentDescriptor>> ListAsync(
		CancellationToken cancellationToken = default)
	{
		EnsureEnabled();
		return Task.FromResult(_registry.List());
	}

	public async Task<ContentDocument> LoadAsync(
		string fileKey,
		CancellationToken cancellationToken = default)
	{
		EnsureEnabled();
		var registration = Resolve(fileKey);
		var bytes = await ReadBytesAsync(registration, cancellationToken);
		var content = Decode(bytes);
		var descriptor = RefreshDescriptor(registration);
		return new ContentDocument(
			descriptor,
			content,
			Hash(bytes),
			descriptor.LastModifiedAtUtc);
	}

	public Task<ContentValidationResult> ValidateAsync(
		string fileKey,
		string proposedContent,
		CancellationToken cancellationToken = default)
	{
		EnsureEnabled();
		var registration = Resolve(fileKey);
		EnsureProposedSize(proposedContent);
		return Task.FromResult(_validator.Validate(
			registration.Descriptor,
			proposedContent));
	}

	public async Task<ContentChangePreview> PreviewAsync(
		string fileKey,
		string expectedHash,
		string proposedContent,
		CancellationToken cancellationToken = default)
	{
		EnsureEnabled();
		var registration = Resolve(fileKey);
		EnsureProposedSize(proposedContent);
		var validation = _validator.Validate(
			registration.Descriptor,
			proposedContent);
		var currentBytes = await ReadBytesAsync(registration, cancellationToken);
		var currentHash = Hash(currentBytes);
		var proposedHash = Hash(StrictUtf8.GetBytes(proposedContent));
		if (!validation.IsValid)
		{
			return new ContentChangePreview(
				currentHash,
				proposedHash,
				[],
				0,
				0,
				0,
				0,
				!HashesEqual(currentHash, expectedHash),
				validation);
		}

		var summary = BuildDiff(Decode(currentBytes), proposedContent);
		return new ContentChangePreview(
			currentHash,
			proposedHash,
			summary.Paths,
			summary.Added,
			summary.Removed,
			summary.Modified,
			summary.Hidden,
			!HashesEqual(currentHash, expectedHash),
			validation);
	}

	public async Task<ContentMutationResult> SaveAsync(
		Guid ownerUserId,
		string fileKey,
		string expectedHash,
		string proposedContent,
		bool confirmation,
		string commandId,
		CancellationToken cancellationToken = default)
	{
		EnsureEnabled();
		EnsureConfirmation(confirmation);
		EnsureCommandId(commandId);
		var registration = Resolve(fileKey);
		EnsureProposedSize(proposedContent);
		var validation = _validator.Validate(
			registration.Descriptor,
			proposedContent);
		if (!validation.IsValid)
		{
			throw Error("validation_failed", StatusCodes.Status400BadRequest);
		}

		var commandKey = CommandKey(ownerUserId, fileKey, "save", commandId);
		using var fileLock = await _lockManager.AcquireAsync(fileKey, cancellationToken);
		if (_commands.TryGet(commandKey, out var replay))
		{
			return replay;
		}

		var currentBytes = await ReadBytesAsync(registration, cancellationToken);
		var currentHash = Hash(currentBytes);
		if (!HashesEqual(currentHash, expectedHash))
		{
			throw Error("content_conflict", StatusCodes.Status409Conflict);
		}

		var proposedBytes = StrictUtf8.GetBytes(proposedContent);
		var proposedHash = Hash(proposedBytes);
		var backup = await CreateBackupAsync(
			registration,
			currentBytes,
			currentHash,
			proposedHash,
			"save",
			ownerUserId,
			commandId,
			cancellationToken);
		try
		{
			await AtomicWriteAsync(
				registration,
				proposedBytes,
				cancellationToken);
		}
		catch (ContentEditorException)
		{
			throw;
		}
		catch (Exception exception)
		{
			_logger.LogError(
				exception,
				"Owner content save failed for {FileKey} ({RelativePath})",
				fileKey,
				registration.Descriptor.RelativePath);
			throw Error("save_failed", StatusCodes.Status500InternalServerError);
		}

		var reloadStatus = await _reloadCoordinator.InvalidateAsync(
			fileKey,
			registration.Descriptor.RelativePath,
			cancellationToken);
		var info = new FileInfo(registration.CanonicalPath);
		var result = new ContentMutationResult(
			true,
			"saved",
			proposedHash,
			info.LastWriteTimeUtc,
			reloadStatus,
			backup.BackupId);
		_commands.Store(commandKey, result);
		PruneBackups(fileKey);
		_logger.LogInformation(
			"Owner content saved {FileKey} {RelativePath}: {OldHash} -> {NewHash}, owner {OwnerUserId}",
			fileKey,
			registration.Descriptor.RelativePath,
			ShortHash(currentHash),
			ShortHash(proposedHash),
			ownerUserId);
		return result;
	}

	public Task<IReadOnlyList<ContentBackupDescriptor>> ListBackupsAsync(
		string fileKey,
		CancellationToken cancellationToken = default)
	{
		EnsureEnabled();
		Resolve(fileKey);
		IReadOnlyList<ContentBackupDescriptor> result = ReadBackupStates(fileKey)
			.OrderByDescending(item => item.Metadata.CreatedAtUtc)
			.Select(item => new ContentBackupDescriptor(
				item.Metadata.BackupId,
				item.Metadata.CreatedAtUtc,
				item.Metadata.OriginalHash,
				item.Metadata.ResultHash,
				item.Metadata.Action,
				item.Metadata.SizeBytes))
			.ToArray();
		return Task.FromResult(result);
	}

	public async Task<ContentMutationResult> RestoreBackupAsync(
		Guid ownerUserId,
		string fileKey,
		string backupId,
		string expectedHash,
		bool confirmation,
		string commandId,
		CancellationToken cancellationToken = default)
	{
		EnsureEnabled();
		EnsureConfirmation(confirmation);
		EnsureCommandId(commandId);
		var registration = Resolve(fileKey);
		var commandKey = CommandKey(ownerUserId, fileKey, $"restore:{backupId}", commandId);
		using var fileLock = await _lockManager.AcquireAsync(fileKey, cancellationToken);
		if (_commands.TryGet(commandKey, out var replay))
		{
			return replay;
		}

		var selected = ReadBackupStates(fileKey)
			.SingleOrDefault(item => item.Metadata.BackupId == backupId)
			?? throw Error("content_file_not_found", StatusCodes.Status404NotFound);
		var backupBytes = await File.ReadAllBytesAsync(
			selected.ContentPath,
			cancellationToken);
		var backupContent = Decode(backupBytes);
		var validation = _validator.Validate(registration.Descriptor, backupContent);
		if (!validation.IsValid ||
			!HashesEqual(Hash(backupBytes), selected.Metadata.OriginalHash))
		{
			throw Error("validation_failed", StatusCodes.Status400BadRequest);
		}

		var currentBytes = await ReadBytesAsync(registration, cancellationToken);
		var currentHash = Hash(currentBytes);
		if (!HashesEqual(currentHash, expectedHash))
		{
			throw Error("content_conflict", StatusCodes.Status409Conflict);
		}

		var restoredHash = Hash(backupBytes);
		var safetyBackup = await CreateBackupAsync(
			registration,
			currentBytes,
			currentHash,
			restoredHash,
			"restore",
			ownerUserId,
			commandId,
			cancellationToken);
		try
		{
			await AtomicWriteAsync(registration, backupBytes, cancellationToken);
		}
		catch (Exception exception)
		{
			_logger.LogError(
				exception,
				"Owner content restore failed for {FileKey} ({RelativePath})",
				fileKey,
				registration.Descriptor.RelativePath);
			throw Error("restore_failed", StatusCodes.Status500InternalServerError);
		}

		var reloadStatus = await _reloadCoordinator.InvalidateAsync(
			fileKey,
			registration.Descriptor.RelativePath,
			cancellationToken);
		var info = new FileInfo(registration.CanonicalPath);
		var result = new ContentMutationResult(
			true,
			"restored",
			restoredHash,
			info.LastWriteTimeUtc,
			reloadStatus,
			safetyBackup.BackupId);
		_commands.Store(commandKey, result);
		PruneBackups(fileKey);
		_logger.LogInformation(
			"Owner content restored {FileKey} {RelativePath}: {OldHash} -> {NewHash}, owner {OwnerUserId}",
			fileKey,
			registration.Descriptor.RelativePath,
			ShortHash(currentHash),
			ShortHash(restoredHash),
			ownerUserId);
		return result;
	}

	private void EnsureEnabled()
	{
		if (!_options.Enabled)
		{
			throw Error("content_editor_disabled", StatusCodes.Status404NotFound);
		}
	}

	private ContentDocumentRegistration Resolve(string fileKey)
	{
		if (!_registry.TryResolve(fileKey, out var registration))
		{
			throw Error("content_file_not_found", StatusCodes.Status404NotFound);
		}

		if (!File.Exists(registration.CanonicalPath))
		{
			throw Error("content_file_not_found", StatusCodes.Status404NotFound);
		}

		return registration;
	}

	private async Task<byte[]> ReadBytesAsync(
		ContentDocumentRegistration registration,
		CancellationToken cancellationToken)
	{
		var info = new FileInfo(registration.CanonicalPath);
		if (info.Length > _options.MaxDocumentBytes)
		{
			throw Error("content_file_too_large", StatusCodes.Status413PayloadTooLarge);
		}

		try
		{
			return await File.ReadAllBytesAsync(
				registration.CanonicalPath,
				cancellationToken);
		}
		catch (IOException)
		{
			throw Error("content_file_not_found", StatusCodes.Status404NotFound);
		}
	}

	private void EnsureProposedSize(string content)
	{
		if (StrictUtf8.GetByteCount(content) > _options.MaxDocumentBytes)
		{
			throw Error("content_file_too_large", StatusCodes.Status413PayloadTooLarge);
		}
	}

	private static void EnsureConfirmation(bool confirmation)
	{
		if (!confirmation)
		{
			throw Error("confirmation_required", StatusCodes.Status400BadRequest);
		}
	}

	private static void EnsureCommandId(string commandId)
	{
		if (string.IsNullOrWhiteSpace(commandId) ||
			commandId.Length > 100 ||
			commandId.Any(character =>
				!(char.IsLetterOrDigit(character) || character is '-' or '_')))
		{
			throw Error("invalid_command_id", StatusCodes.Status400BadRequest);
		}
	}

	private async Task<ContentBackupMetadata> CreateBackupAsync(
		ContentDocumentRegistration registration,
		byte[] currentBytes,
		string currentHash,
		string resultHash,
		string action,
		Guid ownerUserId,
		string commandId,
		CancellationToken cancellationToken)
	{
		try
		{
			var directory = BackupDirectory(registration.Descriptor.Key);
			Directory.CreateDirectory(directory);
			var backupId =
				$"{_timeProvider.GetUtcNow():yyyyMMddHHmmssfff}-{Guid.NewGuid():N}";
			var contentPath = Path.Combine(directory, backupId + ".json");
			await WriteNewAndFlushAsync(contentPath, currentBytes, cancellationToken);
			var metadata = new ContentBackupMetadata(
				backupId,
				registration.Descriptor.RelativePath,
				_timeProvider.GetUtcNow().UtcDateTime,
				action,
				currentHash,
				resultHash,
				ownerUserId,
				commandId,
				currentBytes.LongLength);
			var metadataBytes = StrictUtf8.GetBytes(JsonSerializer.Serialize(metadata));
			await WriteNewAndFlushAsync(
				Path.Combine(directory, backupId + ".meta.json"),
				metadataBytes,
				cancellationToken);
			return metadata;
		}
		catch (Exception exception)
		{
			_logger.LogError(
				exception,
				"Owner content backup failed for {FileKey}",
				registration.Descriptor.Key);
			throw Error("backup_failed", StatusCodes.Status500InternalServerError);
		}
	}

	private async Task AtomicWriteAsync(
		ContentDocumentRegistration registration,
		byte[] bytes,
		CancellationToken cancellationToken)
	{
		var directory = Path.GetDirectoryName(registration.CanonicalPath)!;
		var tempPath = Path.Combine(
			directory,
			$".{Path.GetFileName(registration.CanonicalPath)}.{Guid.NewGuid():N}.tmp");
		try
		{
			await WriteNewAndFlushAsync(tempPath, bytes, cancellationToken);
			var tempContent = Decode(await File.ReadAllBytesAsync(tempPath, cancellationToken));
			var validation = _validator.Validate(registration.Descriptor, tempContent);
			if (!validation.IsValid)
			{
				throw Error("validation_failed", StatusCodes.Status400BadRequest);
			}

			if (_faults.FailBeforeReplace)
			{
				throw new IOException("Injected failure before atomic replacement.");
			}

			File.Move(tempPath, registration.CanonicalPath, overwrite: true);
		}
		finally
		{
			TryDelete(tempPath);
		}
	}

	private static async Task WriteNewAndFlushAsync(
		string path,
		byte[] bytes,
		CancellationToken cancellationToken)
	{
		await using var stream = new FileStream(
			path,
			FileMode.CreateNew,
			FileAccess.Write,
			FileShare.None,
			81920,
			FileOptions.WriteThrough | FileOptions.Asynchronous);
		await stream.WriteAsync(bytes, cancellationToken);
		await stream.FlushAsync(cancellationToken);
		stream.Flush(flushToDisk: true);
	}

	private IReadOnlyList<BackupState> ReadBackupStates(string fileKey)
	{
		var directory = BackupDirectory(fileKey);
		if (!Directory.Exists(directory))
		{
			return [];
		}

		var states = new List<BackupState>();
		foreach (var metadataPath in Directory.EnumerateFiles(
			directory,
			"*.meta.json",
			SearchOption.TopDirectoryOnly))
		{
			try
			{
				var metadata = JsonSerializer.Deserialize<ContentBackupMetadata>(
					File.ReadAllText(metadataPath, StrictUtf8));
				if (metadata is null ||
					!string.Equals(
						Path.GetFileName(metadataPath),
						metadata.BackupId + ".meta.json",
						StringComparison.Ordinal))
				{
					continue;
				}

				var contentPath = Path.Combine(directory, metadata.BackupId + ".json");
				if (File.Exists(contentPath))
				{
					states.Add(new BackupState(metadata, contentPath, metadataPath));
				}
			}
			catch
			{
				// Corrupt backup metadata is ignored and never exposed to the client.
			}
		}

		return states;
	}

	private void PruneBackups(string fileKey)
	{
		var keep = Math.Clamp(_options.MaxBackupsPerFile, 1, 1_000);
		foreach (var stale in ReadBackupStates(fileKey)
			.OrderByDescending(item => item.Metadata.CreatedAtUtc)
			.Skip(keep))
		{
			TryDelete(stale.ContentPath);
			TryDelete(stale.MetadataPath);
		}
	}

	private string BackupDirectory(string fileKey)
	{
		return Path.Combine(_backupRoot, fileKey);
	}

	private static ContentDocumentDescriptor RefreshDescriptor(
		ContentDocumentRegistration registration)
	{
		var info = new FileInfo(registration.CanonicalPath);
		return registration.Descriptor with
		{
			SizeBytes = info.Length,
			LastModifiedAtUtc = info.LastWriteTimeUtc
		};
	}

	private static string Decode(byte[] bytes)
	{
		try
		{
			return StrictUtf8.GetString(bytes);
		}
		catch (DecoderFallbackException)
		{
			throw Error("invalid_json", StatusCodes.Status400BadRequest);
		}
	}

	private static string Hash(byte[] bytes)
	{
		return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
	}

	private static bool HashesEqual(string left, string right)
	{
		return !string.IsNullOrWhiteSpace(right) &&
			left.Equals(right, StringComparison.OrdinalIgnoreCase);
	}

	private static string CommandKey(
		Guid ownerUserId,
		string fileKey,
		string action,
		string commandId)
	{
		return $"{ownerUserId:N}:{fileKey}:{action}:{commandId}";
	}

	private static ContentEditorException Error(string code, int statusCode)
	{
		return new ContentEditorException(code, statusCode);
	}

	private static string ShortHash(string hash) =>
		hash.Length <= 12 ? hash : hash[..12];

	private static bool IsWithinOrEqual(string path, string root)
	{
		var comparison = OperatingSystem.IsWindows()
			? StringComparison.OrdinalIgnoreCase
			: StringComparison.Ordinal;
		var normalizedRoot = root.TrimEnd(
			Path.DirectorySeparatorChar,
			Path.AltDirectorySeparatorChar);
		return path.Equals(normalizedRoot, comparison) ||
			path.StartsWith(normalizedRoot + Path.DirectorySeparatorChar, comparison);
	}

	private static void TryDelete(string path)
	{
		try
		{
			if (File.Exists(path))
			{
				File.Delete(path);
			}
		}
		catch
		{
		}
	}

	private static DiffSummary BuildDiff(string currentContent, string proposedContent)
	{
		var current = JsonNode.Parse(currentContent)!;
		var proposed = JsonNode.Parse(proposedContent)!;
		var accumulator = new DiffAccumulator();
		CompareNodes(current, proposed, "$", accumulator);
		return new DiffSummary(
			accumulator.Paths,
			accumulator.Added,
			accumulator.Removed,
			accumulator.Modified,
			accumulator.TotalPaths - accumulator.Paths.Count);
	}

	private static void CompareNodes(
		JsonNode? current,
		JsonNode? proposed,
		string path,
		DiffAccumulator accumulator)
	{
		if (JsonNode.DeepEquals(current, proposed))
		{
			return;
		}

		if (current is null)
		{
			accumulator.Added++;
			accumulator.AddPath(path);
			return;
		}

		if (proposed is null)
		{
			accumulator.Removed++;
			accumulator.AddPath(path);
			return;
		}

		if (current is JsonObject currentObject &&
			proposed is JsonObject proposedObject)
		{
			foreach (var key in currentObject.Select(item => item.Key)
				.Union(proposedObject.Select(item => item.Key))
				.Order(StringComparer.Ordinal))
			{
				CompareNodes(
					currentObject[key],
					proposedObject[key],
					$"{path}.{key}",
					accumulator);
			}

			return;
		}

		if (current is JsonArray currentArray &&
			proposed is JsonArray proposedArray)
		{
			var count = Math.Max(currentArray.Count, proposedArray.Count);
			for (var index = 0; index < count; index++)
			{
				CompareNodes(
					index < currentArray.Count ? currentArray[index] : null,
					index < proposedArray.Count ? proposedArray[index] : null,
					$"{path}[{index}]",
					accumulator);
			}

			return;
		}

		accumulator.Modified++;
		accumulator.AddPath(path);
	}

	private sealed class DiffAccumulator
	{
		public List<string> Paths { get; } = [];
		public int Added { get; set; }
		public int Removed { get; set; }
		public int Modified { get; set; }
		public int TotalPaths { get; private set; }

		public void AddPath(string path)
		{
			TotalPaths++;
			if (Paths.Count < MaximumChangedPaths)
			{
				Paths.Add(path);
			}
		}
	}

	private sealed record DiffSummary(
		IReadOnlyList<string> Paths,
		int Added,
		int Removed,
		int Modified,
		int Hidden);

	private sealed record BackupState(
		ContentBackupMetadata Metadata,
		string ContentPath,
		string MetadataPath);
}
