namespace Bunker.Models;

public enum BunkerIntelMode
{
    AllVisible,
    Progressive,
    EventsOnly
}

public sealed class BunkerIntelState
{
    public BunkerIntelMode Mode { get; set; } = BunkerIntelMode.Progressive;
    public int FirstRevealAfterRound { get; set; } = 2;
    public int IntervalRounds { get; set; } = 2;
    public int? LastProgressiveRevealRound { get; set; }
    public HashSet<string> PublicCategories { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, HashSet<string>> PublicItemIds { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, HashSet<string>> PrivateCategoriesByPlayerId { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, Dictionary<string, HashSet<string>>> PrivateItemIdsByPlayerId { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
    public int ListRoundRobinIndex { get; set; }
    public HashSet<string> ProcessedCommandIds { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
}

public sealed record BunkerIntelProjectionDto(
    string Id,
    string Name,
    string Description,
    int Capacity,
    string Location,
    string? Condition,
    int? SuppliesMonths,
    int? WaterMonths,
    IReadOnlyList<string>? Facilities,
    IReadOnlyList<string>? Resources,
    IReadOnlyList<string>? Problems,
    IReadOnlyDictionary<string, string> Visibility,
    string Mode,
    string? ImageUrl);
