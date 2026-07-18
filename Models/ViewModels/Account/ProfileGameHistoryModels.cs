namespace Bunker.Models.ViewModels.Account;

public sealed record ProfileGameStatistics(
	int CompletedGames,
	int ActiveGames,
	int Wins,
	int Losses,
	int HostedGames,
	decimal WinRatePercent);

public sealed record ProfileGameHistoryItem(
	Guid GameSessionId,
	string RoomCode,
	string Status,
	DateTime? StartedAtUtc,
	DateTime? EndedAtUtc,
	TimeSpan? Duration,
	int PlayerCount,
	bool IsHost,
	bool IsWinner,
	bool WasEliminated,
	int? EliminatedAtRound,
	string? ApocalypseId,
	string? BunkerId);

public sealed record ProfileGameOverview(
	ProfileGameStatistics Statistics,
	IReadOnlyList<ProfileGameHistoryItem> RecentGames);

public sealed class ProfileGameHistoryPage
{
	public IReadOnlyList<ProfileGameHistoryItem> Items { get; init; } = [];
	public int CurrentPage { get; init; }
	public int TotalPages { get; init; }
	public int TotalItems { get; init; }
	public bool HasPreviousPage => CurrentPage > 1;
	public bool HasNextPage => CurrentPage < TotalPages;
}

public sealed class ProfileGameHistoryPageViewModel
{
	public IReadOnlyList<ProfileGameHistoryItem> Items { get; init; } = [];
	public int CurrentPage { get; init; }
	public int TotalPages { get; init; }
	public int TotalItems { get; init; }
	public bool HasPreviousPage { get; init; }
	public bool HasNextPage { get; init; }
}
