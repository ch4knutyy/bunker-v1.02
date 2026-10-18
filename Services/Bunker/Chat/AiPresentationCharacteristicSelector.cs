using Bunker.Models;

namespace Bunker.Services;

/// <summary>
/// Chooses a public presentation topic from canonical server state. It never reads or
/// exposes a characteristic value, and it never mutates reveal state.
/// </summary>
public sealed class AiPresentationCharacteristicSelector
{
    private static readonly string[] Priority =
    [
        "Profession", "Hobby", "CharacterTrait", "PhysicalHealth", "MentalHealth",
        "Inventory", "Fact", "Phobia", "Personality", "Body", "Property"
    ];

    public string Select(Room room, IReadOnlyCollection<string> participantStablePlayerIds)
    {
        var participants = RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value)
            .Where(player => participantStablePlayerIds.Contains(RoomService.GetPlayerKey(player), StringComparer.OrdinalIgnoreCase))
            .ToList();
        if (participants.Count == 0) return "Profession";

        return Priority
            .Where(key => room.ProfessionPresentationCompleted || key == "Profession")
            .OrderByDescending(key => participants.Count(player => !IsRevealed(player, key)))
            .ThenBy(key => Array.IndexOf(Priority, key))
            .First();
    }

    public string? SelectForPlayer(Room room, Player player, IReadOnlySet<string>? excludedKeys = null)
    {
        var available = Priority.Where(key => !IsRevealed(player, key) && (excludedKeys == null || !excludedKeys.Contains(key))).ToList();
        if (available.Count == 0 && excludedKeys is { Count: > 0 })
            available = Priority.Where(key => !IsRevealed(player, key)).ToList();
        if (available.Count == 0) return null;
        var offset = (StringComparer.Ordinal.GetHashCode(RoomService.GetPlayerKey(player)) & int.MaxValue) % Priority.Length;
        return Priority.Skip(offset).Concat(Priority.Take(offset)).First(available.Contains);
    }

    private static bool IsRevealed(Player player, string key) => key switch
    {
        "Personality" => player.Revealed.Personality,
        "Body" => player.Revealed.Body,
        "Profession" => player.Revealed.Profession,
        "PhysicalHealth" => player.Revealed.PhysicalHealth,
        "MentalHealth" => player.Revealed.MentalHealth,
        "Hobby" => player.Revealed.Hobby,
        "CharacterTrait" => player.Revealed.CharacterTrait,
        "Phobia" => player.Revealed.Phobia,
        "Inventory" => player.Revealed.Inventory,
        "Property" => player.Revealed.Property,
        "Fact" => player.Revealed.Fact,
        _ => true
    };
}
