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
	bool CanEndGame,
	bool CanStartVoting,
	bool CanEndVoting,
	bool CanCancelVoting,
	bool CanStartTimer,
	bool CanPauseTimer,
	bool CanResumeTimer,
	bool CanAdjustTimer,
	bool CanManageActiveThreat,
	bool CanFinishPostGameDiscussion,
	string PrimaryAction);

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
	int ReadyPlayerCount,
	int ReadyRequiredCount,
	int? BunkerCapacity,
	string TimerStatus,
	int TimerRemainingSeconds,
	string VotingStatus,
	int VotesCast,
	int RequiredVotes,
	bool VotingIsTie,
	int RecommendedStartRound,
	int? VotingStartedAtRound,
	bool IsEarlyVoting,
	string ThreatStatus,
	string? ThreatName,
	bool IsCompleted,
	string PostGamePhase,
	GmPanelPermissionsDto Permissions,
	GmPanelAvailableActionsDto AvailableActions,
	IReadOnlyList<GmPanelPlayerSummaryDto> Players);
