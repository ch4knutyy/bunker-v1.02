using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bunker.Models;

public sealed class ApocalypseCategoryDefinition
{
    public string Id { get; set; } = "";
    public string VisualThemeId { get; set; } = "";

    [JsonPropertyName("_i18n")]
    public Dictionary<string, JsonElement>? I18n { get; set; }
}

public sealed class ApocalypseVisualThemeDefinition
{
    public string Id { get; set; } = "";
    public string CategoryId { get; set; } = "";
    public string CssClass { get; set; } = "";
    public string BackgroundVariant { get; set; } = "";
    public string OverlayVariant { get; set; } = "";
    public string FallbackThemeId { get; set; } = "";
}

public sealed class ApocalypseGameplayDefinition
{
    public int SchemaVersion { get; set; }
    public bool Interactive { get; set; }
    public string RuntimeStatus { get; set; } = "";
    public string EffectProfileId { get; set; } = "";
    public ApocalypseActivationDefinition? Activation { get; set; }
    public IReadOnlyList<ApocalypseEffectDefinition> Effects { get; set; } = Array.Empty<ApocalypseEffectDefinition>();
}

public sealed class ApocalypseActivationDefinition
{
    public string Mode { get; set; } = "";
    public string Trigger { get; set; } = "";
    public int FirstRound { get; set; }
    public int? IntervalRounds { get; set; }
    public int? MaxActivations { get; set; }
    public bool Configurable { get; set; }
    public IReadOnlyList<string> AllowedTriggers { get; set; } = Array.Empty<string>();
    public IReadOnlyList<int> AllowedFirstRounds { get; set; } = Array.Empty<int>();
    public IReadOnlyList<int> AllowedIntervalRounds { get; set; } = Array.Empty<int>();
    public bool AllowOneTime { get; set; }
}

public sealed class ApocalypseEffectDefinition
{
    public string Type { get; set; } = "";

    [JsonExtensionData]
    public Dictionary<string, JsonElement> Parameters { get; set; } = new();
}

public sealed class ApocalypseInteractiveSchemaDefinition
{
    public int Version { get; set; }
    public string RuntimeStatus { get; set; } = "";
    public bool DefaultInteractive { get; set; }
    public ApocalypseActivationContractDefinition? ActivationContract { get; set; }
    public IReadOnlyList<string> EffectTypesUsed { get; set; } = Array.Empty<string>();

    [JsonPropertyName("note_uk")]
    public string? NoteUk { get; set; }
}

public sealed class ApocalypseActivationContractDefinition
{
    public IReadOnlyList<string> SupportedModes { get; set; } = Array.Empty<string>();
    public IReadOnlyList<string> SupportedTriggers { get; set; } = Array.Empty<string>();
    public IReadOnlyList<int> AllowedFirstRounds { get; set; } = Array.Empty<int>();
    public IReadOnlyList<int> AllowedIntervalRounds { get; set; } = Array.Empty<int>();
    public bool ConfigurablePerLobby { get; set; }

    [JsonPropertyName("note_uk")]
    public string? NoteUk { get; set; }
}
