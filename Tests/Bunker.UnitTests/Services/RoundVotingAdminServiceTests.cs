using Bunker.Models;
using Bunker.Services;
using System.Text.Json;

namespace Bunker.UnitTests.Services;

public sealed class RoundVotingAdminServiceTests
{
    [Theory]
    [InlineData(1, GamePhase.PreVotingReadyCheck)]
    [InlineData(2, GamePhase.PreVotingReadyCheck)]
    [InlineData(3, GamePhase.ExtraInventory)]
    [InlineData(3, GamePhase.PreVotingReadyCheck)]
    [InlineData(4, GamePhase.PreVotingReadyCheck)]
    public void VotingIsAllowedFromRound1AndLater(int round, GamePhase phase) =>
        Assert.True(RoundVotingAdminService.CanStartVoting(PlayableRoom(round, phase)).Allowed);

    [Fact]
    public void PauseAndExistingVotingRemainBlocked()
    {
        var room = PlayableRoom(3, GamePhase.ExtraInventory);
        room.IsPaused = true;
        Assert.Equal("game_paused", RoundVotingAdminService.CanStartVoting(room).Code);

        room.IsPaused = false;
        room.CurrentVoting = ActiveVoting();
        Assert.Equal("voting_already_started", RoundVotingAdminService.CanStartVoting(room).Code);
        room.CurrentVoting.State = VotingState.Completed;
        Assert.False(RoundVotingAdminService.CanStartVoting(room).Allowed);
    }

    [Fact]
    public void UnresolvedInteractiveThreatRemainsBlocked()
    {
        var result = RoundVotingAdminService.CanStartVoting(
            PlayableRoom(3, GamePhase.ExtraInventory),
            hasUnresolvedBlockingThreat: true);
        Assert.False(result.Allowed);
        Assert.Equal("threat_not_resolved", result.Code);
    }

    [Fact]
    public void FrozenLobbyVotingPolicyControlsStartRoundFrequencyAndDisabledState()
    {
        var room = PlayableRoom(2, GamePhase.PreVotingReadyCheck);
        room.SettingsFrozen = true;
        room.FrozenGameSettings = RoomGameSettingsService.Preset(GamePreset.Classic);
        room.FrozenGameSettings.VotingStartRound = 2;
        Assert.True(RoundVotingAdminService.CanStartVoting(room).Allowed);

        room.FrozenGameSettings.VotingFrequency = VotingFrequencyMode.EveryTwoRounds;
        room.CurrentRound = 3;
        Assert.Equal("voting_not_scheduled", RoundVotingAdminService.CanStartVoting(room).Code);
        room.CurrentRound = 4;
        Assert.True(RoundVotingAdminService.CanStartVoting(room).Allowed);

        room.FrozenGameSettings.VotingEnabled = false;
        Assert.Equal("voting_disabled", RoundVotingAdminService.CanStartVoting(room).Code);
    }

    [Fact]
    public void PausePersistsWithoutChangingRoundVotingOrThreat()
    {
        var voting = ActiveVoting();
        var threat = new ThreatInteractionState { ThreatStatus = "active" };
        var room = new Room { CurrentRound = 3, CurrentVoting = voting, ThreatState = threat };
        var now = DateTimeOffset.UtcNow;

        RoundVotingAdminService.SetPaused(room, true, "break", "host", now);

        Assert.True(room.IsPaused);
        Assert.Equal("break", room.PauseReason);
        Assert.Equal(now, room.PausedAtUtc);
        Assert.Equal(3, room.CurrentRound);
        Assert.Same(voting, room.CurrentVoting);
        Assert.Equal(VotingState.Active, voting.State);
        Assert.Same(threat, room.ThreatState);
        Assert.Equal("active", threat.ThreatStatus);

        RoundVotingAdminService.SetPaused(room, false, null, "host", now.AddMinutes(1));
        Assert.False(room.IsPaused);
        Assert.Null(room.PausedAtUtc);
        Assert.Equal(VotingState.Active, voting.State);
    }

    [Theory]
    [InlineData("1", 1)]
    [InlineData("99", 99)]
    public void RoundParserAcceptsValidIntegers(string value, int expected)
    {
        Assert.True(RoundVotingAdminService.TryParseRound(value, out var round));
        Assert.Equal(expected, round);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("2.5")]
    [InlineData("")]
    [InlineData("NaN")]
    public void RoundParserRejectsInvalidValues(string value) =>
        Assert.False(RoundVotingAdminService.TryParseRound(value, out _));

    [Fact]
    public void BackwardOrActiveVotingRoundChangeDoesNotMutateState()
    {
        var room = new Room { CurrentRound = 3, CurrentPhase = GamePhase.PreVotingReadyCheck };
        Assert.False(RoundVotingAdminService.TrySetRound(room, 2, out _));
        Assert.Equal(3, room.CurrentRound);
        Assert.Equal(GamePhase.PreVotingReadyCheck, room.CurrentPhase);

        room.CurrentVoting = ActiveVoting();
        Assert.False(RoundVotingAdminService.TrySetRound(room, 4, out _));
        Assert.Equal(3, room.CurrentRound);
    }

    [Fact]
    public void ResetReadinessOnlyRemovesActivePlayersAndDoesNotTransition()
    {
        var active = new Player { ConnectionId = "a", StablePlayerId = "active" };
        var eliminated = new Player { ConnectionId = "e", StablePlayerId = "eliminated", IsEliminated = true };
        var room = new Room { CurrentPhase = GamePhase.PreVotingReadyCheck, Players = new() { ["a"] = active, ["e"] = eliminated } };
        room.VotingReadyResponses["active"] = "ready";
        room.VotingReadyResponses["eliminated"] = "ready";

        RoundVotingAdminService.ResetReadiness(room);

        Assert.DoesNotContain("active", room.VotingReadyResponses.Keys);
        Assert.Contains("eliminated", room.VotingReadyResponses.Keys);
        Assert.Equal(GamePhase.PreVotingReadyCheck, room.CurrentPhase);
    }

    [Fact]
    public void ClearAndRemoveVotesKeepSessionActiveAndTouchOnlyRequestedVotes()
    {
        var voting = ActiveVoting();
        voting.Votes["a"] = "x";
        voting.Votes["b"] = "y";
        Assert.True(RoundVotingAdminService.RemoveVote(voting, "a"));
        Assert.False(voting.Votes.ContainsKey("a"));
        Assert.Equal("y", voting.Votes["b"]);
        Assert.Equal(VotingState.Active, voting.State);

        RoundVotingAdminService.ClearVotes(voting);
        Assert.Empty(voting.Votes);
        Assert.Equal(VotingState.Active, voting.State);
    }

    [Fact]
    public void TiedCandidatesAreComputedFromCurrentVotes()
    {
        var voting = ActiveVoting();
        voting.Votes = new() { ["a"] = "x", ["b"] = "y", ["c"] = "z", ["d"] = "x" };
        Assert.Equal(new[] { "x" }, RoundVotingAdminService.GetTiedCandidateIds(voting));
        voting.Votes["e"] = "y";
        Assert.Equal(new[] { "x", "y" }, RoundVotingAdminService.GetTiedCandidateIds(voting).Order());
    }

    [Fact]
    public void PublicVotingPayloadDoesNotContainSecretVoteTargets()
    {
        var voting = ActiveVoting();
        voting.Votes["voter"] = "secret-target";
        var players = new Dictionary<string, Player>
        {
            ["voter"] = new() { ConnectionId = "voter", StablePlayerId = "voter", Name = "Voter" },
            ["secret-target"] = new() { ConnectionId = "secret-target", StablePlayerId = "secret-target", Name = "Target" }
        };
        var json = JsonSerializer.Serialize(voting.ToClientInfo(players, showVotes: false));
        Assert.Contains("\"votes\":null", json, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("\"voters\":[]", json, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(1, 3, true)]
    [InlineData(2, 3, true)]
    [InlineData(3, 3, false)]
    [InlineData(4, 3, false)]
    public void EarlyVotingFlagIsComputedCorrectlyFromStartRoundSettings(int currentRound, int votingStartRound, bool expectedIsEarly)
    {
        var room = PlayableRoom(currentRound, GamePhase.PreVotingReadyCheck);
        var settings = new RoomGameSettings { VotingStartRound = votingStartRound };
        var voting = new VotingSession
        {
            Round = room.CurrentRound,
            VotingStartedAtRound = room.CurrentRound,
            IsEarlyVoting = room.CurrentRound < settings.VotingStartRound
        };
        Assert.Equal(currentRound, voting.VotingStartedAtRound);
        Assert.Equal(expectedIsEarly, voting.IsEarlyVoting);
    }

    private static VotingSession ActiveVoting() => new() { State = VotingState.Active };
    private static Room PlayableRoom(int round, GamePhase phase) => new()
    {
        State = RoomState.Playing,
        CurrentRound = round,
        CurrentPhase = phase
    };
}
