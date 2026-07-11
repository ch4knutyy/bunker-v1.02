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

    public static void Cancel(Room room)
    {
        room.CurrentThreat = null;
        room.ThreatState = null;
        room.IsThreatRevealed = false;
        room.ThreatRevealedAtRound = null;
    }

    public static bool Restart(Room room)
    {
        if (room.CurrentThreat == null || room.ThreatState?.Resolution.EffectsApplied == true) return false;
        room.ThreatState = new ThreatInteractionState
        {
            CurrentThreatId = room.CurrentThreat.Id,
            ThreatStatus = room.IsThreatRevealed ? "collecting_contributions" : "hidden",
            ThreatRevealedRound = room.ThreatRevealedAtRound
        };
        return true;
    }
}
