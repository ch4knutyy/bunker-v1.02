namespace Bunker.Models;

[System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter))]
public enum ChatSenderType
{
    Human,
    Ai,
    System
}

public sealed record RoomChatMessage(
    string Id,
    string RoomId,
    string SenderId,
    string SenderName,
    DateTimeOffset Timestamp,
    ChatSenderType SenderType,
    string Text,
    string? SystemEventType = null,
    IReadOnlyDictionary<string, string>? SystemEventData = null);

[System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter))]
public enum AiSocialMemoryType
{
    Support,
    Opposition,
    Promise,
    Threat,
    AllianceProposal,
    Agreement,
    Betrayal,
    ImportantClaim,
    OpinionChange
}

public sealed record AiSocialMemoryEntry(
    DateTimeOffset Timestamp,
    string ActorId,
    string ActorName,
    string? TargetId,
    string? TargetName,
    AiSocialMemoryType Type,
    string Summary,
    int Round,
    int Confidence,
    string Source);

public sealed class AiSocialRelationship
{
    public string TargetId { get; set; } = "";
    public string TargetName { get; set; } = "";
    public int Trust { get; set; } = 50;
    public int Tension { get; set; } = 0;
    public int Cooperation { get; set; } = 50;
    public int Rivalry { get; set; } = 0;
}

/// <summary>Stable behavioral parameters established once for an AI participant.</summary>
public sealed class AiBehaviorProfile
{
    public string CommunicationStyle { get; set; } = "balanced";
    public int Confidence { get; set; } = 50;
    public int Cooperation { get; set; } = 50;
    public int RiskTolerance { get; set; } = 50;
    public int TrustDisposition { get; set; } = 50;
    public string ConflictStyle { get; set; } = "measured";
    public string HonestyDisposition { get; set; } = "pragmatic";
    public string Motivation { get; set; } = "Protect a place in the bunker.";
    public string CurrentIntent { get; set; } = "Assess public evidence and protect a bunker place.";
}

public sealed class AiChatCompanion
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string Name { get; init; } = "AI";
    public string Motivation { get; init; } = "Survive by persuading the group.";
    public string PlayerStableId { get; init; } = "";
    public string Provider { get; set; } = "Gemini";
    public string Model { get; set; } = "";
    public AiBehaviorProfile BehavioralProfile { get; set; } = new();
    // Only facts exposed through the public projection are retained here.
    public Dictionary<string, string> ObservedPublicFacts { get; } = new(StringComparer.Ordinal);
    public List<AiSocialMemoryEntry> SocialMemory { get; set; } = [];
    public List<AiSocialRelationship> Relationships { get; set; } = [];
}
