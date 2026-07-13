using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class DirectorControlServiceTests
{
    [Fact]
    public void DirectorCapabilitiesBelongOnlyToOmniscientMode()
    {
        foreach (var capability in new[] { GmCapability.UseDirectorPlayerControls, GmCapability.UseDirectorRoundControls, GmCapability.UseDirectorThreatControls })
        {
            Assert.False(GmCapabilities.Allows(GmMode.PlayerHost, capability));
            Assert.False(GmCapabilities.Allows(GmMode.TechnicalGm, capability));
            Assert.True(GmCapabilities.Allows(GmMode.OmniscientGm, capability));
        }
    }

    [Fact]
    public void PreviewIsReadOnlySafeAndSingleUse()
    {
        var (service, room, actor, target) = Setup(); target.Profession.Name = "Hidden profession value"; var before = JsonSerializer.Serialize(target);
        var request = new DirectorActionRequestDto("reveal", target.StablePlayerId, "Profession");
        var preview = service.Preview(room, actor, request, target, ["Profession"], 1, true, []);
        Assert.Equal(before, JsonSerializer.Serialize(target)); Assert.DoesNotContain(target.Profession.Name, JsonSerializer.Serialize(preview));
        Assert.True(service.TryConsume(room, actor, request, preview.PreviewToken, preview.CurrentStateVersion, "cmd", out _, out _, out _));
        Assert.False(service.TryConsume(room, actor, request, preview.PreviewToken, preview.CurrentStateVersion, "cmd2", out _, out _, out var error));
        Assert.Equal("preview_expired", error);
    }

    [Fact]
    public void StalePreviewAndConnectionIdTargetAreRejectedByContract()
    {
        var (service, room, actor, target) = Setup(); var request = new DirectorActionRequestDto("hide", target.StablePlayerId, "Profession");
        var preview = service.Preview(room, actor, request, target, ["Profession"], 1, true, []); room.CurrentRound++;
        Assert.False(service.TryConsume(room, actor, request, preview.PreviewToken, preview.CurrentStateVersion, "cmd", out _, out _, out var error));
        Assert.Equal("stale_preview", error);
    }

    [Fact]
    public void BlockedPreviewCannotBeApplied()
    {
        var (service, room, actor, _) = Setup();
        var request = new DirectorActionRequestDto("eliminate", actor.StablePlayerId);
        var preview = service.Preview(room, actor, request, actor, [], 0, false, ["spectator_target_blocked"]);
        Assert.False(preview.CanApply);
        Assert.False(service.TryConsume(room, actor, request, preview.PreviewToken, preview.CurrentStateVersion, "blocked", out _, out _, out var error));
        Assert.Equal("director_action_blocked", error);
    }

    [Fact]
    public void RevealHideMutatorsPreserveActualValuesAndThreatForceIsNotUndoable()
    {
        var (service, room, actor, target) = Setup(); target.Profession.Name = "Preserved profession";
        target.Revealed.Profession = true; GmPlayerStateMutator.HideCharacteristic(target, "Profession");
        Assert.Equal("Preserved profession", target.Profession.Name); Assert.False(target.Revealed.Profession);
        room.CurrentThreat = new() { Id = "radiation_leak", Name = "Leak" }; room.IsThreatRevealed = true;
        room.ThreatState = new() { CurrentThreatId = "radiation_leak", ThreatStatus = "active" };
        var preview = service.Preview(room, actor, new("threat_force_failure"), null, ["current_threat"], 1, true, []);
        Assert.False(preview.CanUndo); Assert.False(preview.SnapshotAvailable); Assert.NotNull(preview.IrreversibleWarning);
    }

    private static (DirectorControlService Service, Room Room, Player Actor, Player Target) Setup()
    {
        var rooms = new RoomService(NullLogger<RoomService>.Instance); var room = rooms.CreateRoom("room", "actor", "Director");
        var actor = new Player { Name = "Director", ConnectionId = "actor", StablePlayerId = "actor-id", IsSpectatorGm = true, GmRole = GmMode.OmniscientGm };
        var target = new Player { Name = "Target", ConnectionId = "target", StablePlayerId = "target-id" };
        rooms.JoinRoom(room.Id, actor.ConnectionId, actor); rooms.JoinRoom(room.Id, target.ConnectionId, target); room.IrreversibleOmniscientPlayerIds.Add(actor.StablePlayerId);
        return (new(TimeProvider.System), room, actor, target);
    }
}
