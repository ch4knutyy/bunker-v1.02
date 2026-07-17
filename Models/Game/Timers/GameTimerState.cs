using System.Text.Json.Serialization;

namespace Bunker.Models;

public enum GameTimerStatus { Stopped, Running, Paused, Expired }
public enum GameTimerPurpose { Round, Voting, Threat, Custom }

public sealed class GameTimerState
{
    public GameTimerStatus Status { get; set; } = GameTimerStatus.Stopped;
    public GameTimerPurpose Purpose { get; set; } = GameTimerPurpose.Round;
    public int DurationSeconds { get; set; } = 300;
    public DateTimeOffset? StartedAtUtc { get; set; }
    public DateTimeOffset? DeadlineUtc { get; set; }
    public DateTimeOffset? PausedAtUtc { get; set; }
    public int RemainingSecondsWhenPaused { get; set; } = 300;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public string? Label { get; set; }
    public bool PausedByGamePause { get; set; }

    [JsonIgnore]
    public object SyncRoot { get; } = new();
}

public sealed record GameTimerDto(
    string Status,
    string Purpose,
    string? Label,
    int DurationSeconds,
    DateTimeOffset? DeadlineUtc,
    int RemainingSeconds,
    DateTimeOffset ServerTimestampUtc,
    DateTimeOffset UpdatedAtUtc);
