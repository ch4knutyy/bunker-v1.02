using Bunker.Models;

namespace Bunker.Services;

public sealed record BunkerIntelRevealResult(
    bool Success,
    string? Category,
    string? ItemId,
    string Visibility,
    string? PlayerId);

public sealed class BunkerIntelService
{
    private static readonly string[] ScalarOrder = ["condition", "food", "water"];
    private static readonly string[] ListOrder = ["facilities", "resources", "problems"];

    public BunkerIntelState InitializeForNewGame(RoomGameSettings settings) => new()
    {
        Mode = ScenarioRules.BunkerIntelEnabled
            ? settings.BunkerIntelMode ?? BunkerIntelMode.Progressive
            : BunkerIntelMode.AllVisible,
        FirstRevealAfterRound = 2,
        IntervalRounds = Math.Clamp(settings.BunkerIntelIntervalRounds, 1, 3)
    };

    public object? Project(Room room, Player? viewer, bool elevatedPrivateAccess = false)
    {
        var bunker = room.Bunker;
        if (bunker == null) return null;
        var state = room.BunkerIntel;
        var allVisible = !ScenarioRules.BunkerIntelEnabled ||
                         state == null ||
                         state.Mode == BunkerIntelMode.AllVisible ||
                         elevatedPrivateAccess;
        var playerId = viewer?.Id.ToString("N");

        bool HasCategory(string category) =>
            allVisible ||
            state!.PublicCategories.Contains(category) ||
            playerId != null && state.PrivateCategoriesByPlayerId.TryGetValue(playerId, out var privateCategories) &&
            privateCategories.Contains(category);

        IReadOnlyList<string>? ProjectList(string category, IReadOnlyList<string> values)
        {
            if (HasCategory(category)) return values.ToList();
            var visibleIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (state!.PublicItemIds.TryGetValue(category, out var publicIds)) visibleIds.UnionWith(publicIds);
            if (playerId != null &&
                state.PrivateItemIdsByPlayerId.TryGetValue(playerId, out var privateByCategory) &&
                privateByCategory.TryGetValue(category, out var privateIds))
                visibleIds.UnionWith(privateIds);
            return values.Select((value, index) => (value, id: ItemId(category, index)))
                .Where(item => visibleIds.Contains(item.id))
                .Select(item => item.value)
                .ToList();
        }

        string VisibilityFor(string category, int totalItems = 1)
        {
            if (allVisible || state!.PublicCategories.Contains(category)) return "public";
            var publicCount = state.PublicItemIds.GetValueOrDefault(category)?.Count ?? 0;
            var privateCategory = playerId != null &&
                                  state.PrivateCategoriesByPlayerId.GetValueOrDefault(playerId)?.Contains(category) == true;
            var privateCount = playerId != null &&
                               state.PrivateItemIdsByPlayerId.GetValueOrDefault(playerId)?.GetValueOrDefault(category)?.Count > 0;
            if (privateCategory || privateCount) return publicCount > 0 ? "partial" : "private";
            return publicCount > 0 && publicCount < totalItems ? "partial" : publicCount > 0 ? "public" : "hidden";
        }

        var facilities = ProjectList("facilities", bunker.Facilities);
        var resources = ProjectList("resources", bunker.Resources);
        var problems = ProjectList("problems", bunker.Problems);
        return new BunkerIntelProjectionDto(
            bunker.Id,
            bunker.Name,
            bunker.Description,
            bunker.Capacity,
            bunker.Location,
            HasCategory("condition") ? bunker.Condition : null,
            HasCategory("food") ? bunker.SuppliesMonths : null,
            HasCategory("water") ? bunker.WaterMonths : null,
            facilities,
            resources,
            problems,
            new Dictionary<string, string>
            {
                ["condition"] = VisibilityFor("condition"),
                ["food"] = VisibilityFor("food"),
                ["water"] = VisibilityFor("water"),
                ["facilities"] = VisibilityFor("facilities", bunker.Facilities.Count),
                ["resources"] = VisibilityFor("resources", bunker.Resources.Count),
                ["problems"] = VisibilityFor("problems", bunker.Problems.Count)
            },
            (state?.Mode ?? BunkerIntelMode.AllVisible) switch
            {
                BunkerIntelMode.AllVisible => "all_visible",
                BunkerIntelMode.EventsOnly => "events_only",
                _ => "progressive"
            },
            bunker.ImageUrl);
    }

    public BunkerIntelRevealResult RevealNextPublic(Room room, int completedRound, bool force = false)
    {
        if (!ScenarioRules.BunkerIntelEnabled)
            return new(false, null, null, "public", null);
        var state = room.BunkerIntel;
        if (state == null || state.Mode != BunkerIntelMode.Progressive || room.Bunker == null)
            return new(false, null, null, "public", null);
        if (!force)
        {
            if (completedRound + 1 < state.FirstRevealAfterRound) return new(false, null, null, "public", null);
            if (state.LastProgressiveRevealRound is { } last && completedRound + 1 - last < state.IntervalRounds)
                return new(false, null, null, "public", null);
        }

        foreach (var category in ScalarOrder)
        {
            if (state.PublicCategories.Add(category))
            {
                state.LastProgressiveRevealRound = completedRound + 1;
                return new(true, category, null, "public", null);
            }
        }

        for (var attempt = 0; attempt < ListOrder.Length; attempt++)
        {
            var index = (state.ListRoundRobinIndex + attempt) % ListOrder.Length;
            var category = ListOrder[index];
            var values = GetList(room.Bunker, category);
            var ids = GetOrCreate(state.PublicItemIds, category);
            var next = Enumerable.Range(0, values.Count)
                .Select(itemIndex => ItemId(category, itemIndex))
                .FirstOrDefault(itemId => !ids.Contains(itemId));
            if (next == null) continue;
            ids.Add(next);
            if (ids.Count >= values.Count) state.PublicCategories.Add(category);
            state.ListRoundRobinIndex = (index + 1) % ListOrder.Length;
            state.LastProgressiveRevealRound = completedRound + 1;
            return new(true, category, next, "public", null);
        }
        return new(false, null, null, "public", null);
    }

    public BunkerIntelRevealResult RevealPublic(Room room, string category, string scopePolicy = "entire_category")
    {
        if (!ScenarioRules.BunkerIntelEnabled)
            return new(false, null, null, "public", null);
        var state = room.BunkerIntel;
        if (state == null || room.Bunker == null || !IsCategory(category))
            return new(false, null, null, "public", null);
        if (IsScalar(category) || scopePolicy == "entire_category")
        {
            state.PublicCategories.Add(category);
            return new(true, category, null, "public", null);
        }
        var values = GetList(room.Bunker, category);
        var ids = GetOrCreate(state.PublicItemIds, category);
        var next = Enumerable.Range(0, values.Count).Select(index => ItemId(category, index))
            .FirstOrDefault(id => !ids.Contains(id));
        if (next == null) return new(false, category, null, "public", null);
        ids.Add(next);
        if (ids.Count == values.Count) state.PublicCategories.Add(category);
        return new(true, category, next, "public", null);
    }

    public BunkerIntelRevealResult RevealPrivate(Room room, Player player, string category, string scopePolicy = "entire_category")
    {
        if (!ScenarioRules.BunkerIntelEnabled)
            return new(false, null, null, "private", player.Id.ToString("N"));
        var state = room.BunkerIntel;
        if (state == null || room.Bunker == null || !IsCategory(category))
            return new(false, null, null, "private", player.Id.ToString("N"));
        var playerId = player.Id.ToString("N");
        if (IsScalar(category) || scopePolicy == "entire_category")
        {
            GetOrCreate(state.PrivateCategoriesByPlayerId, playerId).Add(category);
            return new(true, category, null, "private", playerId);
        }
        var byCategory = GetOrCreate(state.PrivateItemIdsByPlayerId, playerId);
        var ids = GetOrCreate(byCategory, category);
        var values = GetList(room.Bunker, category);
        var next = Enumerable.Range(0, values.Count).Select(index => ItemId(category, index))
            .FirstOrDefault(id => !ids.Contains(id) && !(state.PublicItemIds.GetValueOrDefault(category)?.Contains(id) ?? false));
        if (next == null) return new(false, category, null, "private", playerId);
        ids.Add(next);
        return new(true, category, next, "private", playerId);
    }

    public BunkerIntelRevealResult RevealRandomPrivate(Room room, Player player)
    {
        if (!ScenarioRules.BunkerIntelEnabled)
            return new(false, null, null, "private", player.Id.ToString("N"));
        var hidden = new[] { "condition", "food", "water", "facilities", "resources", "problems" }
            .Where(category => HasHiddenUnit(room, player, category))
            .ToList();
        if (hidden.Count == 0) return new(false, null, null, "private", player.Id.ToString("N"));
        var selected = hidden[Random.Shared.Next(hidden.Count)];
        return RevealPrivate(room, player, selected,
            IsScalar(selected) ? "entire_category" : "next_hidden_item");
    }

    public static int CountHiddenUnits(Room room)
    {
        if (!ScenarioRules.BunkerIntelEnabled) return 0;
        if (room.Bunker == null || room.BunkerIntel == null) return 0;
        var state = room.BunkerIntel;
        var scalar = ScalarOrder.Count(category => !state.PublicCategories.Contains(category));
        var lists = ListOrder.Sum(category => Math.Max(0,
            GetList(room.Bunker, category).Count - (state.PublicItemIds.GetValueOrDefault(category)?.Count ?? 0)));
        return scalar + lists;
    }

    public IReadOnlyList<string> GetHiddenCategories(Room room, Player? player = null)
    {
        if (!ScenarioRules.BunkerIntelEnabled) return [];
        var categories = new[] { "condition", "food", "water", "facilities", "resources", "problems" };
        if (player != null) return categories.Where(category => HasHiddenUnit(room, player, category)).ToList();
        if (room.Bunker == null || room.BunkerIntel == null) return [];
        return categories.Where(category =>
        {
            if (room.BunkerIntel.PublicCategories.Contains(category)) return false;
            if (IsScalar(category)) return true;
            return (room.BunkerIntel.PublicItemIds.GetValueOrDefault(category)?.Count ?? 0) <
                   GetList(room.Bunker, category).Count;
        }).ToList();
    }

    public bool IsPublic(Room room, string category) =>
        !ScenarioRules.BunkerIntelEnabled ||
        room.BunkerIntel == null ||
        room.BunkerIntel.Mode == BunkerIntelMode.AllVisible ||
        room.BunkerIntel.PublicCategories.Contains(category);

    private static bool HasHiddenUnit(Room room, Player player, string category)
    {
        var state = room.BunkerIntel;
        if (state == null || room.Bunker == null || state.PublicCategories.Contains(category)) return false;
        var playerId = player.Id.ToString("N");
        if (state.PrivateCategoriesByPlayerId.GetValueOrDefault(playerId)?.Contains(category) == true) return false;
        if (IsScalar(category)) return true;
        var known = state.PublicItemIds.GetValueOrDefault(category)?.Count ?? 0;
        known += state.PrivateItemIdsByPlayerId.GetValueOrDefault(playerId)?.GetValueOrDefault(category)?.Count ?? 0;
        return known < GetList(room.Bunker, category).Count;
    }

    private static bool IsCategory(string category) => ScalarOrder.Contains(category) || ListOrder.Contains(category);
    private static bool IsScalar(string category) => ScalarOrder.Contains(category);
    private static IReadOnlyList<string> GetList(BunkerInfo bunker, string category) => category switch
    {
        "facilities" => bunker.Facilities,
        "resources" => bunker.Resources,
        "problems" => bunker.Problems,
        _ => []
    };
    private static string ItemId(string category, int index) => $"{category}:{index}";
    private static HashSet<string> GetOrCreate(Dictionary<string, HashSet<string>> source, string key)
    {
        if (!source.TryGetValue(key, out var value))
            source[key] = value = new(StringComparer.OrdinalIgnoreCase);
        return value;
    }
    private static Dictionary<string, HashSet<string>> GetOrCreate(
        Dictionary<string, Dictionary<string, HashSet<string>>> source,
        string key)
    {
        if (!source.TryGetValue(key, out var value))
            source[key] = value = new(StringComparer.OrdinalIgnoreCase);
        return value;
    }
}
