using Bunker.Models;
using System.Text.Json;

namespace Bunker.Services;

public sealed class RoomLocalEditorService(TimeProvider timeProvider)
{
    private sealed record FieldRule(string Category, string FieldId, string Label, int MaxLength);
    private static readonly IReadOnlyDictionary<string, FieldRule> Rules = new Dictionary<string, FieldRule>(StringComparer.OrdinalIgnoreCase)
    {
        ["bunker_name"] = new("bunker", "bunker_name", "Bunker name", 80),
        ["bunker_description"] = new("bunker", "bunker_description", "Bunker description", 500),
        ["bunker_location"] = new("bunker", "bunker_location", "Bunker location", 80),
        ["bunker_condition"] = new("bunker", "bunker_condition", "Bunker condition", 80),
        ["apocalypse_name"] = new("apocalypse", "apocalypse_name", "Apocalypse title", 80),
        ["apocalypse_description"] = new("apocalypse", "apocalypse_description", "Apocalypse description", 500),
        ["apocalypse_duration"] = new("apocalypse", "apocalypse_duration", "Apocalypse duration", 80),
        ["player_display_name"] = new("player", "player_display_name", "Player display name", 80),
        ["player_profession"] = new("player", "player_profession", "Profession", 80),
        ["player_physical_health"] = new("player", "player_physical_health", "Physical health", 80),
        ["player_mental_health"] = new("player", "player_mental_health", "Mental health", 80),
        ["player_hobby"] = new("player", "player_hobby", "Hobby", 80),
        ["player_character_trait"] = new("player", "player_character_trait", "Character trait", 80),
        ["player_phobia"] = new("player", "player_phobia", "Phobia", 80),
        ["player_fact"] = new("player", "player_fact", "Fact", 500)
    };
    private static readonly HashSet<string> BunkerConditions = new(StringComparer.OrdinalIgnoreCase) { "poor", "fair", "good", "excellent" };

    public RoomLocalEditorDataDto GetSafeData(Room room)
    {
        var bunker = room.Bunker == null ? [] : Rules.Values.Where(rule => rule.Category == "bunker")
            .Select(rule => ToField(rule, GetCurrentValue(room, null, rule.FieldId)!)).ToList();
        var apocalypse = room.Apocalypse == null ? [] : Rules.Values.Where(rule => rule.Category == "apocalypse")
            .Select(rule => ToField(rule, GetCurrentValue(room, null, rule.FieldId)!)).ToList();
        var players = RoomService.GetPlayersSnapshot(room).Select(entry =>
        {
            var player = entry.Value;
            var fields = Rules.Values.Where(rule => rule.Category == "player" && IsPlayerFieldPublic(player, rule.FieldId))
                .Select(rule => ToField(rule, GetCurrentValue(room, player, rule.FieldId)!)).ToList();
            return new RoomLocalEditorPlayerDto(SafePlayerId(player), player.Name, fields);
        }).ToList();
        return new(bunker, apocalypse, players, timeProvider.GetUtcNow());
    }

    public RoomLocalEditPreviewDto Preview(Room room, string? category, string? targetPlayerId, string? fieldId, string? proposedValue)
    {
        var now = timeProvider.GetUtcNow();
        if (!TryResolve(room, category, targetPlayerId, fieldId, proposedValue, out var rule, out var player, out var sanitized, out var current, out var error))
            return new(category ?? "", null, fieldId ?? "", "", "", false, false, false, error, now);
        var changed = !string.Equals(current, sanitized, StringComparison.Ordinal);
        return new(rule.Category, player == null ? null : SafePlayerId(player), rule.FieldId, rule.Label,
            sanitized, changed, changed, changed, changed ? null : "no_change", now);
    }

    public RoomLocalEditResult Apply(Room room, string? category, string? targetPlayerId, string? fieldId, string? proposedValue)
    {
        if (!TryResolve(room, category, targetPlayerId, fieldId, proposedValue, out var rule, out var player, out var value, out var current, out var error))
            return new(false, false, error, error);
        if (string.Equals(current, value, StringComparison.Ordinal)) return new(true, false, null, null);
        if (rule.Category == "bunker")
        {
            room.Bunker = JsonSerializer.Deserialize<BunkerInfo>(JsonSerializer.Serialize(room.Bunker))!;
            room.Bunker.I18n = null;
        }
        else if (rule.Category == "apocalypse")
        {
            room.Apocalypse = JsonSerializer.Deserialize<Apocalypse>(JsonSerializer.Serialize(room.Apocalypse))!;
            room.Apocalypse.I18n = null;
        }
        switch (rule.FieldId)
        {
            case "bunker_name": room.Bunker!.Name = value; break;
            case "bunker_description": room.Bunker!.Description = value; break;
            case "bunker_location": room.Bunker!.Location = value; break;
            case "bunker_condition": room.Bunker!.Condition = value.ToLowerInvariant(); break;
            case "apocalypse_name": room.Apocalypse!.Name = value; break;
            case "apocalypse_description": room.Apocalypse!.Description = value; break;
            case "apocalypse_duration": room.Apocalypse!.Duration = value; break;
            case "player_display_name": player!.Name = value; if (room.IsHost(player)) room.HostName = value; break;
            case "player_profession": player!.Profession.Name = value; break;
            case "player_physical_health": player!.PhysicalHealth.Name = value; break;
            case "player_mental_health": player!.MentalHealth.Name = value; break;
            case "player_hobby": player!.Hobby.Name = value; break;
            case "player_character_trait": player!.CharacterTrait.Name = value; break;
            case "player_phobia": player!.Phobia.Name = value; break;
            case "player_fact": player!.Fact.Name = value; break;
            default: return new(false, false, "field_not_allowed", "field_not_allowed");
        }
        return new(true, true, null, null);
    }

    private static bool TryResolve(Room room, string? category, string? targetPlayerId, string? fieldId, string? proposedValue,
        out FieldRule rule, out Player? player, out string sanitized, out string current, out string? error)
    {
        rule = null!; player = null; sanitized = ""; current = ""; error = null;
        if (string.IsNullOrWhiteSpace(fieldId) || !Rules.TryGetValue(fieldId, out var foundRule) || !string.Equals(foundRule.Category, category, StringComparison.OrdinalIgnoreCase)) { error = "field_not_allowed"; return false; }
        rule = foundRule;
        if (rule.Category == "bunker" && room.Bunker == null || rule.Category == "apocalypse" && room.Apocalypse == null) { error = "target_unavailable"; return false; }
        if (rule.Category == "player")
        {
            player = RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value).FirstOrDefault(item =>
                string.Equals(SafePlayerId(item), targetPlayerId, StringComparison.OrdinalIgnoreCase));
            if (player == null) { error = "player_not_found"; return false; }
            if (!IsPlayerFieldPublic(player, rule.FieldId)) { error = "characteristic_hidden"; return false; }
        }
        sanitized = Sanitize(proposedValue, rule.MaxLength);
        if (string.IsNullOrWhiteSpace(sanitized)) { error = "invalid_value"; return false; }
        if (rule.FieldId == "bunker_condition" && !BunkerConditions.Contains(sanitized)) { error = "invalid_value"; return false; }
        current = GetCurrentValue(room, player, rule.FieldId) ?? "";
        return true;
    }

    private static bool IsPlayerFieldPublic(Player player, string fieldId) => fieldId switch
    {
        "player_display_name" => true,
        "player_profession" => player.Revealed.Profession,
        "player_physical_health" => player.Revealed.PhysicalHealth,
        "player_mental_health" => player.Revealed.MentalHealth,
        "player_hobby" => player.Revealed.Hobby,
        "player_character_trait" => player.Revealed.CharacterTrait,
        "player_phobia" => player.Revealed.Phobia,
        "player_fact" => player.Revealed.Fact,
        _ => false
    };

    private static string? GetCurrentValue(Room room, Player? player, string fieldId) => fieldId switch
    {
        "bunker_name" => room.Bunker?.Name, "bunker_description" => room.Bunker?.Description,
        "bunker_location" => room.Bunker?.Location, "bunker_condition" => room.Bunker?.Condition,
        "apocalypse_name" => room.Apocalypse?.Name, "apocalypse_description" => room.Apocalypse?.Description,
        "apocalypse_duration" => room.Apocalypse?.Duration, "player_display_name" => player?.Name,
        "player_profession" => player?.Profession.Name, "player_physical_health" => player?.PhysicalHealth.Name,
        "player_mental_health" => player?.MentalHealth.Name, "player_hobby" => player?.Hobby.Name,
        "player_character_trait" => player?.CharacterTrait.Name, "player_phobia" => player?.Phobia.Name,
        "player_fact" => player?.Fact.Name, _ => null
    };
    private static RoomLocalEditorFieldDto ToField(FieldRule rule, string value) => new(rule.FieldId, rule.Label, value, rule.MaxLength);
    private static string SafePlayerId(Player player) => !string.IsNullOrWhiteSpace(player.StablePlayerId) ? player.StablePlayerId : player.Id.ToString("N");
    private static string Sanitize(string? value, int maxLength)
    {
        var clean = new string((value ?? "").Where(character => !char.IsControl(character)).ToArray()).Replace("<", "").Replace(">", "").Trim();
        return clean[..Math.Min(clean.Length, maxLength)];
    }
}
