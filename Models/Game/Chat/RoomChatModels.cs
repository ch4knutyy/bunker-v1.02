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

public sealed record AiSocialMemoryEntry(DateTimeOffset Timestamp, string ActorId, string ActorName, string Text);

public sealed class AiChatCompanion
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string Name { get; init; } = "AI";
    public string Motivation { get; init; } = "Survive by persuading the group.";
    public string PlayerStableId { get; init; } = "";
    public string Provider { get; set; } = "Gemini";
    public string Model { get; set; } = "";
    // Only facts exposed through the public projection are retained here.
    public Dictionary<string, string> ObservedPublicFacts { get; } = new(StringComparer.Ordinal);
    public List<AiSocialMemoryEntry> SocialMemory { get; } = [];
}
