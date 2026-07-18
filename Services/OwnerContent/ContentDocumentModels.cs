namespace Bunker.Services.OwnerContent;

public sealed record ContentDocumentDescriptor(
	string Key,
	string DisplayName,
	string RelativePath,
	string Group,
	long SizeBytes,
	DateTime LastModifiedAtUtc,
	string ReloadStatus);

public sealed record ContentDocument(
	ContentDocumentDescriptor Descriptor,
	string Content,
	string Sha256,
	DateTime LastModifiedAtUtc);

public sealed record ContentValidationIssue(
	string Code,
	string Message,
	string? Path = null,
	long? LineNumber = null,
	long? BytePositionInLine = null);

public sealed record ContentValidationResult(
	bool IsValid,
	IReadOnlyList<ContentValidationIssue> Errors,
	IReadOnlyList<ContentValidationIssue> Warnings);

public sealed record ContentChangePreview(
	string CurrentHash,
	string ProposedHash,
	IReadOnlyList<string> ChangedPaths,
	int AddedCount,
	int RemovedCount,
	int ModifiedCount,
	int HiddenChangedPathCount,
	bool IsConflict,
	ContentValidationResult Validation);

public sealed record ContentBackupDescriptor(
	string BackupId,
	DateTime CreatedAtUtc,
	string OriginalHash,
	string ResultHash,
	string Action,
	long SizeBytes);

public sealed record ContentMutationResult(
	bool Success,
	string Code,
	string CurrentHash,
	DateTime LastModifiedAtUtc,
	string ReloadStatus,
	string? BackupId,
	bool IdempotentReplay = false);

public sealed record ContentSaveRequest(
	string FileKey,
	string ExpectedHash,
	string ProposedContent,
	bool Confirmation,
	string CommandId);

public sealed record ContentValidateRequest(string FileKey, string ProposedContent);

public sealed record ContentPreviewRequest(
	string FileKey,
	string ExpectedHash,
	string ProposedContent);

public sealed record ContentRestoreRequest(
	string FileKey,
	string BackupId,
	string ExpectedHash,
	bool Confirmation,
	string CommandId);

internal sealed record ContentBackupMetadata(
	string BackupId,
	string OriginalRelativePath,
	DateTime CreatedAtUtc,
	string Action,
	string OriginalHash,
	string ResultHash,
	Guid OwnerUserId,
	string CommandId,
	long SizeBytes);

public sealed class ContentEditorException : Exception
{
	public ContentEditorException(string code, int statusCode, string? message = null)
		: base(message ?? code)
	{
		Code = code;
		StatusCode = statusCode;
	}

	public string Code { get; }
	public int StatusCode { get; }
}
