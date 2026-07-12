using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class GameTimerServiceTests
{
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 7, 12, 10, 0, 0, TimeSpan.Zero));

    [Fact]
    public void StartCreatesCanonicalRunningTimerAndSafeDto()
    {
        var service = Service();
        var room = new Room();
        service.Start(room, 90, GameTimerPurpose.Round, "<Round one>");
        var dto = service.GetDto(room);
        Assert.Equal("Running", dto.Status);
        Assert.Equal("Round", dto.Purpose);
        Assert.Equal("Round one", dto.Label);
        Assert.Equal(90, dto.RemainingSeconds);
        Assert.Equal(_clock.GetUtcNow().AddSeconds(90), dto.DeadlineUtc);
        Assert.DoesNotContain(typeof(GameTimerDto).GetProperties(), property =>
            property.Name.Contains("Player", StringComparison.OrdinalIgnoreCase) || property.Name.Contains("Vote", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData("10", true)] [InlineData("7200", true)]
    [InlineData("9", false)] [InlineData("7201", false)] [InlineData("10.5", false)] [InlineData("", false)]
    public void DurationValidationIsStrict(string value, bool valid) =>
        Assert.Equal(valid, GameTimerService.TryParseDuration(value, out _));

    [Fact]
    public void PauseFreezesAndResumeRebuildsDeadline()
    {
        var service = Service(); var room = new Room();
        service.Start(room, 100, GameTimerPurpose.Custom, null);
        _clock.Advance(TimeSpan.FromSeconds(30));
        Assert.True(service.Pause(room));
        Assert.Equal(70, service.GetDto(room).RemainingSeconds);
        _clock.Advance(TimeSpan.FromMinutes(5));
        Assert.Equal(70, service.GetDto(room).RemainingSeconds);
        Assert.True(service.Resume(room));
        Assert.Equal(_clock.GetUtcNow().AddSeconds(70), service.GetDto(room).DeadlineUtc);
    }

    [Fact]
    public void RestartUsesDurationAndSetIsAbsolute()
    {
        var service = Service(); var room = new Room();
        service.Start(room, 120, GameTimerPurpose.Voting, null);
        _clock.Advance(TimeSpan.FromSeconds(40));
        service.Set(room, 30);
        Assert.Equal(30, service.GetDto(room).RemainingSeconds);
        service.Restart(room);
        Assert.Equal(30, service.GetDto(room).RemainingSeconds);
        Assert.Equal(30, room.GameTimer.DurationSeconds);
    }

    [Fact]
    public void AdjustRespectsBoundsAndZeroExpires()
    {
        var service = Service(); var room = new Room();
        service.Start(room, 60, GameTimerPurpose.Round, null);
        Assert.True(service.Adjust(room, 30));
        Assert.Equal(90, service.GetDto(room).RemainingSeconds);
        Assert.False(service.Adjust(room, 7200));
        Assert.Equal(90, service.GetDto(room).RemainingSeconds);
        Assert.True(service.Adjust(room, -90));
        Assert.Equal("Expired", service.GetDto(room).Status);
        Assert.Equal(0, service.GetDto(room).RemainingSeconds);
    }

    [Fact]
    public void ExpiryOccursOnceWithoutChangingGameState()
    {
        var service = Service();
        var voting = new VotingSession { State = VotingState.Active };
        var threat = new ThreatInteractionState { ThreatStatus = "active" };
        var room = new Room { CurrentRound = 4, CurrentPhase = GamePhase.Voting, CurrentVoting = voting, ThreatState = threat };
        service.Start(room, 10, GameTimerPurpose.Voting, null);
        _clock.Advance(TimeSpan.FromSeconds(11));
        Assert.True(service.TryExpire(room, out var first));
        Assert.False(service.TryExpire(room, out var second));
        Assert.Equal("Expired", first.Status);
        Assert.Equal("Expired", second.Status);
        Assert.Equal(4, room.CurrentRound);
        Assert.Equal(GamePhase.Voting, room.CurrentPhase);
        Assert.Same(voting, room.CurrentVoting);
        Assert.Same(threat, room.ThreatState);
    }

    [Fact]
    public void GamePauseResumesOnlyAutoPausedTimer()
    {
        var service = Service(); var room = new Room();
        service.Start(room, 60, GameTimerPurpose.Round, null);
        Assert.True(service.Pause(room, byGamePause: true));
        Assert.True(room.GameTimer.PausedByGamePause);
        Assert.True(service.Resume(room, onlyIfPausedByGame: true));

        Assert.True(service.Pause(room));
        Assert.False(room.GameTimer.PausedByGamePause);
        Assert.False(service.Resume(room, onlyIfPausedByGame: true));
        Assert.Equal(GameTimerStatus.Paused, room.GameTimer.Status);
    }

    [Fact]
    public void StopKeepsDurationForRestart()
    {
        var service = Service(); var room = new Room();
        service.Start(room, 45, GameTimerPurpose.Threat, null);
        service.Stop(room);
        Assert.Equal(GameTimerStatus.Stopped, room.GameTimer.Status);
        Assert.Null(room.GameTimer.DeadlineUtc);
        Assert.True(service.Restart(room));
        Assert.Equal(45, service.GetDto(room).RemainingSeconds);
    }

    private GameTimerService Service() => new(_clock);

    private sealed class FakeTimeProvider(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan value) => _now += value;
    }
}
