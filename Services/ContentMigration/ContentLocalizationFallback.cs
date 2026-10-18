using Bunker.Data.ContentPersistence.Entities;

namespace Bunker.Services.ContentMigration;

/// <summary>
/// Defines the localization selection policy for a future database-backed content reader.
/// Phase 1 does not register or use this policy in the live JSON loader.
/// </summary>
public static class ContentLocalizationFallback
{
    public static string? ResolvePayload(
        IEnumerable<ContentLocalizationEntity> localizations,
        string? requestedLanguage)
    {
        var byLanguage = localizations
            .GroupBy(x => x.Language, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First().PayloadJson, StringComparer.OrdinalIgnoreCase);

        var normalized = string.IsNullOrWhiteSpace(requestedLanguage)
            ? "uk"
            : requestedLanguage.Trim().ToLowerInvariant();
        if (byLanguage.TryGetValue(normalized, out var requested)) return requested;
        if (byLanguage.TryGetValue("uk", out var ukrainian)) return ukrainian;
        return byLanguage.OrderBy(x => x.Key, StringComparer.Ordinal).Select(x => x.Value).FirstOrDefault();
    }
}
