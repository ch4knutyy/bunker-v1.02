using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services.Threats;

namespace Bunker.UnitTests.Services.Threats;

public class ThreatAuditServiceTests
{
    private static readonly DateTimeOffset Start = new(2026, 7, 12, 9, 8, 7, TimeSpan.Zero);

    [Fact]
    public void AppendsCanonicalEventsWithMonotonicSequenceAndUtcTime()
    {
        var clock = new FakeTimeProvider(Start);
        var service = new ThreatAuditService(clock);
        var room = RoomWithThreat();

        Assert.True(service.Append(room, ThreatAuditEventType.Revealed, deduplicateTransition: true));
        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.True(service.Append(room, ThreatAuditEventType.AttemptStarted));
        Assert.True(service.Append(room, ThreatAuditEventType.AttemptReset, "gm-1", "reset-1"));
        Assert.True(service.Append(room, ThreatAuditEventType.CompletedFailure, deduplicateTransition: true));
        Assert.True(service.Append(room, ThreatAuditEventType.EffectsApplied, deduplicateTransition: true));

        Assert.Equal([1L, 2, 3, 4, 5], room.ThreatAuditLog.Select(entry => entry.SequenceId));
        Assert.Equal(Start, room.ThreatAuditLog[0].TimestampUtc);
        Assert.Equal(Start.AddSeconds(1), room.ThreatAuditLog[1].TimestampUtc);
        Assert.All(room.ThreatAuditLog, entry => Assert.Equal("radiation_leak", entry.ThreatId));
    }

    [Fact]
    public void TransitionAndCommandDedupePreventDuplicateAuditRows()
    {
        var service = new ThreatAuditService(new FakeTimeProvider(Start));
        var room = RoomWithThreat();

        Assert.True(service.Append(room, ThreatAuditEventType.Revealed, deduplicateTransition: true));
        Assert.False(service.Append(room, ThreatAuditEventType.Revealed, deduplicateTransition: true));
        Assert.True(service.Append(room, ThreatAuditEventType.AttemptReset, commandId: "same-command"));
        Assert.False(service.Append(room, ThreatAuditEventType.AttemptReset, commandId: "same-command"));
        Assert.Equal(2, room.ThreatAuditLog.Count);
    }

    [Fact]
    public void ANewRevealAllowsTheSameThreatToCompleteAgainWithoutDuplicatingEitherAttempt()
    {
        var service = new ThreatAuditService(new FakeTimeProvider(Start));
        var room = RoomWithThreat();

        service.Append(room, ThreatAuditEventType.Revealed);
        Assert.True(service.Append(room, ThreatAuditEventType.CompletedSuccess, deduplicateTransition: true));
        Assert.False(service.Append(room, ThreatAuditEventType.CompletedSuccess, deduplicateTransition: true));
        service.Append(room, ThreatAuditEventType.Revealed);
        Assert.True(service.Append(room, ThreatAuditEventType.CompletedSuccess, deduplicateTransition: true));

        Assert.Equal(2, room.ThreatAuditLog.Count(entry => entry.EventType == ThreatAuditEventType.CompletedSuccess));
        Assert.Equal(2, room.ThreatAuditLog.Where(entry => entry.EventType == ThreatAuditEventType.CompletedSuccess)
            .Select(entry => entry.AttemptId).Distinct().Count());
    }

    [Fact]
    public void ResetStartsANewAttemptForTransitionDedupe()
    {
        var service = new ThreatAuditService(new FakeTimeProvider(Start));
        var room = RoomWithThreat();
        service.Append(room, ThreatAuditEventType.Revealed);
        Assert.True(service.Append(room, ThreatAuditEventType.AttemptStarted, deduplicateTransition: true));
        Assert.False(service.Append(room, ThreatAuditEventType.AttemptStarted, deduplicateTransition: true));

        service.Append(room, ThreatAuditEventType.AttemptReset, commandId: "reset-2");

        Assert.True(service.Append(room, ThreatAuditEventType.AttemptStarted, deduplicateTransition: true));
        Assert.Equal(2, room.ThreatAuditLog.Count(entry => entry.EventType == ThreatAuditEventType.AttemptStarted));
    }

    [Fact]
    public void AbortDoesNotInventEffectsAppliedEvent()
    {
        var service = new ThreatAuditService(new FakeTimeProvider(Start));
        var room = RoomWithThreat();

        Assert.True(GMThreatStateMutator.Abort(room));
        service.Append(room, ThreatAuditEventType.Aborted, "gm-1", "abort-1");

        Assert.Single(room.ThreatAuditLog);
        Assert.Equal(ThreatAuditEventType.Aborted, room.ThreatAuditLog[0].EventType);
        Assert.False(room.ThreatState!.Resolution.EffectsApplied);
    }

    [Fact]
    public void KeepsLastTwoHundredWithoutResettingSequence()
    {
        var service = new ThreatAuditService(new FakeTimeProvider(Start));
        var room = RoomWithThreat();
        for (var i = 0; i < 205; i++)
            service.Append(room, ThreatAuditEventType.AttemptStarted);

        Assert.Equal(ThreatAuditService.MaxEntriesPerRoom, room.ThreatAuditLog.Count);
        Assert.Equal(6, room.ThreatAuditLog[0].SequenceId);
        Assert.Equal(205, room.ThreatAuditLog[^1].SequenceId);
        Assert.Equal(205, room.NextThreatAuditSequenceId);
    }

    [Fact]
    public void GmDtoOmitsCommandIdAndUnsafeMetadata()
    {
        var service = new ThreatAuditService(new FakeTimeProvider(Start));
        var room = RoomWithThreat();
        service.Append(room, ThreatAuditEventType.CompletedSuccess, commandId: "private-command", metadata: new Dictionary<string, string>
        {
            ["outcome"] = "resolved_safely",
            ["secretRoll"] = "99"
        });

        var dto = Assert.Single(service.GetRecent(room));
        Assert.Null(dto.GetType().GetProperty("CommandId"));
        Assert.Equal("resolved_safely", dto.Metadata["outcome"]);
        Assert.DoesNotContain("secretRoll", dto.Metadata.Keys);
    }

    private static Room RoomWithThreat() => new()
    {
        Id = "ROOM",
        CurrentRound = 3,
        ThreatRevealedAtRound = 3,
        CurrentThreat = new ThreatData { Id = "radiation_leak", Name = "Radiation leak" },
        ThreatState = new ThreatInteractionState { CurrentThreatId = "radiation_leak", ThreatRevealedRound = 3 }
    };

    private sealed class FakeTimeProvider(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan value) => _now += value;
    }
}
