using System.Text.Json;
using System.Text.Json.Nodes;
using Bunker.Models;
using Bunker.Services;

namespace Bunker.Services.ContentMigration;

public sealed record ContentSemanticDifference(string Category, string Detail);

public static class ContentSemanticComparer
{
    public static IReadOnlyList<ContentSemanticDifference> Compare(
        GameDataService json,
        IScenarioContentRegistry scenarios,
        SqliteContentSnapshot sqlite)
    {
        var differences = new List<ContentSemanticDifference>();
        CompareCollection("hobbies", json.Hobbies, sqlite.Hobbies, differences);
        CompareCollection("professions", json.Professions, sqlite.Professions, differences);
        CompareCollection("mental_conditions", json.MentalConditions, sqlite.MentalConditions, differences);
        CompareCollection("physical_conditions", json.PhysicalConditions, sqlite.PhysicalConditions, differences);
        CompareCollection("items", json.Items, sqlite.Items, differences);
        CompareCollection("character_traits", json.CharacterTraits, sqlite.CharacterTraits, differences);
        CompareCollection("phobias", json.Phobias, sqlite.Phobias, differences);
        CompareCollection("facts", json.Facts, sqlite.Facts, differences);
        CompareCollection("apocalypses", json.Apocalypses, sqlite.Apocalypses, differences);
        CompareCollection("apocalypse_categories", json.ApocalypseCategories, sqlite.ApocalypseCategories, differences);
        CompareCollection("apocalypse_visual_themes", json.ApocalypseVisualThemes, sqlite.ApocalypseVisualThemes, differences);
        CompareCollection("bunkers", json.Bunkers, sqlite.Bunkers, differences);
        CompareCollection("threats", json.Threats, sqlite.Threats, differences);
        CompareCollection("special_cards", json.SpecialCards, sqlite.SpecialCards, differences);
        CompareCollection("properties", json.Properties, sqlite.Properties, differences);
        CompareCollection("scenario_events", scenarios.Events, sqlite.ScenarioEvents, differences);
        CompareCollection("event_special_cards", scenarios.Cards, sqlite.EventSpecialCards, differences);
        CompareValue("apocalypse_interactive_schema", json.ApocalypseInteractiveSchema, sqlite.ApocalypseInteractiveSchema, differences);
        CompareValue("property_condition_profiles", json.PropertyConditionProfiles, sqlite.PropertyConditionProfiles, differences);
        return differences;
    }

    private static void CompareCollection<T>(
        string category,
        IEnumerable<T> expected,
        IEnumerable<T> actual,
        ICollection<ContentSemanticDifference> differences)
    {
        var left = expected.Select(item => JsonNode.Parse(JsonSerializer.Serialize(item))).ToArray();
        var right = actual.Select(item => JsonNode.Parse(JsonSerializer.Serialize(item))).ToArray();
        if (left.Length != right.Length)
            differences.Add(new(category, $"count differs: json={left.Length}, sqlite={right.Length}"));
        foreach (var index in Enumerable.Range(0, Math.Min(left.Length, right.Length)))
            if (!JsonNode.DeepEquals(left[index], right[index]))
                differences.Add(new(category, $"semantic payload differs at index {index}"));
    }

    private static void CompareValue<T>(
        string category,
        T expected,
        T actual,
        ICollection<ContentSemanticDifference> differences)
    {
        if (!JsonNode.DeepEquals(
                JsonNode.Parse(JsonSerializer.Serialize(expected)),
                JsonNode.Parse(JsonSerializer.Serialize(actual))))
            differences.Add(new(category, "semantic payload differs"));
    }
}
