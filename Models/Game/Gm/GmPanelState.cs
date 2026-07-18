namespace Bunker.Models;

public sealed record GmPanelPermissionsDto(
	bool CanManageRounds,
	bool CanManagePlayers,
	bool CanManageVoting,
	bool CanManageThreats,
	bool CanManageBunker,
	bool CanViewOmniscientData,
	bool CanUseTechnicalTools,
	bool CanRestoreSnapshots,
	bool CanUseDangerousActions,
	bool CanOpenContentEditor);

public sealed record GmPanelAvailableActionsDto(
	bool CanStartGame,
	bool CanAdvanceRound,
	bool CanEndRound,
	bool CanEndGame);

public sealed record GmPanelPlayerSummaryDto(
	string PlayerId,
	string Name,
	bool IsConnected,
	bool IsActive,
	bool IsEliminated,
	bool IsHost,
	int RevealedCount,
	bool IsProtectedFromVote,
	bool IsCurrentTurn);

public sealed record GmPanelStateDto(
	string RoomCode,
	string Role,
	string RoomState,
	string Phase,
	int Round,
	int ActivePlayerCount,
	int BunkerCapacity,
	string TimerStatus,
	int TimerRemainingSeconds,
	string VotingStatus,
	int VotesCast,
	int RequiredVotes,
	bool VotingIsTie,
	string ThreatStatus,
	string? ThreatName,
	bool IsCompleted,
	GmPanelPermissionsDto Permissions,
	GmPanelAvailableActionsDto AvailableActions,
	IReadOnlyList<GmPanelPlayerSummaryDto> Players);
