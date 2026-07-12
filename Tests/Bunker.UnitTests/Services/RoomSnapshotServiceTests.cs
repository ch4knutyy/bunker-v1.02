using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class RoomSnapshotServiceTests
{
    [Fact]
    public void Snapshot_IsDeepCopy_AndRestoresGameplayState()
    {
        var context = CreateContext();
        context.Room.CurrentRound = 2;
        context.Room.CurrentPhase = GamePhase.RoundReveal;
        context.Room.State = RoomState.Playing;
        context.Room.Bunker!.Capacity = 4;
        context.Target.IsEliminated = false;
        context.Target.PhysicalHealth.Name = "snapshot condition";
        context.Target.Revealed.PhysicalHealth = true;
        context.Room.CurrentVoting = ActiveVoting(context.Host, context.Target);
        var snapshot = context.Snapshots.CreateSnapshot(context.Room, "host-player", "before mutation");

        context.Room.CurrentRound = 7;
        context.Room.Bunker.Capacity = 9;
        context.Target.IsEliminated = true;
        context.Target.PhysicalHealth.Name = "mutated condition";
        context.Target.Revealed.PhysicalHealth = false;
        context.Room.CurrentVoting.Votes.Clear();

        var result = context.Snapshots.RestoreSnapshot(context.Room, snapshot.SnapshotId, "host-player", "restore-1");
        Assert.True(result.Success);
        Assert.Equal(2, context.Room.CurrentRound);
        Assert.Equal(4, context.Room.Bunker.Capacity);
        var restoredTarget = context.Room.Players[context.Target.ConnectionId];
        Assert.False(restoredTarget.IsEliminated);
        Assert.Equal("snapshot condition", restoredTarget.PhysicalHealth.Name);
        Assert.True(restoredTarget.Revealed.PhysicalHealth);
        Assert.Single(context.Room.CurrentVoting!.Votes);
        Assert.NotNull(result.SafetySnapshotId);
    }

    [Fact]
    public void Snapshot_DoesNotSerializeRuntimeOrHistories()
    {
        var context = CreateContext();
        var snapshot = context.Snapshots.CreateSnapshot(context.Room, "host-player", "safe");
        var json = JsonSerializer.Serialize(snapshot).ToLowerInvariant();
        Assert.DoesNotContain("connectionid", json);
        Assert.DoesNotContain("snapshotstate", json);
        Assert.DoesNotContain("gmaudit", json);
        Assert.DoesNotContain("threataudit", json);
        Assert.DoesNotContain("processed", json);
        Assert.DoesNotContain("hosttoken", json);
    }

    [Fact]
    public void History_IsCappedAtTwenty()
    {
        var context = CreateContext();
        for (var index = 0; index < 25; index++)
            context.Snapshots.CreateSnapshot(context.Room, "host-player", $"snapshot {index}", relatedCommandId: $"cmd-{index}");
        Assert.Equal(20, context.Room.SnapshotHistory.Count);
        Assert.Equal(20, context.Snapshots.GetSafeSnapshotList(context.Room).Count);
        Assert.DoesNotContain(context.Room.SnapshotHistory, item => item.Reason == "snapshot 0");
    }

    [Fact]
    public void Preview_IsReadOnlyAndContainsOnlySafeCategoryCounts()
    {
        var context = CreateContext();
        context.Host.PhysicalHealth.Name = "hidden diagnosis";
        var snapshot = context.Snapshots.CreateSnapshot(context.Room, "host-player", "preview");
        context.Room.CurrentRound = 3;
        context.Host.PhysicalHealth.Name = "other hidden diagnosis";
        var before = context.Room.CurrentRound;

        var preview = context.Snapshots.PreviewRestore(context.Room, snapshot.SnapshotId);
        var json = JsonSerializer.Serialize(preview).ToLowerInvariant();
        Assert.True(preview.CanRestore);
        Assert.Equal(before, context.Room.CurrentRound);
        Assert.Contains(preview.Changes, item => item.Category == "round_phase");
        Assert.DoesNotContain("hidden diagnosis", json);
        Assert.DoesNotContain("other hidden diagnosis", json);
        Assert.DoesNotContain("inventory", json);
    }

    [Fact]
    public void Restore_PreservesCurrentConnectionsAndHostAuthority()
    {
        var context = CreateContext();
        var snapshot = context.Snapshots.CreateSnapshot(context.Room, "host-player", "connections");
        var hostConnection = context.Room.HostConnectionId;
        var targetConnection = context.Target.ConnectionId;
        context.Room.CurrentVoting = new VotingSession
        {
            State = VotingState.Active,
            EligibleVoters = new() { hostConnection, targetConnection },
            Votes = new() { [hostConnection] = targetConnection }
        };
        snapshot = context.Snapshots.CreateSnapshot(context.Room, "host-player", "normalized references", relatedCommandId: "normalized");
        context.Room.CurrentRound = 5;

        Assert.True(context.Snapshots.RestoreSnapshot(context.Room, snapshot.SnapshotId, "host-player", "restore-connections").Success);
        Assert.Equal(hostConnection, context.Room.HostConnectionId);
        Assert.Equal(context.Room.Id, context.RoomService.GetPlayerRoomId(hostConnection));
        Assert.Equal(context.Room.Id, context.RoomService.GetPlayerRoomId(targetConnection));
        Assert.Equal(hostConnection, context.Room.Players[hostConnection].ConnectionId);
        Assert.Equal(targetConnection, context.Room.Players[targetConnection].ConnectionId);
        Assert.Contains("host-player", context.Room.CurrentVoting!.Votes.Keys);
        Assert.Contains("target-player", context.Room.CurrentVoting.Votes.Values);
    }

    [Fact]
    public void TopologyOrHostChange_BlocksRestore()
    {
        var topology = CreateContext();
        var topologySnapshot = topology.Snapshots.CreateSnapshot(topology.Room, "host-player", "topology");
        topology.Room.Players.Remove(topology.Target.ConnectionId);
        Assert.Equal("player_topology_changed", topology.Snapshots.PreviewRestore(topology.Room, topologySnapshot.SnapshotId).BlockedReason);

        var hostChange = CreateContext();
        var hostSnapshot = hostChange.Snapshots.CreateSnapshot(hostChange.Room, "host-player", "host topology");
        Assert.True(hostChange.RoomService.TransferHost(hostChange.Room, hostChange.Target.ConnectionId, out _));
        Assert.Equal("host_topology_changed", hostChange.Snapshots.PreviewRestore(hostChange.Room, hostSnapshot.SnapshotId).BlockedReason);
    }

    [Fact]
    public void IntegrityFailure_RollsBackToSafetySnapshot()
    {
        var context = CreateContext();
        context.Room.CurrentTurnPlayerId = "missing-player";
        var invalid = context.Snapshots.CreateSnapshot(context.Room, "host-player", "invalid state");
        context.Room.CurrentTurnPlayerId = null;
        context.Room.CurrentRound = 8;

        var result = context.Snapshots.RestoreSnapshot(context.Room, invalid.SnapshotId, "host-player", "restore-invalid");
        Assert.False(result.Success);
        Assert.Equal("integrity_failed", result.ErrorCode);
        Assert.Equal(8, context.Room.CurrentRound);
        Assert.Null(context.Room.CurrentTurnPlayerId);
        Assert.NotNull(result.SafetySnapshotId);
    }

    [Fact]
    public void Restore_DoesNotReapplyThreatEffectsOrDuplicateConditions()
    {
        var context = CreateContext();
        context.Room.CurrentThreat = context.GameData.Threats.First();
        context.Room.IsThreatRevealed = true;
        context.Room.ThreatState = new ThreatInteractionState
        {
            CurrentThreatId = context.Room.CurrentThreat.Id,
            ThreatStatus = "failed",
            Resolution = new() { EffectsApplied = true, CompletedAtRound = 3 }
        };
        context.Target.AdditionalConditionEffects.Add(new() { Id = "effect", ConditionId = "physical_152", SeverityCode = "hard" });
        var snapshot = context.Snapshots.CreateSnapshot(context.Room, "host-player", "terminal threat");
        context.Room.CurrentRound = 4;

        Assert.True(context.Snapshots.RestoreSnapshot(context.Room, snapshot.SnapshotId, "host-player", "restore-threat").Success);
        Assert.True(context.Room.ThreatState!.Resolution.EffectsApplied);
        Assert.Single(context.Room.Players[context.Target.ConnectionId].AdditionalConditionEffects);
    }

    [Fact]
    public void AuditLinksSnapshotAndUndoRestoresLatestActionIdempotently()
    {
        var context = CreateContext();
        context.Room.CurrentRound = 2;
        var snapshot = context.Snapshots.CreateSnapshot(context.Room, "host-player", "before round", "round_change", "round-cmd");
        context.Room.CurrentRound = 6;
        var audit = context.Audit.Append(context.Room, "host-player", "round_change", GmAuditResult.Success,
            "Round changed.", commandId: "round-cmd", relatedSnapshotId: snapshot.SnapshotId, canUndo: true);
        Assert.Equal(snapshot.SnapshotId, audit.RelatedSnapshotId);
        Assert.True(audit.CanUndo);

        var undo = context.Snapshots.UndoLastGmAction(context.Room, "host-player", "undo-1", out var original);
        Assert.True(undo.Success);
        Assert.Equal(audit.Id, original!.Id);
        Assert.Equal(2, context.Room.CurrentRound);
        var undoAudit = context.Audit.Append(context.Room, "host-player", "gm_action_undone", GmAuditResult.Success,
            "Undone.", relatedSnapshotId: undo.SafetySnapshotId, canUndo: true);
        Assert.True(context.Audit.MarkUndone(context.Room, original.Id, undoAudit.Id));
        Assert.False(context.Audit.GetRecent(context.Room).Single(item => item.Id == original.Id).CanUndo);

        var duplicate = context.Snapshots.UndoLastGmAction(context.Room, "host-player", "undo-1", out _);
        Assert.True(duplicate.Success);
        Assert.True(duplicate.IsDuplicate);
    }

    [Fact]
    public void LastNonUndoableActionRejectsWithoutSearchingOlderEntry()
    {
        var context = CreateContext();
        var snapshot = context.Snapshots.CreateSnapshot(context.Room, "host-player", "older", "round_change", "one");
        context.Audit.Append(context.Room, "host-player", "round_change", GmAuditResult.Success, "Older.", relatedSnapshotId: snapshot.SnapshotId, canUndo: true);
        context.Audit.Append(context.Room, "host-player", "snapshot_created", GmAuditResult.Success, "Manual.");

        var result = context.Snapshots.UndoLastGmAction(context.Room, "host-player", "undo-blocked", out var latest);
        Assert.False(result.Success);
        Assert.Equal("last_action_not_undoable", result.ErrorCode);
        Assert.Equal("snapshot_created", latest!.ActionType);
    }

    private static VotingSession ActiveVoting(Player host, Player target) => new()
    {
        State = VotingState.Active,
        EligibleVoters = new() { host.StablePlayerId, target.StablePlayerId },
        Votes = new() { [host.StablePlayerId] = target.StablePlayerId }
    };

    private static SnapshotContext CreateContext()
    {
        var roomService = new RoomService(NullLogger<RoomService>.Instance);
        var room = roomService.CreateRoom("test", "host-connection", "Host");
        var host = new Player { Name = "Host", ConnectionId = "host-connection", StablePlayerId = "host-player" };
        var target = new Player { Name = "Target", ConnectionId = "target-connection", StablePlayerId = "target-player" };
        Assert.True(roomService.JoinRoom(room.Id, host.ConnectionId, host).success);
        Assert.True(roomService.JoinRoom(room.Id, target.ConnectionId, target).success);
        room.Bunker = new() { Capacity = 6 };
        var gameData = new GameDataService(new TestEnvironment(FindRoot()), NullLogger<GameDataService>.Instance);
        var integrity = new RoomIntegrityService(roomService, gameData, TimeProvider.System);
        var audit = new GmAuditService(TimeProvider.System);
        var index = 0;
        var snapshots = new RoomSnapshotService(integrity, audit, TimeProvider.System, () => $"snapshot-{++index:D3}");
        return new(snapshots, audit, roomService, gameData, room, host, target);
    }

    private static string FindRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Bunker.csproj"))) directory = directory.Parent;
        return directory?.FullName ?? throw new InvalidOperationException("Repository root not found");
    }

    private sealed record SnapshotContext(RoomSnapshotService Snapshots, GmAuditService Audit, RoomService RoomService,
        GameDataService GameData, Room Room, Player Host, Player Target);

    private sealed class TestEnvironment(string root) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Bunker.UnitTests";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = Path.Combine(root, "wwwroot");
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
