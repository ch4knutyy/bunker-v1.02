using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class AiWorldContextServiceTests
{
    [Fact]
    public void Context_contains_only_revealed_world_facts_and_refreshes_after_change()
    {
        var player = new Player { Name = "AI", StablePlayerId = "ai", IsAi = true };
        var room = new Room
        {
            Id = "world-context",
            CurrentRound = 3,
            Apocalypse = new Apocalypse { Id = "winter", Name = "Nuclear winter", Description = "Radiation", Threats = ["fallout"] },
            Bunker = new BunkerInfo { Capacity = 4, Facilities = ["air filters"], Resources = ["water"], Problems = ["food shortage"] },
            CurrentThreat = new ThreatData { Id = "marauders", Name = "Hidden marauders", Description = "secret" }
        };
        room.Players["ai-connection"] = player;
        var service = new AiWorldContextService(new BunkerIntelService());

        var hidden = service.GetForAi(room, player);

        Assert.Null(hidden.Apocalypse);
        Assert.Empty(hidden.Threats);
        Assert.Contains("air filters", hidden.Bunker!.Advantages);

        room.ApocalypseRevealed = true;
        room.IsThreatRevealed = true;
        room.CurrentThreat = new ThreatData { Id = "leak", Name = "Radiation leak", Description = "Contain it", Severity = "high" };
        room.CurrentRound = 4;
        var revealed = service.GetForAi(room, player);
        var analysis = AiWorldAnalysisService.Analyze(revealed);

        Assert.Equal("Nuclear winter", revealed.Apocalypse!.Name);
        Assert.Equal("Radiation leak", Assert.Single(revealed.Threats).Name);
        Assert.Equal(4, revealed.Game.CurrentRound);
        Assert.Contains(analysis.Inferred, finding => finding.Kind == AiWorldFactKind.Inferred && finding.Value.Contains("Radiation leak"));
    }
}
