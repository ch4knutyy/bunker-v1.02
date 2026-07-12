using System.Text.Json;
using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class GmAuditServiceTests
{
    [Fact]
    public void Audit_StoresAllResultsWithoutHiddenValues()
    {
        var room = new Room();
        var service = new GmAuditService(TimeProvider.System);
        service.Append(room, "host", "player_resync", GmAuditResult.Success, "Player public state was resynchronized.", "player");
        service.Append(room, "host", "round_change", GmAuditResult.Rejected, "Manual round change was rejected.", errorCode: "blocked");
        service.Append(room, "host", "room_auto_fix", GmAuditResult.Failed, "Safe repair failed.", errorCode: "failed");

        var entries = service.GetRecent(room);
        Assert.Contains(entries, entry => entry.Result == "success");
        Assert.Contains(entries, entry => entry.Result == "rejected");
        Assert.Contains(entries, entry => entry.Result == "failed");
        var json = JsonSerializer.Serialize(entries).ToLowerInvariant();
        Assert.DoesNotContain("physicalhealth", json);
        Assert.DoesNotContain("inventory", json);
        Assert.DoesNotContain("secret vote", json);
        Assert.All(entries, entry => Assert.False(entry.CanUndo));
    }

    [Fact]
    public void Audit_IsCappedAtTwoHundredOldestFirst()
    {
        var room = new Room();
        var service = new GmAuditService(TimeProvider.System);
        for (var index = 0; index < 205; index++)
            service.Append(room, "host", "round_change", GmAuditResult.Success, $"Round command {index}.");

        Assert.Equal(200, room.GmAuditLog.Count);
        Assert.Equal(6, room.GmAuditLog[0].Id);
        Assert.Equal(205, room.GmAuditLog[^1].Id);
        Assert.Equal(50, service.GetRecent(room).Count);
    }
}
