namespace Bunker.Services.OwnerContent;

public interface IContentDocumentService
{
	Task<IReadOnlyList<ContentDocumentDescriptor>> ListAsync(
		CancellationToken cancellationToken = default);
	Task<ContentDocument> LoadAsync(
		string fileKey,
		CancellationToken cancellationToken = default);
	Task<ContentValidationResult> ValidateAsync(
		string fileKey,
		string proposedContent,
		CancellationToken cancellationToken = default);
	Task<ContentChangePreview> PreviewAsync(
		string fileKey,
		string expectedHash,
		string proposedContent,
		CancellationToken cancellationToken = default);
	Task<ContentMutationResult> SaveAsync(
		Guid ownerUserId,
		string fileKey,
		string expectedHash,
		string proposedContent,
		bool confirmation,
		string commandId,
		CancellationToken cancellationToken = default);
	Task<IReadOnlyList<ContentBackupDescriptor>> ListBackupsAsync(
		string fileKey,
		CancellationToken cancellationToken = default);
	Task<ContentMutationResult> RestoreBackupAsync(
		Guid ownerUserId,
		string fileKey,
		string backupId,
		string expectedHash,
		bool confirmation,
		string commandId,
		CancellationToken cancellationToken = default);
}
