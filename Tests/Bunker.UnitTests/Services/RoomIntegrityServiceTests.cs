using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class RoomIntegrityServiceTests
{
    [Fact]
    public void HealthyRoom_ReturnsHealthySafeDto()
    {
        var (integrity, _, room, _) = CreateHealthyRoom();
        var report = integrity.Check(room, "en");
        var json = JsonSerializer.Serialize(report).ToLowerInvariant();

        Assert.True(report.IsHealthy);
        Assert.Equal(0, report.ErrorCount);
        Assert.DoesNotContain("inventory", json);
        Assert.DoesNotContain("specialcard", json);
        Assert.DoesNotContain("connectionid", json);
        Assert.DoesNotContain("password", json);
    }

    [Fact]
    public void Check_DetectsStaleReadyVoteAndThreatReferences()
    {
        var (integrity, _, room, _) = CreateHealthyRoom();
        room.VotingReadyResponses["missing-ready"] = "ready";
        room.CurrentVoting = new VotingSession
        {
            State = VotingState.Active,
            Votes = new() { ["missing-voter"] = "missing-target" }
        };
        room.ThreatState = new ThreatInteractionState
        {
            ParticipantPlayerIds = new() { "missing-participant" },
            MiniGame = new() { LeaderPlayerId = "missing-leader" }
        };

        var codes = integrity.Check(room).Issues.Select(issue => issue.Code).ToHashSet();
        Assert.Contains("ready_player_missing", codes);
        Assert.Contains("vote_voter_missing", codes);
        Assert.Contains("vote_target_missing", codes);
        Assert.Contains("threat_participant_missing", codes);
        Assert.Contains("operation_leader_invalid", codes);
    }

    [Fact]
    public void Preview_DoesNotMutate_AndApplyRemovesOnlySafeReferences()
    {
        var (integrity, service, room, target) = CreateHealthyRoom();
        var staleConnection = target.ConnectionId;
        room.Players.Remove(staleConnection);
        room.VotingReadyResponses["missing"] = "ready";
        room.CurrentVoting = new VotingSession { Votes = new() { ["missing"] = RoomService.GetPlayerKey(room.Players.Values.First()) } };
        room.ThreatState = new ThreatInteractionState
        {
            ParticipantPlayerIds = new() { "missing" }, MiniGame = new() { LeaderPlayerId = "missing" }
        };

        var preview = integrity.PreviewAutoFix(room);
        Assert.True(preview.HasChanges);
        Assert.Equal(room.Id, service.GetPlayerRoomId(staleConnection));
        Assert.Contains("missing", room.VotingReadyResponses.Keys);

        var changed = integrity.ApplySafeFixes(room);
        Assert.True(changed >= 4);
        Assert.Null(service.GetPlayerRoomId(staleConnection));
        Assert.Empty(room.VotingReadyResponses);
        Assert.Empty(room.CurrentVoting.Votes);
        Assert.Empty(room.ThreatState.ParticipantPlayerIds);
        Assert.Equal("", room.ThreatState.MiniGame.LeaderPlayerId);
        Assert.Equal(0, integrity.ApplySafeFixes(room));
        Assert.DoesNotContain(integrity.Check(room).Issues, issue => issue.CanAutoFix);
    }

    [Fact]
    public void AmbiguousConditionDuplicates_AreDetectedButNotAutoFixed()
    {
        var (integrity, _, room, host) = CreateHealthyRoom();
        host.AdditionalConditionEffects.Add(new() { Id = "one", ConditionId = "physical_152", SeverityCode = "hard" });
        host.AdditionalConditionEffects.Add(new() { Id = "two", ConditionId = "physical_152", SeverityCode = "medium" });

        var issue = Assert.Single(integrity.Check(room).Issues, item => item.Code == "duplicate_additional_condition");
        Assert.False(issue.CanAutoFix);
        Assert.Equal(0, integrity.ApplySafeFixes(room));
        Assert.Equal(2, host.AdditionalConditionEffects.Count);
    }

    [Fact]
    public void ExactConditionDuplicate_IsSafeAndRemovedOnce()
    {
        var (integrity, _, room, host) = CreateHealthyRoom();
        host.AdditionalConditionEffects.Add(new() { Id = "one", ConditionId = "physical_152", SeverityCode = "hard", SourceThreatId = "radiation_leak" });
        host.AdditionalConditionEffects.Add(new() { Id = "two", ConditionId = "physical_152", SeverityCode = "hard", SourceThreatId = "radiation_leak" });

        Assert.True(integrity.PreviewAutoFix(room).HasChanges);
        Assert.Equal(1, integrity.ApplySafeFixes(room));
        Assert.Single(host.AdditionalConditionEffects);
    }

    [Fact]
    public void Messages_AreLocalizedForUaRuAndEn()
    {
        var (integrity, _, room, _) = CreateHealthyRoom();
        room.VotingReadyResponses["missing"] = "ready";
        var uk = Assert.Single(integrity.Check(room, "uk").Issues, issue => issue.Code == "ready_player_missing").Message;
        var ru = Assert.Single(integrity.Check(room, "ru").Issues, issue => issue.Code == "ready_player_missing").Message;
        var en = Assert.Single(integrity.Check(room, "en").Issues, issue => issue.Code == "ready_player_missing").Message;
        Assert.NotEqual(uk, ru);
        Assert.NotEqual(ru, en);
        Assert.NotEqual(uk, en);
    }

    private static (RoomIntegrityService Integrity, RoomService Service, Room Room, Player Target) CreateHealthyRoom()
    {
        var roomService = new RoomService(NullLogger<RoomService>.Instance);
        var room = roomService.CreateRoom("test", "host-connection", "Host");
        var host = new Player { Name = "Host", ConnectionId = "host-connection", StablePlayerId = "host-player" };
        var target = new Player { Name = "Target", ConnectionId = "target-connection", StablePlayerId = "target-player" };
        Assert.True(roomService.JoinRoom(room.Id, host.ConnectionId, host).success);
        Assert.True(roomService.JoinRoom(room.Id, target.ConnectionId, target).success);
        room.Bunker = new() { Capacity = 6 };
        var gameData = new GameDataService(new TestEnvironment(FindRoot()), NullLogger<GameDataService>.Instance);
        return (new RoomIntegrityService(roomService, gameData, TimeProvider.System), roomService, room, target);
    }

    private static string FindRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Bunker.csproj"))) directory = directory.Parent;
        return directory?.FullName ?? throw new InvalidOperationException("Repository root not found");
    }

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
