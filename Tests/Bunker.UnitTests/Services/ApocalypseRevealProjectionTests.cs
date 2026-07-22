using System.Text.Json;
using Bunker.Hubs;
using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class ApocalypseRevealProjectionTests
{
    [Fact]
    public void RejoinProjectionHidesSelectedApocalypseUntilCanonicalRevealAndResetHidesItAgain()
    {
        var room = new Room
        {
            State = RoomState.Playing,
            Apocalypse = new Apocalypse
            {
                Id = "selected-apocalypse",
                Name = "Selected apocalypse",
                CategoryId = "weather",
                VisualThemeId = "storm-blue",
                VisualModifierIds = ["storm", "flood"]
            },
            ApocalypseRevealed = false
        };

        Assert.Null(GameHub.GetPublicApocalypse(room));

        room.ApocalypseRevealed = true;
        var revealed = GameHub.GetPublicApocalypse(room);
        Assert.NotNull(revealed);
        using var payload = JsonDocument.Parse(JsonSerializer.Serialize(revealed));
        Assert.Equal("selected-apocalypse", payload.RootElement.GetProperty("id").GetString());
        Assert.Equal("weather", payload.RootElement.GetProperty("categoryId").GetString());
        Assert.Equal(2, payload.RootElement.GetProperty("visualModifierIds").GetArrayLength());
        Assert.DoesNotContain("effects", payload.RootElement.GetRawText(), StringComparison.OrdinalIgnoreCase);

        room.State = RoomState.Finished;
        room.CurrentPhase = GamePhase.Finished;
        Assert.True(GameResetService.TryReturnFinishedGameToLobby(room, "reset-reveal").Success);
        Assert.False(room.ApocalypseRevealed);
        Assert.Null(GameHub.GetPublicApocalypse(room));
    }
}
