using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Models.Сharacteristics;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public class GameResetTests
{
    [Fact]
    public void FinishedRoomReturnsToCleanLobbyAndPreservesRoomIdentity()
    {
        var room = FinishedRoom();
        room.ApocalypseActivationPolicy = new() { Enabled = true, ApocalypseId = "resolved", EffectProfileId = "profile" };
        room.ApocalypseEffectRuntime = new() { SuccessfulActivationCount = 2 };
        room.Players["host-connection"].ApocalypseProfessionSuppression = new() { IsSuppressed = true };
        var roomId = room.Id;
        var hostToken = room.HostToken;
        var sessionId = room.GameSessionId;

        var result = GameResetService.TryReturnFinishedGameToLobby(room, "reset-1");

        Assert.True(result.Success);
        Assert.False(result.IsDuplicate);
        Assert.Equal(sessionId, result.PreviousGameSessionId);
        Assert.Equal(roomId, room.Id);
        Assert.Equal(hostToken, room.HostToken);
        Assert.Equal(RoomState.Lobby, room.State);
        Assert.Equal(GamePhase.Lobby, room.CurrentPhase);
        Assert.Equal(0, room.CurrentRound);
        Assert.Null(room.Completion);
        Assert.Null(room.GameSessionId);
        Assert.Null(room.CurrentVoting);
        Assert.Null(room.CurrentThreat);
        Assert.Null(room.ThreatState);
        Assert.Null(room.Bunker);
        Assert.Null(room.Apocalypse);
        Assert.Null(room.ApocalypseActivationPolicy);
        Assert.Null(room.ApocalypseEffectRuntime);
        Assert.Null(room.Players["host-connection"].ApocalypseProfessionSuppression);
        Assert.False(room.SettingsFrozen);
        Assert.Null(room.FrozenGameSettings);
        Assert.Empty(room.CurrentRoundReveals);
        Assert.Empty(room.RoundDiceRolls);
        Assert.Empty(room.ProcessedSpecialCardCommandIds);
        Assert.Empty(room.VotingReadyResponses);
        Assert.Equal(GameTimerStatus.Stopped, room.GameTimer.Status);
    }

    [Fact]
    public void PlayerGameplayDataIsClearedButIdentityConnectionAndRolesArePreserved()
    {
        var room = FinishedRoom();
        var player = room.Players["host-connection"];
        var stableId = player.StablePlayerId;
        var name = player.Name;
        var role = player.GmRole;

        var result = GameResetService.TryReturnFinishedGameToLobby(room, "reset-players");

        Assert.True(result.Success);
        Assert.Equal(stableId, player.StablePlayerId);
        Assert.Equal(name, player.Name);
        Assert.Equal("host-connection", player.ConnectionId);
        Assert.True(player.IsConnected);
        Assert.Equal(role, player.GmRole);
        Assert.False(player.IsEliminated);
        Assert.False(player.IsLobbyReady);
        Assert.Equal(0, player.SeatNumber);
        Assert.Empty(player.Profession.Name);
        Assert.Empty(player.Inventory.Items);
        Assert.Null(player.Property);
        Assert.Empty(player.SpecialCards);
        Assert.Empty(player.AdditionalConditionEffects);
        Assert.False(player.Revealed.Profession);
        Assert.False(player.Revealed.Property);
    }

    [Fact]
    public void ActiveGameCannotBeReturnedToLobby()
    {
        var room = FinishedRoom();
        room.State = RoomState.Playing;
        room.CurrentPhase = GamePhase.RoundReveal;

        var result = GameResetService.TryReturnFinishedGameToLobby(room, "reset-active");

        Assert.False(result.Success);
        Assert.False(result.IsDuplicate);
        Assert.Equal("game_not_finished", result.ErrorCode);
        Assert.Equal(RoomState.Playing, room.State);
        Assert.NotNull(room.Completion);
    }

    [Fact]
    public void RepeatedCommandIsIdempotent()
    {
        var room = FinishedRoom();

        Assert.True(GameResetService.TryReturnFinishedGameToLobby(room, "reset-repeat").Success);
        var repeated = GameResetService.TryReturnFinishedGameToLobby(room, "reset-repeat");

        Assert.False(repeated.Success);
        Assert.True(repeated.IsDuplicate);
        Assert.Equal(RoomState.Lobby, room.State);
    }

    private static Room FinishedRoom()
    {
        var player = new Player
        {
            StablePlayerId = "host-player",
            ConnectionId = "host-connection",
            Name = "Host",
            IsConnected = true,
            GmRole = GmMode.PlayerHost,
            IsLobbyReady = true,
            IsEliminated = true,
            EliminatedAtRound = 5,
            SeatNumber = 1,
            Profession = new Profession { Name = "Doctor" },
            Inventory = new Inventory { Items = [new Item { Name = "Radio" }] },
            Property = new GeneratedProperty
            {
                DefinitionId = "property-reset",
                GeneratedValues = new() { ["value"] = 5 },
                LocalizedDisplay = new() { ["uk"] = "Майно 5" }
            },
            SpecialCards = [new SpecialCard { Name = "Card" }],
            Revealed = new RevealedCharacteristics { Profession = true, Property = true },
            AdditionalConditionEffects = [new PlayerConditionEffect { Name = "Condition" }]
        };
        var sessionId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        var room = new Room
        {
            Id = "ROOM1234",
            Name = "Persistent room",
            HostConnectionId = player.ConnectionId,
            HostPlayerId = player.StablePlayerId,
            State = RoomState.Finished,
            CurrentPhase = GamePhase.Finished,
            CurrentRound = 5,
            GameSessionId = sessionId,
            Completion = new GameCompletionState(
                "bunker_capacity_reached",
                "vote",
                1,
                1,
                5,
                DateTime.UtcNow,
                [new GameWinnerState(player.StablePlayerId, player.Name)]),
            CurrentVoting = new VotingSession(),
            CurrentThreat = new ThreatData(),
            ThreatState = new ThreatInteractionState(),
            Bunker = new BunkerInfo(),
            Apocalypse = new Apocalypse(),
            SettingsFrozen = true,
            FrozenGameSettings = new RoomGameSettings(),
            ResolvedBunkerCapacity = 1,
            CurrentRoundReveals = new() { [player.StablePlayerId] = "Profession" },
            RoundDiceRolls = new() { [5] = new RoundDiceRoll() },
            VotingReadyResponses = new() { [player.StablePlayerId] = "ready" },
            GameTimer = new GameTimerState { Status = GameTimerStatus.Running }
        };
        room.Players[player.ConnectionId] = player;
        room.ProcessedSpecialCardCommandIds.Add("property-card-command");
        return room;
    }
}
