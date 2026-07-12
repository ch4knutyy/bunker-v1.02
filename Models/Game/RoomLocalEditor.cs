namespace Bunker.Models;

public static class RoomLocalEditorCategories
{
    public const string Bunker = "bunker";
    public const string Apocalypse = "apocalypse";
    public const string Player = "player";
}

public sealed record RoomLocalEditorFieldDto(string FieldId, string Label, string CurrentPublicValue, int MaxLength);
public sealed record RoomLocalEditorPlayerDto(string PlayerId, string Name, IReadOnlyList<RoomLocalEditorFieldDto> Fields);
public sealed record RoomLocalEditorDataDto(
    IReadOnlyList<RoomLocalEditorFieldDto> BunkerFields,
    IReadOnlyList<RoomLocalEditorFieldDto> ApocalypseFields,
    IReadOnlyList<RoomLocalEditorPlayerDto> Players,
    DateTimeOffset ServerTimestampUtc);
public sealed record RoomLocalEditPreviewDto(
    string Category,
    string? TargetPlayerId,
    string FieldId,
    string FieldLabel,
    string SanitizedProposedValue,
    bool WillCreateSnapshot,
    bool WillChangePublicState,
    bool CanApply,
    string? Warning,
    DateTimeOffset ServerTimestampUtc);
public sealed record RoomLocalEditResult(bool Success, bool Changed, string? ErrorCode, string? Message);
