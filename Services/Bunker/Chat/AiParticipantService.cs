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
            player.AiBehaviorProfile = AiBehaviorProfileFactory.Create(player, preset.Motivation);
            if (!rooms.TryAddAiPlayer(room, player)) break;
            var companion = new AiChatCompanion { Id = player.StablePlayerId, Name = player.Name, Motivation = preset.Motivation, PlayerStableId = player.StablePlayerId, Provider = player.AiProvider, Model = player.AiModel, BehavioralProfile = player.AiBehaviorProfile, SocialMemory = player.AiSocialMemory, Relationships = player.AiRelationships };
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

public static class AiBehaviorProfileFactory
{
    public static AiBehaviorProfile Ensure(Player player, string? motivation = null)
    {
        if (player.AiBehaviorProfile != null) return player.AiBehaviorProfile;
        return player.AiBehaviorProfile = Create(player, motivation ?? "Protect a place in the bunker.");
    }

    public static AiBehaviorProfile Create(Player player, string motivation)
    {
        var trait = player.CharacterTrait?.Name ?? "";
        var mental = player.MentalHealth;
        var seed = StableSeed(player.StablePlayerId);
        var cautious = ContainsAny(trait, "обереж", "тривож", "cautious", "careful") || mental?.SocialImpact >= 7;
        var assertive = ContainsAny(trait, "смілив", "рішуч", "впевнен", "bold", "assertive");
        var distrustful = ContainsAny(trait, "підозр", "недовір", "skeptic", "suspicious");

        var profile = new AiBehaviorProfile
        {
            CommunicationStyle = cautious ? "careful" : assertive ? "direct" : distrustful ? "probing" : Pick(seed, "reflective", "plain-spoken", "diplomatic"),
            Confidence = Clamp((assertive ? 72 : cautious ? 38 : 55) + Offset(seed, 0)),
            Cooperation = Clamp((distrustful ? 32 : cautious ? 48 : 58) + Offset(seed, 1)),
            RiskTolerance = Clamp((cautious ? 27 : assertive ? 68 : 50) + Offset(seed, 2)),
            TrustDisposition = Clamp((distrustful ? 22 : cautious ? 38 : 55) + Offset(seed, 3)),
            ConflictStyle = cautious ? "de-escalating" : assertive ? "confronting" : distrustful ? "skeptical" : Pick(seed, "measured", "selective", "negotiating"),
            HonestyDisposition = distrustful ? "guarded" : assertive ? "strategic" : "pragmatic",
            Motivation = motivation,
            CurrentIntent = cautious ? "Reduce uncertainty before committing to anyone." :
                distrustful ? "Test claims before granting trust." :
                assertive ? "Make a strong case for a bunker place." :
                "Assess public evidence and protect a bunker place."
        };
        return profile;
    }

    private static bool ContainsAny(string value, params string[] parts) =>
        parts.Any(part => value.Contains(part, StringComparison.OrdinalIgnoreCase));
    private static int StableSeed(string value)
    {
        unchecked
        {
            var hash = 2166136261u;
            foreach (var character in value) { hash ^= character; hash *= 16777619; }
            return (int)(hash & 0x7fffffff);
        }
    }
    private static int Offset(int seed, int index) => ((seed >> (index * 5)) & 15) - 7;
    private static int Clamp(int value) => Math.Clamp(value, 0, 100);
    private static string Pick(int seed, params string[] values) => values[seed % values.Length];
}
