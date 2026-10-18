using Bunker.Services;
using Bunker.Models;
using Bunker.Models.Сharacteristics;

namespace Bunker.UnitTests.Services;

public sealed class RoomChatServiceTests
{
    [Fact]
    public void Messages_are_room_scoped_idempotent_and_rate_limited()
    {
        var service = new RoomChatService(TimeProvider.System);

        Assert.True(service.TryAddHumanMessage("A", "p1", "Alice", "<script>alert(1)</script>", "m1", out var message, out _));
        Assert.Equal("<script>alert(1)</script>", message!.Text);
        Assert.Empty(service.GetHistory("B"));
        Assert.False(service.TryAddHumanMessage("A", "p1", "Alice", "again", "m1", out _, out var duplicate));
        Assert.Equal("chat_message_duplicate", duplicate);
        Assert.False(service.TryAddHumanMessage("A", "p1", "Alice", "again", "m2", out _, out var limited));
        Assert.Equal("chat_rate_limited", limited);
    }

    [Fact]
    public void Knowledge_contains_own_private_data_and_only_currently_revealed_other_data()
    {
        var room = RoomWithPlayer("human", "Human", "Profession", "Visible doctor");
        var hidden = new Player { Name = "Hidden", StablePlayerId = "hidden", PhysicalHealth = new PhysicalHealth { Name = "Hidden diagnosis" } };
        room.Players["hidden-connection"] = hidden;
        var companion = AddAi(room, "AI", "ai", "AI private profession");

        var knowledge = new AiChatContextBuilder(new BunkerIntelService()).BuildKnowledge(room, companion, []);

        Assert.Equal("AI private profession", knowledge.OwnCharacteristics["profession"]);
        Assert.Contains("AI secret card", System.Text.Json.JsonSerializer.Serialize(knowledge.OwnSpecialCards));
        Assert.Equal("Visible doctor", knowledge.PublicPlayers.Single(player => player.Id == "human").RevealedCharacteristics["Profession"]);
        Assert.Empty(knowledge.PublicPlayers.Single(player => player.Id == "hidden").RevealedCharacteristics);
        Assert.DoesNotContain("Hidden diagnosis", System.Text.Json.JsonSerializer.Serialize(knowledge));
    }

    [Fact]
    public void Knowledge_keeps_only_observed_public_fact_after_it_is_hidden()
    {
        var room = RoomWithPlayer("human", "Human", "Profession", "Observed profession");
        var first = AddAi(room, "First", "ai-first", "Private first");
        var second = AddAi(room, "Second", "ai-second", "Private second");
        var builder = new AiChatContextBuilder(new BunkerIntelService());

        builder.BuildKnowledge(room, first, []);
        GmPlayerStateMutator.HideCharacteristic(room.Players["human-connection"], "Profession");
        var afterHide = builder.BuildKnowledge(room, first, []);
        var neverObserved = builder.BuildKnowledge(room, second, []);

        Assert.Empty(afterHide.PublicPlayers.Single(player => player.Id == "human").RevealedCharacteristics);
        Assert.Contains(afterHide.ObservedPublicFacts.Values, value => value == "Observed profession");
        Assert.DoesNotContain(neverObserved.ObservedPublicFacts.Values, value => value == "Observed profession");
    }

    [Fact]
    public void Knowledge_excludes_unrevealed_threat_data_and_never_mutates_game_state()
    {
        var room = RoomWithPlayer("human", "Human", "Profession", "Visible doctor");
        room.CurrentThreat = new Bunker.Models.GameData.ThreatData { Name = "Hidden future threat" };
        room.IsThreatRevealed = false;
        room.ActiveDeveloperPlayerId = "gm-only-value";
        var companion = AddAi(room, "AI", "ai", "Private");
        var playerCount = room.Players.Count;

        var knowledge = new AiChatContextBuilder(new BunkerIntelService()).BuildKnowledge(room, companion, []);

        Assert.DoesNotContain("Hidden future threat", System.Text.Json.JsonSerializer.Serialize(knowledge));
        Assert.DoesNotContain("gm-only-value", System.Text.Json.JsonSerializer.Serialize(knowledge));
        Assert.Equal(playerCount, room.Players.Count);
        Assert.Null(room.CurrentVoting);
    }

    private static Room RoomWithPlayer(string stableId, string name, string characteristic, string value)
    {
        var player = new Player { Name = name, StablePlayerId = stableId, ConnectionId = stableId + "-connection" };
        player.Revealed.RevealedValues[characteristic] = new RevealedData { Value = value };
        return new Room { Players = new Dictionary<string, Player> { [player.ConnectionId] = player } };
    }

    private static AiChatCompanion AddAi(Room room, string name, string stableId, string profession)
    {
        var player = new Player { Name = name, StablePlayerId = stableId, ConnectionId = RoomService.AiConnectionKey(stableId), IsAi = true,
            Profession = new Profession { Name = profession }, SpecialCards = [new SpecialCard { Name = "AI secret card" }] };
        room.Players[player.ConnectionId] = player;
        return new AiChatCompanion { Id = stableId, Name = name, PlayerStableId = stableId };
    }
}
