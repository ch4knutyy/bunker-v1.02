namespace Bunker.Models;

public sealed record OmniscientCharacteristicDto(string Key, string Value, bool IsRevealed, string? Description = null);
public sealed record OmniscientInventoryItemDto(string Name, string Description, int Quantity, string Unit, bool IsHidden, string Source);
public sealed record OmniscientSpecialCardDto(string Id, string Name, string Description, bool IsSecret, bool IsUsed, bool IsActive, string UseMode);
public sealed record OmniscientConditionDto(string ConditionId, string Name, string SeverityLevel, string Description, string SourceThreatId);
public sealed record OmniscientPlayerStateDto(
    string PlayerId, string DisplayName, bool IsActive, bool IsEliminated, bool IsConnected,
    bool IsHost, bool IsSpectatorGm, bool IsReady, bool IsCurrentTurn,
    IReadOnlyList<OmniscientCharacteristicDto> Characteristics,
    IReadOnlyList<OmniscientInventoryItemDto> Inventory,
    IReadOnlyList<OmniscientSpecialCardDto> SpecialCards,
    IReadOnlyList<OmniscientConditionDto> AdditionalPhysicalConditions,
    string? SecretGoal);

public sealed record OmniscientVoteDto(string VoterPlayerId, string VoterName, string CandidatePlayerId, string CandidateName);
public sealed record OmniscientVotingStateDto(string Status, int EligibleVoterCount, int VoteCount, IReadOnlyList<OmniscientVoteDto>? SecretVotes);
public sealed record OmniscientThreatAttemptDto(string Status, DateTimeOffset? StartedAtUtc, DateTimeOffset? CompletedAtUtc,
    int CurrentIndex, int TotalTasks, int CorrectAnswers, int WrongAnswers, int Timeouts);
public sealed record OmniscientThreatStateDto(string? ThreatId, string? Type, string? Title, string InteractionStatus,
    IReadOnlyList<string> ParticipantPlayerIds, string? LeaderPlayerId, string? SelectedPlanId,
    string? TerminalStatus, bool EffectsApplied, OmniscientThreatAttemptDto? CurrentAttempt);
public sealed record OmniscientBunkerStateDto(string Id, string Name, string Description, int Capacity, string Location,
    int SuppliesMonths, IReadOnlyList<string> Facilities, IReadOnlyList<string> Resources, IReadOnlyList<string> Problems, string Condition);
public sealed record OmniscientApocalypseStateDto(string Id, string Name, string Description, string Severity, string Duration,
    IReadOnlyList<string> Threats, IReadOnlyList<string> Requirements);
public sealed record OmniscientTimerStateDto(string Status, string Purpose, int DurationSeconds, DateTimeOffset? DeadlineUtc, int RemainingSeconds);
public sealed record OmniscientRoomStateDto(
    long StateVersion, DateTimeOffset UpdatedAtUtc, string Fingerprint,
    string RoomId, int Round, string Phase, bool IsPaused, string? PauseReason,
    string? CurrentTurnPlayerId, int ActiveGameplayPlayerCount, IReadOnlyList<string> SpectatorGmPlayerIds,
    OmniscientBunkerStateDto? Bunker, OmniscientApocalypseStateDto? Apocalypse,
    OmniscientTimerStateDto Timer, OmniscientThreatStateDto? CurrentThreat,
    OmniscientVotingStateDto? CurrentVoting, IReadOnlyList<OmniscientPlayerStateDto> Players,
    bool CanViewSecretVotes);
