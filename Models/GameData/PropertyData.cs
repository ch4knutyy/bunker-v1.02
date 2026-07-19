using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bunker.Models.GameData;

public sealed class PropertyDefinition
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("item")]
    public string Item { get; set; } = "";

    [JsonPropertyName("category")]
    public string Category { get; set; } = "";

    [JsonPropertyName("sizeClass")]
    public string SizeClass { get; set; } = "";

    [JsonPropertyName("conditionProfile")]
    public string ConditionProfile { get; set; } = "";

    [JsonPropertyName("_i18n")]
    public PropertyLocalization I18n { get; set; } = new();

    [JsonPropertyName("randomProperties")]
    public List<PropertyRandomFieldDefinition> RandomProperties { get; set; } = new();

    [JsonPropertyName("displayTemplate")]
    public Dictionary<string, string> DisplayTemplate { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    [JsonPropertyName("displayFields")]
    public List<PropertyDisplayFieldDefinition> DisplayFields { get; set; } = new();

    [JsonPropertyName("resourceTags")]
    public List<string> ResourceTags { get; set; } = new();

    [JsonPropertyName("protectionTags")]
    public List<string> ProtectionTags { get; set; } = new();

    [JsonPropertyName("threatUsage")]
    public Dictionary<string, JsonElement>? ThreatUsage { get; set; }
}

public sealed class PropertyDisplayFieldDefinition
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = "";

    [JsonPropertyName("source")]
    public string? Source { get; set; }

    [JsonPropertyName("label")]
    public Dictionary<string, string> Label { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    [JsonPropertyName("valueTemplate")]
    public Dictionary<string, string> ValueTemplate { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class PropertyLocalization
{
    [JsonPropertyName("item")]
    public Dictionary<string, string> Item { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    [JsonPropertyName("category")]
    public Dictionary<string, string> Category { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class PropertyRandomFieldDefinition
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("min")]
    public int Min { get; set; }

    [JsonPropertyName("max")]
    public int Max { get; set; }

    [JsonPropertyName("unit")]
    public Dictionary<string, string> Unit { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    [JsonPropertyName("weightsFromProfile")]
    public bool WeightsFromProfile { get; set; }
}

public sealed class PropertyConditionProfile
{
    [JsonPropertyName("weights")]
    public Dictionary<string, int> Weights { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    [JsonPropertyName("values")]
    public Dictionary<string, Dictionary<string, string>> Values { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
}

public sealed class PropertyDataRoot
{
    [JsonPropertyName("_conditionProfiles")]
    public Dictionary<string, PropertyConditionProfile> ConditionProfiles { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);

    [JsonPropertyName("property")]
    public List<PropertyDefinition> Properties { get; set; } = new();
}
