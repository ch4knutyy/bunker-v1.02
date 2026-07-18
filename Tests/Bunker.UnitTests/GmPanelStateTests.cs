using System.Text.Json;
using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services;

namespace Bunker.UnitTests;

public sealed class GmPanelStateTests
{
	[Fact]
	public void LobbyHostReceivesSerializableStateWithSafeInactiveSummaries()
	{
		var builder = new GmPanelStateBuilder(TimeProvider.System);
		var host = new Player
		{
			Name = "Lobby Host",
			ConnectionId = "lobby-host-connection",
			StablePlayerId = "lobby-host"
		};
		var room = new Room
		{
			Id = "LOBBYV2",
			HostConnectionId = host.ConnectionId,
			HostPlayerId = host.StablePlayerId,
			HostToken = "host-secret",
			Password = "room-secret",
			State = RoomState.Lobby,
			GmMode = GmMode.PlayerHost,
			GameTimer = null!,
			CurrentVoting = null,
			ThreatState = null!,
			CurrentThreat = null,
			Bunker = null
		};
		room.Players[host.ConnectionId] = host;

		var state = builder.TryBuild(room, host);
		var serialized = JsonSerializer.Serialize(state);

		Assert.NotNull(state);
		Assert.Equal("Lobby", state.Phase);
		Assert.Equal(0, state.Round);
		Assert.Equal("Inactive", state.TimerStatus);
		Assert.Equal(0, state.TimerRemainingSeconds);
		Assert.Equal("Inactive", state.VotingStatus);
		Assert.Equal("Inactive", state.ThreatStatus);
		Assert.Null(state.BunkerCapacity);
		Assert.True(state.Permissions.CanManageRounds);
		Assert.False(state.Permissions.CanUseTechnicalTools);
		Assert.True(state.AvailableActions.CanStartGame);
		Assert.DoesNotContain("host-secret", serialized);
		Assert.DoesNotContain("room-secret", serialized);
	}

	[Fact]
	public void StateContainsCanonicalRoundTimerVotingThreatBunkerAndPlayerSummaries()
	{
		var now = new DateTimeOffset(2026, 7, 19, 12, 0, 0, TimeSpan.Zero);
		var builder = new GmPanelStateBuilder(new FixedTimeProvider(now));
		var (room, host, player) = CreatePlayingRoom();
		room.GameTimer = new GameTimerState
		{
			Status = GameTimerStatus.Running,
			DurationSeconds = 300,
			DeadlineUtc = now.AddSeconds(90)
		};
		room.CurrentVoting = new VotingSession
		{
			State = VotingState.Active,
			EligibleVoters = [host.StablePlayerId, player.StablePlayerId],
			Votes = { [host.StablePlayerId] = player.StablePlayerId }
		};
		room.CurrentThreat = new ThreatData { Id = "threat", Name = "Storm" };
		room.IsThreatRevealed = true;
		room.ThreatState = new ThreatInteractionState { ThreatStatus = "active" };
		room.Bunker = new BunkerInfo { Name = "Vault", Capacity = 6 };
		room.ResolvedBunkerCapacity = 5;
		player.Revealed.Profession = true;
		player.Revealed.Hobby = true;
		room.CurrentTurnPlayerId = player.StablePlayerId;

		var state = builder.TryBuild(room, host)!;

		Assert.Equal("ROOMV2", state.RoomCode);
		Assert.Equal("RoundReveal", state.Phase);
		Assert.Equal(3, state.Round);
		Assert.Equal(90, state.TimerRemainingSeconds);
		Assert.Equal("Active", state.VotingStatus);
		Assert.Equal(1, state.VotesCast);
		Assert.Equal(2, state.RequiredVotes);
		Assert.Equal("active", state.ThreatStatus);
		Assert.Equal("Storm", state.ThreatName);
		Assert.Equal(5, state.BunkerCapacity);
		var playerSummary = Assert.Single(
			state.Players,
			item => item.PlayerId == player.StablePlayerId);
		Assert.Equal(2, playerSummary.RevealedCount);
		Assert.True(playerSummary.IsCurrentTurn);
	}

	[Fact]
	public void RejoinBuildIsEquivalentAndDisconnectedPlayerRemainsVisibleWithoutRefresh()
	{
		var builder = new GmPanelStateBuilder(TimeProvider.System);
		var (room, host, player) = CreatePlayingRoom();
		player.IsConnected = false;
		player.DisconnectedAt = DateTime.UtcNow;
		var live = builder.TryBuild(room, host)!;

		room.Players.Remove(host.ConnectionId);
		host.ConnectionId = "host-reconnected";
		room.HostConnectionId = host.ConnectionId;
		room.Players[host.ConnectionId] = host;
		var rejoined = builder.TryBuild(room, host)!;

		Assert.Equal(live.RoomCode, rejoined.RoomCode);
		Assert.Equal(live.Phase, rejoined.Phase);
		Assert.Equal(live.Round, rejoined.Round);
		Assert.Equal(
			live.Players.Select(item => item.PlayerId),
			rejoined.Players.Select(item => item.PlayerId));
		var disconnected = Assert.Single(
			rejoined.Players,
			item => item.PlayerId == player.StablePlayerId);
		Assert.False(disconnected.IsConnected);
		Assert.True(disconnected.IsActive);
	}

	[Fact]
	public void CompletedRoomExposesNoRoundMutationActions()
	{
		var builder = new GmPanelStateBuilder(TimeProvider.System);
		var (room, host, _) = CreatePlayingRoom();
		room.State = RoomState.Finished;
		room.CurrentPhase = GamePhase.Finished;

		var state = builder.TryBuild(room, host)!;

		Assert.True(state.IsCompleted);
		Assert.False(state.AvailableActions.CanStartGame);
		Assert.False(state.AvailableActions.CanAdvanceRound);
		Assert.False(state.AvailableActions.CanEndRound);
		Assert.False(state.AvailableActions.CanEndGame);
	}

	private static (Room Room, Player Host, Player Player) CreatePlayingRoom()
	{
		var host = new Player
		{
			Name = "Host",
			ConnectionId = "host-connection",
			StablePlayerId = "host"
		};
		var player = new Player
		{
			Name = "Player",
			ConnectionId = "player-connection",
			StablePlayerId = "player"
		};
		var room = new Room
		{
			Id = "ROOMV2",
			HostConnectionId = host.ConnectionId,
			HostPlayerId = host.StablePlayerId,
			GmMode = GmMode.PlayerHost,
			State = RoomState.Playing,
			CurrentPhase = GamePhase.RoundReveal,
			CurrentRound = 3
		};
		room.Players[host.ConnectionId] = host;
		room.Players[player.ConnectionId] = player;
		return (room, host, player);
	}

	private sealed class FixedTimeProvider : TimeProvider
	{
		private readonly DateTimeOffset _utcNow;

		public FixedTimeProvider(DateTimeOffset utcNow)
		{
			_utcNow = utcNow;
		}

		public override DateTimeOffset GetUtcNow() => _utcNow;
	}
}
