using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services;

public sealed class ApocalypseSelectionService(GameDataService gameData)
{
    public IReadOnlyList<string> ValidateSettings(RoomGameSettings settings)
    {
        var errors = new List<string>();
        if (!Enum.IsDefined(settings.ApocalypseSelectionMode)) errors.Add("invalid_apocalypse_selection_mode");
        if (settings.InteractiveApocalypseChancePercent is < 0 or > 100) errors.Add("invalid_apocalypse_interactive_chance");
        if (!settings.ApocalypseEnabled) return errors;

        var categories = settings.AllowedApocalypseCategoryIds ?? [];
        var pool = settings.ApocalypseCustomPoolIds ?? [];
        if (settings.ApocalypseSelectionMode == ApocalypseSelectionMode.RandomCategories)
        {
            AddDuplicateErrors(categories, "apocalypse_category_duplicate", errors);
            if (categories.Count == 0) errors.Add("apocalypse_categories_empty");
            if (categories.Any(id => gameData.GetApocalypseCategoryById(id) == null)) errors.Add("apocalypse_category_unknown");
        }
        if (settings.ApocalypseSelectionMode == ApocalypseSelectionMode.CustomPool)
        {
            AddDuplicateErrors(pool, "apocalypse_pool_duplicate", errors);
            if (pool.Count == 0) errors.Add("apocalypse_pool_empty");
            if (pool.Any(id => gameData.FindApocalypseById(id) == null)) errors.Add("apocalypse_id_unknown");
        }
        if (settings.ApocalypseSelectionMode == ApocalypseSelectionMode.Specific)
        {
            var specific = string.IsNullOrWhiteSpace(settings.SelectedApocalypseId)
                ? null : gameData.FindApocalypseById(settings.SelectedApocalypseId);
            if (specific == null) errors.Add("apocalypse_specific_missing");
            else if (specific.Gameplay?.Interactive == true && !settings.AllowInteractiveApocalypses)
                errors.Add("apocalypse_interactive_unavailable");
            return errors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        if (errors.Count > 0) return errors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var candidates = BuildCandidates(settings);
        if (candidates.Count == 0) errors.Add("apocalypse_candidate_set_empty");
        var ordinary = candidates.Count(item => item.Gameplay?.Interactive != true);
        var interactive = candidates.Count - ordinary;
        if (!settings.AllowInteractiveApocalypses && ordinary == 0) errors.Add("apocalypse_candidate_set_empty");
        if (settings.AllowInteractiveApocalypses && settings.InteractiveApocalypseChancePercent == 100 && interactive == 0)
            errors.Add("apocalypse_interactive_unavailable");
        if (settings.InteractiveApocalypseChancePercent == 0 && ordinary == 0)
            errors.Add("apocalypse_only_interactive_candidates");
        if (settings.AllowInteractiveApocalypses && settings.InteractiveApocalypseChancePercent is > 0 and < 100)
        {
            if (interactive == 0) errors.Add("apocalypse_interactive_unavailable");
            if (ordinary == 0) errors.Add("apocalypse_only_interactive_candidates");
        }
        return errors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    public Apocalypse? ResolveForStart(Room room, RoomGameSettings frozenSettings, Func<int, int> next)
    {
        if (!frozenSettings.ApocalypseEnabled) { room.Apocalypse = null; return null; }
        if (room.Apocalypse != null) return room.Apocalypse;
        var errors = ValidateSettings(frozenSettings);
        if (errors.Count > 0) throw new InvalidDataException($"Apocalypse settings are invalid: {string.Join(", ", errors)}");
        room.Apocalypse = SelectCandidate(frozenSettings, next);
        return room.Apocalypse;
    }

    public Apocalypse SelectCandidate(RoomGameSettings settings, Func<int, int> next)
    {
        if (settings.ApocalypseSelectionMode == ApocalypseSelectionMode.Specific)
            return gameData.FindApocalypseById(settings.SelectedApocalypseId!)!;
        var candidates = BuildCandidates(settings);
        var ordinary = candidates.Where(item => item.Gameplay?.Interactive != true).ToList();
        var interactive = candidates.Where(item => item.Gameplay?.Interactive == true).ToList();
        var selectedGroup = !settings.AllowInteractiveApocalypses
            ? ordinary
            : next(100) < settings.InteractiveApocalypseChancePercent ? interactive : ordinary;
        return selectedGroup[next(selectedGroup.Count)];
    }

    public ApocalypseSelectionPreviewDto BuildPreview(RoomGameSettings settings, string language = "uk")
    {
        var candidates = settings.ApocalypseEnabled ? BuildCandidates(settings) : [];
        var specific = settings.ApocalypseSelectionMode == ApocalypseSelectionMode.Specific
            ? gameData.FindApocalypseById(settings.SelectedApocalypseId ?? "") : null;
        return new(settings.ApocalypseSelectionMode.ToString(), candidates.Count,
            candidates.Count(item => item.Gameplay?.Interactive != true), candidates.Count(item => item.Gameplay?.Interactive == true),
            settings.AllowedApocalypseCategoryIds?.Count ?? 0, settings.ApocalypseCustomPoolIds?.Count ?? 0,
            settings.InteractiveApocalypseChancePercent, specific == null ? null : ToOption(specific, language),
            candidates.GroupBy(item => item.CategoryId, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase));
    }

    public LobbyApocalypseCatalogDto BuildCatalog(RoomGameSettings settings, string language)
    {
        language = language is "en" or "ru" ? language : "uk";
        var categories = gameData.ApocalypseCategories.Select(category =>
        {
            var items = gameData.Apocalypses.Where(item => string.Equals(item.CategoryId, category.Id, StringComparison.OrdinalIgnoreCase)).ToList();
            return new LobbyApocalypseCategoryDto(category.Id, Localized(category.I18n, "name", language, category.Id),
                Localized(category.I18n, "description", language, ""), category.VisualThemeId, items.Count,
                items.Count(item => item.Gameplay?.Interactive != true), items.Count(item => item.Gameplay?.Interactive == true));
        }).ToList();
        return new(categories, gameData.Apocalypses.Select(item => ToOption(item, language)).ToList(),
            new(settings.ApocalypseSelectionMode.ToString(), settings.SelectedApocalypseId,
                (settings.AllowedApocalypseCategoryIds ?? []).ToList().AsReadOnly(),
                (settings.ApocalypseCustomPoolIds ?? []).ToList().AsReadOnly(), settings.AllowInteractiveApocalypses,
                settings.InteractiveApocalypseChancePercent, settings.ApocalypseThemeEnabled), BuildPreview(settings, language));
    }

    private List<Apocalypse> BuildCandidates(RoomGameSettings settings) => settings.ApocalypseSelectionMode switch
    {
        ApocalypseSelectionMode.RandomAll => gameData.Apocalypses.ToList(),
        ApocalypseSelectionMode.RandomCategories => gameData.Apocalypses.Where(item =>
            (settings.AllowedApocalypseCategoryIds ?? []).Contains(item.CategoryId, StringComparer.OrdinalIgnoreCase)).ToList(),
        ApocalypseSelectionMode.Specific => gameData.FindApocalypseById(settings.SelectedApocalypseId ?? "") is { } item ? [item] : [],
        ApocalypseSelectionMode.CustomPool => (settings.ApocalypseCustomPoolIds ?? []).Select(gameData.FindApocalypseById).Where(item => item != null).Cast<Apocalypse>().ToList(),
        _ => []
    };

    private static void AddDuplicateErrors(IEnumerable<string> values, string code, List<string> errors)
    {
        if (values.Where(value => !string.IsNullOrWhiteSpace(value)).GroupBy(value => value, StringComparer.OrdinalIgnoreCase).Any(group => group.Count() > 1)) errors.Add(code);
    }

    private static LobbyApocalypseOptionDto ToOption(Apocalypse item, string language) => new(item.Id,
        Localized(item.I18n, "name", language, item.Name), Trim(Localized(item.I18n, "description", language, item.Description), 180),
        item.CategoryId, item.VisualThemeId, item.Severity, item.SurvivalChance,
        Localized(item.I18n, "duration", language, item.Duration), item.Gameplay?.Interactive == true, SafeLocalUrl(item.ImageUrl));

    private static string Localized(Dictionary<string, JsonElement>? i18n, string field, string language, string fallback)
    {
        if (i18n != null && i18n.TryGetValue(field, out var values) && values.ValueKind == JsonValueKind.Object)
        {
            foreach (var key in new[] { language, "uk" })
                if (values.TryGetProperty(key, out var text) && text.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(text.GetString())) return text.GetString()!;
        }
        return fallback;
    }
    private static string Trim(string value, int max) => value.Length <= max ? value : value[..max].TrimEnd() + "…";
    private static string? SafeLocalUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var url = value.Trim().Replace('\\', '/');
        return url.StartsWith('/') && !url.StartsWith("//") && !url.Contains("..") && !url.Contains(':') ? url : null;
    }
}
