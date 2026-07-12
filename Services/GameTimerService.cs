using Bunker.Models;
using System.Globalization;

namespace Bunker.Services;

public sealed class GameTimerService(TimeProvider timeProvider)
{
    public DateTimeOffset UtcNow => timeProvider.GetUtcNow();

    public static bool TryParseDuration(string? value, out int seconds)
    {
        seconds = 0;
        return !string.IsNullOrWhiteSpace(value) &&
               int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out seconds) &&
               seconds is >= 10 and <= 7200;
    }

    public static bool TryParsePurpose(string? value, out GameTimerPurpose purpose) =>
        Enum.TryParse(value, true, out purpose) && Enum.IsDefined(purpose);

    public GameTimerDto GetDto(Room room)
    {
        var now = UtcNow;
        lock (room.GameTimer.SyncRoot) return BuildDto(room.GameTimer, now);
    }

    public bool Start(Room room, int seconds, GameTimerPurpose purpose, string? label)
    {
        var now = UtcNow;
        lock (room.GameTimer.SyncRoot)
        {
            var timer = room.GameTimer;
            timer.Status = GameTimerStatus.Running;
            timer.Purpose = purpose;
            timer.DurationSeconds = seconds;
            timer.StartedAtUtc = now;
            timer.DeadlineUtc = now.AddSeconds(seconds);
            timer.PausedAtUtc = null;
            timer.RemainingSecondsWhenPaused = seconds;
            timer.UpdatedAtUtc = now;
            timer.Label = SanitizeLabel(label);
            timer.PausedByGamePause = false;
            return true;
        }
    }

    public bool Pause(Room room, bool byGamePause = false)
    {
        var now = UtcNow;
        lock (room.GameTimer.SyncRoot)
        {
            var timer = room.GameTimer;
            if (timer.Status != GameTimerStatus.Running) return false;
            timer.RemainingSecondsWhenPaused = Remaining(timer, now);
            timer.Status = timer.RemainingSecondsWhenPaused == 0 ? GameTimerStatus.Expired : GameTimerStatus.Paused;
            timer.DeadlineUtc = null;
            timer.PausedAtUtc = now;
            timer.UpdatedAtUtc = now;
            timer.PausedByGamePause = byGamePause && timer.Status == GameTimerStatus.Paused;
            return true;
        }
    }

    public bool Resume(Room room, bool onlyIfPausedByGame = false)
    {
        var now = UtcNow;
        lock (room.GameTimer.SyncRoot)
        {
            var timer = room.GameTimer;
            if (timer.Status != GameTimerStatus.Paused || (onlyIfPausedByGame && !timer.PausedByGamePause)) return false;
            timer.Status = GameTimerStatus.Running;
            timer.StartedAtUtc = now;
            timer.DeadlineUtc = now.AddSeconds(timer.RemainingSecondsWhenPaused);
            timer.PausedAtUtc = null;
            timer.UpdatedAtUtc = now;
            timer.PausedByGamePause = false;
            return true;
        }
    }

    public bool Restart(Room room)
    {
        lock (room.GameTimer.SyncRoot)
        {
            var timer = room.GameTimer;
            if (timer.DurationSeconds is < 10 or > 7200) return false;
            var now = UtcNow;
            timer.Status = GameTimerStatus.Running;
            timer.StartedAtUtc = now;
            timer.DeadlineUtc = now.AddSeconds(timer.DurationSeconds);
            timer.PausedAtUtc = null;
            timer.RemainingSecondsWhenPaused = timer.DurationSeconds;
            timer.UpdatedAtUtc = now;
            timer.PausedByGamePause = false;
            return true;
        }
    }

    public bool Set(Room room, int seconds)
    {
        var now = UtcNow;
        lock (room.GameTimer.SyncRoot)
        {
            var timer = room.GameTimer;
            timer.DurationSeconds = seconds;
            timer.RemainingSecondsWhenPaused = seconds;
            if (timer.Status == GameTimerStatus.Running) timer.DeadlineUtc = now.AddSeconds(seconds);
            else timer.DeadlineUtc = null;
            if (timer.Status == GameTimerStatus.Expired) timer.Status = GameTimerStatus.Stopped;
            timer.UpdatedAtUtc = now;
            return true;
        }
    }

    public bool Adjust(Room room, int deltaSeconds)
    {
        var now = UtcNow;
        lock (room.GameTimer.SyncRoot)
        {
            var timer = room.GameTimer;
            var adjusted = Remaining(timer, now) + deltaSeconds;
            if (adjusted is < 0 or > 7200) return false;
            timer.RemainingSecondsWhenPaused = adjusted;
            if (adjusted == 0)
            {
                timer.Status = GameTimerStatus.Expired;
                timer.DeadlineUtc = null;
                timer.PausedAtUtc = null;
                timer.PausedByGamePause = false;
            }
            else if (timer.Status == GameTimerStatus.Running) timer.DeadlineUtc = now.AddSeconds(adjusted);
            timer.UpdatedAtUtc = now;
            return true;
        }
    }

    public bool Stop(Room room)
    {
        var now = UtcNow;
        lock (room.GameTimer.SyncRoot)
        {
            var timer = room.GameTimer;
            timer.Status = GameTimerStatus.Stopped;
            timer.DeadlineUtc = null;
            timer.PausedAtUtc = null;
            timer.RemainingSecondsWhenPaused = timer.DurationSeconds;
            timer.UpdatedAtUtc = now;
            timer.PausedByGamePause = false;
            return true;
        }
    }

    public bool TryExpire(Room room, out GameTimerDto dto)
    {
        var now = UtcNow;
        lock (room.GameTimer.SyncRoot)
        {
            var timer = room.GameTimer;
            if (timer.Status != GameTimerStatus.Running || timer.DeadlineUtc is null || timer.DeadlineUtc > now)
            {
                dto = BuildDto(timer, now);
                return false;
            }
            timer.Status = GameTimerStatus.Expired;
            timer.DeadlineUtc = null;
            timer.RemainingSecondsWhenPaused = 0;
            timer.UpdatedAtUtc = now;
            timer.PausedByGamePause = false;
            dto = BuildDto(timer, now);
            return true;
        }
    }

    private static GameTimerDto BuildDto(GameTimerState timer, DateTimeOffset now) => new(
        timer.Status.ToString(), timer.Purpose.ToString(), timer.Label, timer.DurationSeconds,
        timer.DeadlineUtc, Remaining(timer, now), now, timer.UpdatedAtUtc);

    private static int Remaining(GameTimerState timer, DateTimeOffset now) => timer.Status switch
    {
        GameTimerStatus.Running when timer.DeadlineUtc != null => Math.Max(0, (int)Math.Ceiling((timer.DeadlineUtc.Value - now).TotalSeconds)),
        GameTimerStatus.Expired => 0,
        _ => Math.Max(0, timer.RemainingSecondsWhenPaused)
    };

    private static string? SanitizeLabel(string? label)
    {
        if (string.IsNullOrWhiteSpace(label)) return null;
        var clean = new string(label.Where(character => !char.IsControl(character)).ToArray()).Replace("<", "").Replace(">", "").Trim();
        return clean.Length > 80 ? clean[..80] : clean;
    }
}
