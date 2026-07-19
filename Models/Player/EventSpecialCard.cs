namespace Bunker.Models;

public sealed class EventSpecialCard
{
    public string RuntimeCardId { get; set; } = Guid.NewGuid().ToString("N");
    public string DefinitionId { get; set; } = "";
    public string SourceScenarioId { get; set; } = "";
    public string OwnerPlayerId { get; set; } = "";
    public int GrantedAtRound { get; set; }
    public int? ExpiresAfterRound { get; set; }
    public int RemainingUses { get; set; } = 1;
    public bool IsRevealedPublicly { get; set; }
    public StoredScenarioResource? StoredResource { get; set; }
    public DateTimeOffset GrantedAtUtc { get; set; }
    public HashSet<string> ProcessedCommandIds { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
    public List<Profession> PendingProfessionOptions { get; set; } = [];
    public Dictionary<string, string> Title { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> Description { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public System.Text.Json.JsonElement Actions { get; set; }
}

public sealed record StoredScenarioResource(string Type, int Amount);

public sealed class PrivateInspectedFact
{
    public string FactId { get; set; } = Guid.NewGuid().ToString("N");
    public string SourceScenarioId { get; set; } = "";
    public string TargetPlayerId { get; set; } = "";
    public string CharacteristicType { get; set; } = "";
    public string Value { get; set; } = "";
    public DateTimeOffset InspectedAtUtc { get; set; }
}
