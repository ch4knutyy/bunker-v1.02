using System.Text.Json;

namespace Bunker.Models;

public sealed class GeneratedProperty
{
    public string DefinitionId { get; set; } = "";
    public Dictionary<string, int> GeneratedValues { get; set; } = new(StringComparer.Ordinal);
    public Dictionary<string, string> LocalizedDisplay { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, PropertyPresentationDto> LocalizedPresentation { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
    public string Category { get; set; } = "";
    public string SizeClass { get; set; } = "";
    public List<string> ResourceTags { get; set; } = new();
    public List<string> ProtectionTags { get; set; } = new();
    public Dictionary<string, JsonElement>? ThreatUsage { get; set; }

    public string GetDisplayText(string? language)
    {
        var normalized = string.IsNullOrWhiteSpace(language) ? "uk" : language.Trim().ToLowerInvariant();
        return LocalizedDisplay.TryGetValue(normalized, out var localized) && !string.IsNullOrWhiteSpace(localized)
            ? localized
            : LocalizedDisplay.TryGetValue("uk", out var fallback) ? fallback : "";
    }
}

public sealed record PropertyPresentationDto(
    string Title,
    IReadOnlyList<PropertyPresentationDetailDto> Details);

public sealed record PropertyPresentationDetailDto(
    string Key,
    string Label,
    string Value);
