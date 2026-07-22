using System.Text.RegularExpressions;

namespace Bunker.Models;

public static class ApocalypseVisualMetadata
{
    private static readonly Regex ModifierIdPattern =
        new("^[a-z0-9]+(?:-[a-z0-9]+)*$", RegexOptions.CultureInvariant);

    public static IReadOnlySet<string> AllowedModifierIds { get; } =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "frost", "heat", "drought", "flood", "storm", "fog", "ash", "darkness",
            "air-hazard", "cosmic-impact", "infection", "spores", "radiation", "toxic",
            "nanotech", "parasite", "allergens", "mutation", "swarm", "structural-damage",
            "unrest", "machine", "emp", "psychological", "reality-fracture",
            "vegetation-collapse", "identity-shift", "communication-failure", "undead",
            "blackout", "resource-scarcity"
        };

    public static bool HasSafeSyntax(string value) => ModifierIdPattern.IsMatch(value);

    public static IReadOnlyList<string> Normalize(IEnumerable<string>? values) =>
        (values ?? Array.Empty<string>())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim().ToLowerInvariant())
            .Where(value => HasSafeSyntax(value) && AllowedModifierIds.Contains(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(3)
            .ToArray();
}
