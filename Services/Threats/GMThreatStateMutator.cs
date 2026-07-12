using Bunker.Models;
using Bunker.Models.GameData;

namespace Bunker.Services.Threats;

public static class GMThreatStateMutator
{
    public static bool TryRememberCommand(Room room, string commandId)
    {
        lock (room.ProcessedGmThreatCommandIds) return room.ProcessedGmThreatCommandIds.Add(commandId);
    }

    public static void Replace(Room room, ThreatData threat, string initialStatus)
    {
        room.CurrentThreat = threat;
        room.IsThreatRevealed = true;
        room.ThreatRevealedAtRound = room.CurrentRound;
        room.CurrentPhase = GamePhase.Threat;
        room.ThreatState = new ThreatInteractionState
        {
            CurrentThreatId = threat.Id,
            ThreatStatus = initialStatus,
            ThreatRevealedRound = room.CurrentRound
        };
    }

    public static bool Abort(Room room)
    {
        lock (room.ThreatSyncRoot)
        {
            if (!CanReset(room)) return false;
            var previous = room.ThreatState!;
            var terminal = new ThreatInteractionState
            {
                CurrentThreatId = room.CurrentThreat!.Id,
                ThreatStatus = "aborted",
                ThreatRevealedRound = room.ThreatRevealedAtRound ?? room.CurrentRound,
                Resolution = previous.Resolution
            };
            terminal.Resolution.CompletedAtRound ??= room.CurrentRound;
            if (!terminal.Resolution.PublicResults.Contains("Загрозу скасовано ведучим."))
                terminal.Resolution.PublicResults.Add("Загрозу скасовано ведучим.");
            terminal.MiniGame.Status = "aborted";
            terminal.MiniGame.ResultStatus = "aborted";
            terminal.MiniGame.Outcome = "aborted";
            terminal.MiniGame.CompletedAtUtc = DateTimeOffset.UtcNow;
            room.ThreatState = terminal;
            room.IsThreatRevealed = true;
            return true;
        }
    }

    public static bool Restart(Room room)
    {
        lock (room.ThreatSyncRoot)
        {
            if (!CanReset(room)) return false;
            room.ThreatState = new ThreatInteractionState
            {
                CurrentThreatId = room.CurrentThreat!.Id,
                ThreatStatus = room.IsThreatRevealed ? "collecting_contributions" : "hidden",
                ThreatRevealedRound = room.ThreatRevealedAtRound ?? room.CurrentRound
            };
            return true;
        }
    }

    public static bool CanReset(Room room) =>
        room.CurrentThreat != null && room.ThreatState != null &&
        !room.ThreatState.Resolution.EffectsApplied &&
        room.ThreatState.ThreatStatus is not ("aborted" or "resolved_safely" or "resolved_with_casualty" or "failed" or "completed" or "success" or "failure");
}
