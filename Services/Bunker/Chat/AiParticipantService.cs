using Bunker.Models;
using Microsoft.Extensions.Options;

namespace Bunker.Services;

public sealed class AiParticipantService(RoomService rooms, RoomChatService chat, CharacterGeneratorService generator, IOptions<AiChatOptions>? options = null)
{
    private static readonly (string Name, string Motivation)[] Defaults =
    [
        ("Марія", "Build alliances while protecting your chances of entering the bunker."),
        ("Олексій", "Question weak claims and negotiate for survival."),
        ("Ірина", "Compare public facts carefully before making a decision."),
        ("Данило", "Look for practical skills and challenge weak arguments.")
    ];

    public IReadOnlyList<AiChatCompanion> Add(Room room, int count)
    {
        var added = new List<AiChatCompanion>();
        for (var i = 0; i < Math.Clamp(count, 0, room.MaxPlayers); i++)
        {
            var preset = Defaults[(RoomService.GetPlayersSnapshot(room).Count(x => x.Value.IsAi) + i) % Defaults.Length];
            var name = preset.Name;
            var player = generator.Generate(name);
            player.IsAi = true;
            player.AiProvider = "Gemini";
            player.AiModel = options?.Value.GeminiModel?.Trim() ?? "";
            player.IsLobbyReady = true;
            player.StablePlayerId = "ai-" + Guid.NewGuid().ToString("N");
            player.GmRole = GmMode.PlayerHost;
            if (!rooms.TryAddAiPlayer(room, player)) break;
            var companion = new AiChatCompanion { Id = player.StablePlayerId, Name = player.Name, Motivation = preset.Motivation, PlayerStableId = player.StablePlayerId, Provider = player.AiProvider, Model = player.AiModel };
            if (!chat.AddCompanion(room.Id, companion)) { rooms.TryRemoveAiPlayer(room, player.StablePlayerId, out _); break; }
            added.Add(companion);
        }
        return added;
    }

    public bool Remove(Room room, string stablePlayerId)
    {
        if (!rooms.TryRemoveAiPlayer(room, stablePlayerId, out _)) return false;
        chat.RemoveCompanionForPlayer(room.Id, stablePlayerId);
        return true;
    }
}
