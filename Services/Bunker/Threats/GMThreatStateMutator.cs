using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services;
using System.Security.Cryptography;
using System.Text;

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

    public static bool CanForceOutcome(Room room)
    {
        var state = room.ThreatState;
        if (room.CurrentThreat == null || state == null || !room.IsThreatRevealed || state.Resolution.EffectsApplied)
            return false;

        if (state.ThreatStatus is "hidden" or "aborted" or "resolved_safely" or "resolved_with_casualty" or "failed" or "completed" or "success" or "failure")
            return false;

        if (state.Resolution.CompletedAtRound != null || state.PlanChoice.ResolvedAtRound != null || !string.IsNullOrWhiteSpace(state.PlanChoice.Outcome))
            return false;

        return state.MiniGame.Status is not ("completed" or "resolved_safely" or "resolved_with_casualty" or "failed" or "aborted") &&
            string.IsNullOrWhiteSpace(state.MiniGame.Outcome);
    }

    public static string BuildForcePreviewFingerprint(Room room, string requestedOutcome)
    {
        lock (room.ThreatSyncRoot)
        {
            var state = room.ThreatState;
            var players = RoomService.GetPlayersSnapshot(room)
                .OrderBy(entry => RoomService.GetPlayerKey(entry.Value), StringComparer.OrdinalIgnoreCase)
                .Select(entry => $"{RoomService.GetPlayerKey(entry.Value)}:{entry.Value.IsEliminated}:{entry.Value.IsConnected}:{entry.Value.AdditionalConditionEffects.Count}");
            var contributions = state?.Contributions
                .OrderBy(item => item.ContributionId, StringComparer.OrdinalIgnoreCase)
                .Select(item => $"{item.ContributionId}:{item.Status}:{item.IsAccepted}:{item.IsConsumed}") ?? Enumerable.Empty<string>();
            var participants = state?.ParticipantPlayerIds.OrderBy(id => id, StringComparer.OrdinalIgnoreCase) ?? Enumerable.Empty<string>();
            var source = string.Join('|', new[]
            {
                requestedOutcome.Trim().ToLowerInvariant(), room.CurrentThreat?.Id ?? "", room.CurrentRound.ToString(),
                room.IsThreatRevealed.ToString(), state?.ThreatStatus ?? "", state?.Resolution.EffectsApplied.ToString() ?? "",
                state?.Resolution.CompletedAtRound?.ToString() ?? "", state?.MiniGame.Status ?? "", state?.MiniGame.Outcome ?? "",
                state?.MiniGame.ResultStatus ?? "", state?.PlanChoice.SelectedPlanId ?? "", state?.PlanChoice.Outcome ?? "",
                state?.PlanChoice.ResolvedAtRound?.ToString() ?? "", room.NextThreatAuditSequenceId.ToString(),
                string.Join(',', participants), string.Join(',', contributions), string.Join(',', players)
            });
            return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(source))).ToLowerInvariant();
        }
    }
}
