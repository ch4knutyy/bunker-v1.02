namespace Bunker.Models.ViewModels.Account;

public sealed class ProfileViewModel
{
	public string DisplayName { get; init; } = string.Empty;
	public string Email { get; init; } = string.Empty;
	public DateTime CreatedAtUtc { get; init; }
}
