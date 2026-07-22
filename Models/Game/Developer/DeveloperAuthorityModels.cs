namespace Bunker.Models;

[Flags]
public enum RoomActorCapability : long
{
    None = 0,
    ManageRoom = 1L << 0,
    StartGame = 1L << 1,
    EndRound = 1L << 2,
    ManageVoting = 1L << 3,
    ManageTimer = 1L << 4,
    ManageThreats = 1L << 5,
    ManageBunkerResources = 1L << 6,
    SendGameEvents = 1L << 7,
    ManagePlayers = 1L << 8,
    TransferHost = 1L << 9,
    UsePremiumHostFeatures = 1L << 10,
    UseOmniscientGm = 1L << 11,
    UseDirectorControls = 1L << 12,
    ViewDiagnostics = 1L << 13,
    ViewAuditLog = 1L << 14,
    ManageSnapshots = 1L << 15,
    UseRecoveryTools = 1L << 16,
    EditRoomState = 1L << 17,
    EditGlobalContent = 1L << 18,
    ManageScenarioImages = 1L << 19,
    OperatePostGameStoryDirector = 1L << 20,
    PublishPostGameStory = 1L << 21,
    UseDeveloperTools = 1L << 22,
    All = (1L << 23) - 1
}

public enum DeveloperParticipationMode { Player, Observer }

public enum PostGamePhase
{
    None,
    FinalDiscussion,
    HostDecision,
    StoryRequested,
    StoryPreparation,
    StoryPublished,
    Completed
}

public sealed record DeveloperPresenceDto(
    bool DeveloperPresent,
    string? DeveloperPlayerId,
    string Status);

public sealed record DeveloperPrivateDto(
    bool IsDeveloper,
    string ParticipationMode,
    bool IsActiveOperator,
    bool CanTakeOverOperator,
    long OperatorVersion,
    IReadOnlyList<string> Capabilities,
    IReadOnlyDictionary<string, bool> Features,
    IReadOnlyList<DeveloperAuditEntry> RecentAudit);

public sealed record PostGameTransitionPublicDto(
    string Phase,
    bool DeveloperPresent,
    string? DeveloperPlayerId,
    bool CanRevealRemainingCharacteristics,
    bool HostDecisionPending,
    bool StoryRequested,
    bool PublishedStoryAvailable,
    string WaitingStatusCode,
    bool StoryDirectorAvailable,
    string? RequestedStoryMode);

public sealed class DeveloperAuditEntry
{
    public DateTimeOffset TimestampUtc { get; set; }
    public string RoomId { get; set; } = "";
    public string DeveloperPlayerId { get; set; } = "";
    public string Capability { get; set; } = "";
    public string CommandType { get; set; } = "";
    public string Result { get; set; } = "";
    public string? AffectedEntityId { get; set; }
    public string? CommandId { get; set; }
    public string? FailureCode { get; set; }
}
