using System.Text.Json;
using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class RoomLocalEditorServiceTests
{
    private readonly RoomLocalEditorService _service = new(TimeProvider.System);

    [Fact]
    public void HiddenCharacteristicsAreAbsentAndBlocked()
    {
        var (room, player) = CreateRoom();
        player.PhysicalHealth.Name = "hidden diagnosis";
        var dto = _service.GetSafeData(room);
        var playerDto = Assert.Single(dto.Players);
        Assert.DoesNotContain(playerDto.Fields, field => field.FieldId == "player_physical_health");
        Assert.DoesNotContain("hidden diagnosis", JsonSerializer.Serialize(dto));
        var result = _service.Apply(room, "player", player.StablePlayerId, "player_physical_health", "edited");
        Assert.False(result.Success);
        Assert.Equal("characteristic_hidden", result.ErrorCode);
        Assert.Equal("hidden diagnosis", player.PhysicalHealth.Name);
    }

    [Fact]
    public void RevealedCharacteristicCanBeEdited()
    {
        var (room, player) = CreateRoom();
        player.Revealed.PhysicalHealth = true;
        Assert.True(_service.Apply(room, "player", player.StablePlayerId, "player_physical_health", "Public health").Success);
        Assert.Equal("Public health", player.PhysicalHealth.Name);
    }

    [Fact]
    public void PublicBunkerAndApocalypseFieldsAreRoomLocal()
    {
        var (room, _) = CreateRoom();
        var other = CreateRoom().Room;
        Assert.True(_service.Apply(room, "bunker", null, "bunker_name", "Edited bunker").Success);
        Assert.True(_service.Apply(room, "apocalypse", null, "apocalypse_description", "Edited apocalypse").Success);
        Assert.Equal("Edited bunker", room.Bunker!.Name);
        Assert.Equal("Edited apocalypse", room.Apocalypse!.Description);
        Assert.Equal("Original bunker", other.Bunker!.Name);
        Assert.Equal("Original apocalypse", other.Apocalypse!.Description);
    }

    [Fact]
    public void InvalidIdentifierPathHtmlAndConditionAreBlockedOrSanitized()
    {
        var (room, _) = CreateRoom();
        Assert.False(_service.Apply(room, "bunker", null, "Bunker.Name", "hack").Success);
        Assert.False(_service.Apply(room, "bunker", null, "threat_status", "failed").Success);
        Assert.False(_service.Apply(room, "bunker", null, "bunker_condition", "destroyed").Success);
        var preview = _service.Preview(room, "bunker", null, "bunker_name", "<b>Safe</b>\0");
        Assert.Equal("bSafe/b", preview.SanitizedProposedValue);
        Assert.Equal("Original bunker", room.Bunker!.Name);
    }

    [Fact]
    public void PreviewAndNoOpDoNotMutate()
    {
        var (room, _) = CreateRoom();
        var preview = _service.Preview(room, "bunker", null, "bunker_name", "Original bunker");
        Assert.False(preview.CanApply);
        Assert.False(preview.WillCreateSnapshot);
        Assert.Equal("Original bunker", room.Bunker!.Name);
        var result = _service.Apply(room, "bunker", null, "bunker_name", "Original bunker");
        Assert.True(result.Success);
        Assert.False(result.Changed);
    }

    private static (Room Room, Player Player) CreateRoom()
    {
        var player = new Player { Name = "Public player", StablePlayerId = "player-1", ConnectionId = "connection-1" };
        var room = new Room
        {
            HostPlayerId = player.StablePlayerId,
            HostConnectionId = player.ConnectionId,
            Bunker = new() { Name = "Original bunker", Description = "Original description", Capacity = 6, Location = "Original location" },
            Apocalypse = new() { Name = "Original apocalypse", Description = "Original apocalypse", Duration = "12 months" },
            Players = new() { [player.ConnectionId] = player }
        };
        return (room, player);
    }
}
