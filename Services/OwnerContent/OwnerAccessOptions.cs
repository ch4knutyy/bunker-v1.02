namespace Bunker.Services.OwnerContent;

public sealed class OwnerAccessOptions
{
	public const string SectionName = "OwnerAccess";
	public string? UserId { get; set; }

	public bool TryGetOwnerId(out Guid ownerId)
	{
		return Guid.TryParse(UserId, out ownerId) && ownerId != Guid.Empty;
	}
}
