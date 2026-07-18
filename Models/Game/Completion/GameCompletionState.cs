namespace Bunker.Models;

public sealed record GameWinnerState(
	string PlayerId,
	string Name);

public sealed record GameCompletionState(
	string Reason,
	string Source,
	int BunkerCapacity,
	int SurvivorCount,
	int CompletedAtRound,
	DateTime CompletedAtUtc,
	IReadOnlyList<GameWinnerState> Winners);
