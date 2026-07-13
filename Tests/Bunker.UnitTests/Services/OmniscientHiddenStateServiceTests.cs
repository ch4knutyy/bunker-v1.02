using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Bunker.Models.ViewModels;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Bunker.UnitTests.Services;

public sealed class OmniscientHiddenStateServiceTests
{
    [Fact]
    public void HiddenCapabilitiesAreSplitAndOnlyOmniscientRoleHasThem()
    {
        foreach (var capability in new[] { GmCapability.ViewHiddenPlayerState, GmCapability.ViewHiddenRoomState, GmCapability.ViewSecretVotes })
        {
            Assert.False(GmCapabilities.Allows(GmMode.PlayerHost, capability));
            Assert.False(GmCapabilities.Allows(GmMode.TechnicalGm, capability));
            Assert.True(GmCapabilities.Allows(GmMode.OmniscientGm, capability));
        }
        var spectator = new Player { IsSpectatorGm = true, GmRole = GmMode.OmniscientGm };
        Assert.False(Policy(Environments.Production).CanViewHidden(spectator, GmCapability.ViewHiddenRoomState));
        Assert.True(Policy(Environments.Development).CanViewHidden(spectator, GmCapability.ViewHiddenRoomState));
    }

    [Fact]
    public void ExplicitDtoContainsPlayerSecretsButExcludesInternalThreatMaterial()
    {
        var (service, room, host, guest) = Setup();
        guest.Profession.Name = "Hidden profession"; guest.PhysicalHealth.Name = "Hidden condition";
        guest.Inventory.Items.Add(new() { Name = "Hidden item", Description = "Private inventory description" });
        guest.SpecialCards.Add(new() { Id = "card-1", Name = "Secret card", Description = "Secret card effect", IsSecret = true });
        guest.AdditionalConditionEffects.Add(new() { ConditionId = "physical_152", Name = "Radiation sickness", SeverityLevel = "hard" });
        room.CurrentThreat = new() { Id = "radiation_leak", Name = "Current radiation leak", Category = "mini_game" };
        room.ThreatState = new() { CurrentThreatId = "radiation_leak", ThreatStatus = "active", ParticipantPlayerIds = [guest.StablePlayerId] };
        room.ThreatState.MiniGame.Status = "active"; room.ThreatState.MiniGame.Questions.Add(new() { QuestionId = "secret-question", SelectedOptionId = "answer-key" });
        var dto = service.Build(room, true); var json = JsonSerializer.Serialize(dto);

        Assert.Contains("Hidden profession", json); Assert.Contains("Hidden condition", json); Assert.Contains("Hidden item", json); Assert.Contains("Secret card", json); Assert.Contains("physical_152", json);
        Assert.Contains("radiation_leak", json); Assert.DoesNotContain("secret-question", json); Assert.DoesNotContain("answer-key", json);
        Assert.DoesNotContain("Mechanics", json); Assert.DoesNotContain("ImagePath", json); Assert.DoesNotContain("RandomModifier", json);
        Assert.DoesNotContain("ConnectionId", json); Assert.DoesNotContain("HostToken", json);
    }

    [Fact]
    public void SecretVotesAreOmittedWithoutDedicatedCapabilityShape()
    {
        var (service, room, host, guest) = Setup();
        room.CurrentVoting = new VotingSession(); room.CurrentVoting.EligibleVoters.UnionWith([host.StablePlayerId, guest.StablePlayerId]);
        room.CurrentVoting.Votes[guest.StablePlayerId] = host.StablePlayerId;
        Assert.Null(service.Build(room, false).CurrentVoting!.SecretVotes);
        var vote = Assert.Single(service.Build(room, true).CurrentVoting!.SecretVotes!);
        Assert.Equal("Guest", vote.VoterName); Assert.Equal("Host", vote.CandidateName);
    }

    [Fact]
    public void StateVersionIncreasesAndPublicDtosRemainFreeOfHiddenValues()
    {
        var (service, room, _, guest) = Setup(); guest.Profession.Name = "Never public profession";
        var first = service.Build(room, true); var second = service.Build(room, true);
        Assert.True(second.StateVersion > first.StateVersion);
        Assert.DoesNotContain("Never public profession", JsonSerializer.Serialize(room.ToPublicInfo()));
        Assert.DoesNotContain("Never public profession", JsonSerializer.Serialize(new PlayerHostControlDto { StablePlayerId = guest.StablePlayerId, Name = guest.Name }));
    }

    private static (OmniscientHiddenStateService Service, Room Room, Player Host, Player Guest) Setup()
    {
        var rooms = new RoomService(NullLogger<RoomService>.Instance); var room = rooms.CreateRoom("room", "host", "Host");
        var host = new Player { Name = "Host", ConnectionId = "host", StablePlayerId = "host-id", IsSpectatorGm = true, GmRole = GmMode.OmniscientGm };
        var guest = new Player { Name = "Guest", ConnectionId = "guest", StablePlayerId = "guest-id" };
        rooms.JoinRoom(room.Id, host.ConnectionId, host); rooms.JoinRoom(room.Id, guest.ConnectionId, guest);
        room.IrreversibleOmniscientPlayerIds.Add(host.StablePlayerId);
        return (new(TimeProvider.System, new GameTimerService(TimeProvider.System), rooms), room, host, guest);
    }

    private static OmniscientGmAccessPolicy Policy(string environment) => new(new TestEnvironment { EnvironmentName = environment },
        Options.Create(new OmniscientGmOptions { Enabled = true, DevelopmentBootstrapKey = "omniscient-test-key-123" }));
    private sealed class TestEnvironment : IHostEnvironment { public string EnvironmentName { get; set; } = Environments.Production; public string ApplicationName { get; set; } = "Tests"; public string ContentRootPath { get; set; } = ""; public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider(); }
}
