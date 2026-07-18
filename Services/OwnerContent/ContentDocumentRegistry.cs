using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace Bunker.Services.OwnerContent;

public sealed record ContentDocumentRegistration(
	ContentDocumentDescriptor Descriptor,
	string CanonicalPath,
	string CanonicalRoot);

public interface IContentDocumentRegistry
{
	IReadOnlyList<ContentDocumentDescriptor> List();
	bool TryResolve(string fileKey, out ContentDocumentRegistration registration);
}

public sealed class ContentDocumentRegistry : IContentDocumentRegistry
{
	private readonly IReadOnlyDictionary<string, ContentDocumentRegistration> _documents;

	public ContentDocumentRegistry(
		IHostEnvironment environment,
		IOptions<ContentEditorOptions> options)
		: this(environment.ContentRootPath, options.Value)
	{
	}

	public ContentDocumentRegistry(string contentRootPath, ContentEditorOptions options)
	{
		var registrations = new Dictionary<string, ContentDocumentRegistration>(StringComparer.Ordinal);
		var backupRoot = ResolveConfiguredPath(contentRootPath, options.BackupRoot);

		for (var rootIndex = 0; rootIndex < options.AllowedRoots.Count; rootIndex++)
		{
			var root = ResolveConfiguredPath(contentRootPath, options.AllowedRoots[rootIndex]);
			if (!Directory.Exists(root) || IsReparsePoint(root))
			{
				continue;
			}

			foreach (var file in EnumerateFilesSafely(root))
			{
				var canonical = Path.GetFullPath(file);
				if (!IsWithinRoot(canonical, root) ||
					IsWithinRoot(canonical, backupRoot) ||
					HasReparsePoint(root, canonical) ||
					!string.Equals(Path.GetExtension(canonical), ".json", StringComparison.OrdinalIgnoreCase))
				{
					continue;
				}

				var relativeWithinRoot = Path.GetRelativePath(root, canonical)
					.Replace(Path.DirectorySeparatorChar, '/');
				var configuredRoot = options.AllowedRoots[rootIndex]
					.TrimEnd('/', '\\')
					.Replace('\\', '/');
				var relativePath = $"{configuredRoot}/{relativeWithinRoot}".TrimStart('/');
				var key = CreateKey(rootIndex, relativeWithinRoot);
				var info = new FileInfo(canonical);
				var group = Path.GetDirectoryName(relativeWithinRoot)?
					.Replace(Path.DirectorySeparatorChar, '/') ?? "root";
				if (string.IsNullOrWhiteSpace(group))
				{
					group = "root";
				}

				var descriptor = new ContentDocumentDescriptor(
					key,
					Path.GetFileName(canonical),
					relativePath,
					group,
					info.Length,
					info.LastWriteTimeUtc,
					"restart_required");
				registrations[key] = new ContentDocumentRegistration(
					descriptor,
					canonical,
					root);
			}
		}

		_documents = registrations;
	}

	public IReadOnlyList<ContentDocumentDescriptor> List()
	{
		return _documents.Values
			.Where(item =>
				TryResolve(item.Descriptor.Key, out _) &&
				File.Exists(item.CanonicalPath))
			.Select(item =>
			{
				var info = new FileInfo(item.CanonicalPath);
				return item.Descriptor with
				{
					SizeBytes = info.Exists ? info.Length : 0,
					LastModifiedAtUtc = info.Exists
						? info.LastWriteTimeUtc
						: item.Descriptor.LastModifiedAtUtc
				};
			})
			.OrderBy(item => item.Group, StringComparer.OrdinalIgnoreCase)
			.ThenBy(item => item.DisplayName, StringComparer.OrdinalIgnoreCase)
			.ToArray();
	}

	public bool TryResolve(string fileKey, out ContentDocumentRegistration registration)
	{
		if (string.IsNullOrWhiteSpace(fileKey) ||
			fileKey.Length != 64 ||
			fileKey.Any(character => !Uri.IsHexDigit(character)))
		{
			registration = null!;
			return false;
		}

		if (!_documents.TryGetValue(fileKey.ToLowerInvariant(), out registration!))
		{
			return false;
		}

		var currentCanonicalPath = Path.GetFullPath(registration.CanonicalPath);
		if (!IsWithinRoot(currentCanonicalPath, registration.CanonicalRoot) ||
			HasReparsePoint(registration.CanonicalRoot, currentCanonicalPath))
		{
			registration = null!;
			return false;
		}

		return true;
	}

	private static string CreateKey(int rootIndex, string relativePath)
	{
		var normalized = $"{rootIndex}:{relativePath.Replace('\\', '/').ToLowerInvariant()}";
		return Convert.ToHexString(
			SHA256.HashData(Encoding.UTF8.GetBytes(normalized))).ToLowerInvariant();
	}

	private static string ResolveConfiguredPath(string contentRootPath, string configuredPath)
	{
		return Path.GetFullPath(
			Path.IsPathRooted(configuredPath)
				? configuredPath
				: Path.Combine(contentRootPath, configuredPath));
	}

	private static bool IsWithinRoot(string path, string root)
	{
		var comparison = OperatingSystem.IsWindows()
			? StringComparison.OrdinalIgnoreCase
			: StringComparison.Ordinal;
		var normalizedRoot = root.TrimEnd(
			Path.DirectorySeparatorChar,
			Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
		return path.StartsWith(normalizedRoot, comparison);
	}

	private static bool HasReparsePoint(string root, string file)
	{
		var relative = Path.GetRelativePath(root, file);
		var current = root;
		foreach (var segment in relative.Split(
			[Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar],
			StringSplitOptions.RemoveEmptyEntries))
		{
			current = Path.Combine(current, segment);
			if (IsReparsePoint(current))
			{
				return true;
			}
		}

		return false;
	}

	private static IEnumerable<string> EnumerateFilesSafely(string root)
	{
		var pending = new Stack<string>();
		pending.Push(root);
		while (pending.Count > 0)
		{
			var directory = pending.Pop();
			IEnumerable<string> files;
			IEnumerable<string> directories;
			try
			{
				files = Directory.EnumerateFiles(
					directory,
					"*",
					SearchOption.TopDirectoryOnly).ToArray();
				directories = Directory.EnumerateDirectories(
					directory,
					"*",
					SearchOption.TopDirectoryOnly).ToArray();
			}
			catch (UnauthorizedAccessException)
			{
				continue;
			}
			catch (IOException)
			{
				continue;
			}

			foreach (var file in files)
			{
				yield return file;
			}

			foreach (var child in directories)
			{
				if (!IsReparsePoint(child))
				{
					pending.Push(child);
				}
			}
		}
	}

	private static bool IsReparsePoint(string path)
	{
		try
		{
			return (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0;
		}
		catch
		{
			return true;
		}
	}
}
