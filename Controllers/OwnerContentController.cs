using System.Security.Claims;
using Bunker.Services.OwnerContent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bunker.Controllers;

[Authorize(Policy = "OwnerOnly")]
[Route("owner/content")]
public sealed class OwnerContentController : Controller
{
	private readonly IContentDocumentService _documents;

	public OwnerContentController(IContentDocumentService documents)
	{
		_documents = documents;
	}

	[HttpGet("")]
	public IActionResult Index()
	{
		return View();
	}

	[HttpGet("files")]
	public async Task<IActionResult> Files(CancellationToken cancellationToken)
	{
		return Ok(await _documents.ListAsync(cancellationToken));
	}

	[HttpGet("document/{fileKey}")]
	public async Task<IActionResult> Document(
		string fileKey,
		CancellationToken cancellationToken)
	{
		return await ExecuteAsync(
			() => _documents.LoadAsync(fileKey, cancellationToken));
	}

	[HttpPost("validate")]
	[ValidateAntiForgeryToken]
	[Consumes("application/json")]
	[RequestSizeLimit(45_000_000)]
	public async Task<IActionResult> Validate(
		[FromBody] ContentValidateRequest request,
		CancellationToken cancellationToken)
	{
		return await ExecuteAsync(() => _documents.ValidateAsync(
			request.FileKey,
			request.ProposedContent,
			cancellationToken));
	}

	[HttpPost("preview")]
	[ValidateAntiForgeryToken]
	[Consumes("application/json")]
	[RequestSizeLimit(45_000_000)]
	public async Task<IActionResult> Preview(
		[FromBody] ContentPreviewRequest request,
		CancellationToken cancellationToken)
	{
		return await ExecuteAsync(() => _documents.PreviewAsync(
			request.FileKey,
			request.ExpectedHash,
			request.ProposedContent,
			cancellationToken));
	}

	[HttpPost("save")]
	[ValidateAntiForgeryToken]
	[Consumes("application/json")]
	[RequestSizeLimit(45_000_000)]
	public async Task<IActionResult> Save(
		[FromBody] ContentSaveRequest request,
		CancellationToken cancellationToken)
	{
		return await ExecuteAsync(() => _documents.SaveAsync(
			CurrentUserId(),
			request.FileKey,
			request.ExpectedHash,
			request.ProposedContent,
			request.Confirmation,
			request.CommandId,
			cancellationToken));
	}

	[HttpGet("backups/{fileKey}")]
	public async Task<IActionResult> Backups(
		string fileKey,
		CancellationToken cancellationToken)
	{
		return await ExecuteAsync(
			() => _documents.ListBackupsAsync(fileKey, cancellationToken));
	}

	[HttpPost("restore")]
	[ValidateAntiForgeryToken]
	[Consumes("application/json")]
	[RequestSizeLimit(65_536)]
	public async Task<IActionResult> Restore(
		[FromBody] ContentRestoreRequest request,
		CancellationToken cancellationToken)
	{
		return await ExecuteAsync(() => _documents.RestoreBackupAsync(
			CurrentUserId(),
			request.FileKey,
			request.BackupId,
			request.ExpectedHash,
			request.Confirmation,
			request.CommandId,
			cancellationToken));
	}

	private Guid CurrentUserId()
	{
		var value = User.FindFirstValue(ClaimTypes.NameIdentifier);
		if (!Guid.TryParse(value, out var userId))
		{
			throw new ContentEditorException(
				"owner_required",
				StatusCodes.Status403Forbidden);
		}

		return userId;
	}

	private async Task<IActionResult> ExecuteAsync<T>(Func<Task<T>> action)
	{
		try
		{
			return Ok(await action());
		}
		catch (ContentEditorException exception)
		{
			return StatusCode(
				exception.StatusCode,
				new { code = exception.Code });
		}
	}
}
