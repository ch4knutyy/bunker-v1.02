using Bunker.Models;
using Bunker.Services;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    private static readonly string[] DirectorCharacteristics =
        ["Personality", "Body", "Profession", "PhysicalHealth", "MentalHealth", "Hobby", "CharacterTrait", "Phobia", "Inventory", "Property", "Fact", "SpecialCard"];

    public Task<DirectorActionPreviewDto> PreviewDirectorAction(DirectorActionRequestDto request)
    {
        var action = DirectorControlService.Normalize(request.ActionType);
        var capability = DirectorCapability(action);
        var (room, actor) = RequireDirectorCaller(capability);
        var target = ResolveDirectorTarget(room, request.TargetPlayerId, action);
        var blockers = new List<string>(); var categories = new List<string>(); var mutationCount = 0;
        if (target != null && target.IsSpectatorGm) blockers.Add("spectator_target_blocked");
        switch (action)
        {
            case "reveal": case "hide":
                var category = NormalizeCharacteristicName(request.Category ?? "");
                if (!GmPlayerStateMutator.CanHideCharacteristic(category)) blockers.Add("invalid_category"); else categories.Add(category);
                mutationCount = target == null ? 0 : 1; break;
            case "reveal_all": case "hide_all":
                categories.AddRange(DirectorCharacteristics); mutationCount = target == null ? 0 : DirectorCharacteristics.Count(key => action == "reveal_all" ? !IsCharacteristicRevealed(target, key) : IsCharacteristicRevealed(target, key)); break;
            case "eliminate": if (target?.IsEliminated != false) blockers.Add("target_not_active"); else mutationCount = 1; break;
            case "restore": if (target?.IsEliminated != true) blockers.Add("target_not_eliminated"); else mutationCount = 1; break;
            case "condition_severity": case "condition_remove":
                categories.Add("AdditionalPhysicalConditions");
                if (target == null || string.IsNullOrWhiteSpace(request.Category) || !target.AdditionalConditionEffects.Any(x => x.Id == request.Category || x.ConditionId == request.Category)) blockers.Add("condition_not_found"); else mutationCount = 1; break;
            case "round_forward": if (!RoundVotingAdminService.TryParseRound(request.Option, out var round) || round < room.CurrentRound) blockers.Add("invalid_forward_round"); else mutationCount = round == room.CurrentRound ? 0 : 1; categories.Add("round"); break;
            case "pause": case "resume": categories.Add("pause"); mutationCount = room.IsPaused == (action == "pause") ? 0 : 1; break;
            case "reset_readiness": categories.Add("readiness"); mutationCount = room.VotingReadyResponses.Count; break;
            case "clear_votes": categories.Add("voting"); mutationCount = room.CurrentVoting?.Votes.Count ?? 0; break;
            case "remove_vote": categories.Add("voting"); mutationCount = 1; break;
            case "voting_resync": categories.Add("voting"); break;
            case "threat_force_success": case "threat_force_failure": if (!GMThreatStateMutator.CanForceOutcome(room)) blockers.Add("threat_terminal_or_unavailable"); else mutationCount = 1; categories.Add("current_threat"); break;
            case "threat_cancel": case "threat_restart": if (!GMThreatStateMutator.CanReset(room)) blockers.Add("threat_reset_unavailable"); else mutationCount = 1; categories.Add("current_threat"); break;
            case "threat_resync": categories.Add("current_threat"); break;
            default: blockers.Add("unsupported_action"); break;
        }
        if (NeedsPlayerTarget(action) && target == null) blockers.Add("target_not_found");
        return Task.FromResult(_directorControls.Preview(room, actor, request, target, categories, mutationCount, blockers.Count == 0, blockers));
    }

    public async Task<DirectorActionApplyDto> ApplyDirectorAction(DirectorActionRequestDto request, string previewToken,
        long stateVersion, string commandId, bool confirmed)
    {
        var action = DirectorControlService.Normalize(request.ActionType); var capability = DirectorCapability(action);
        var (room, actor) = RequireDirectorCaller(capability);
        if (!confirmed || string.IsNullOrWhiteSpace(commandId)) throw new HubException("director_confirmation_required");
        if (!_directorControls.TryConsume(room, actor, request, previewToken, stateVersion, commandId, out var threatFingerprint, out var duplicate, out var error))
        {
            if (duplicate != null) return duplicate;
            throw new HubException(error ?? "director_preview_invalid");
        }
        var target = ResolveDirectorTarget(room, request.TargetPlayerId, action);
        if (target?.IsSpectatorGm == true) throw new HubException("spectator_target_blocked");
        _activeDirectorCapability = capability;
        try
        {
            switch (action)
            {
                case "reveal": await ApplyDirectorReveal(room, actor, target!, [NormalizeCharacteristicName(request.Category ?? "")], commandId, false); break;
                case "hide": await HideRevealedCharacteristic(target!.StablePlayerId, request.Category!, commandId); break;
                case "reveal_all": await ApplyDirectorReveal(room, actor, target!, DirectorCharacteristics, commandId, false); break;
                case "hide_all": await ApplyDirectorReveal(room, actor, target!, DirectorCharacteristics, commandId, true); break;
                case "eliminate": await EliminatePlayer(target!.StablePlayerId); break;
                case "restore": await RestorePlayer(target!.StablePlayerId); break;
                case "condition_severity": await ChangeAdditionalConditionSeverity(target!.StablePlayerId, request.Category!, request.Option!, commandId); break;
                case "condition_remove": await RemoveAdditionalCondition(target!.StablePlayerId, request.Category!, commandId); break;
                case "pause": await SetGamePaused(true, request.Option, commandId); break;
                case "resume": await SetGamePaused(false, null, commandId); break;
                case "round_forward": await SetRoundNumber(request.Option, commandId); break;
                case "reset_readiness": await ResetRoundReadiness(commandId); break;
                case "clear_votes": await ClearCurrentVotes(commandId); break;
                case "remove_vote": await RemoveCurrentVote(request.TargetPlayerId!, commandId); break;
                case "voting_resync": await ResyncVotingState(); break;
                case "threat_force_success": await GMConfirmForceThreat("success", threatFingerprint!, commandId); break;
                case "threat_force_failure": await GMConfirmForceThreat("failure", threatFingerprint!, commandId); break;
                case "threat_cancel": await GMCancelCurrentThreat(commandId); break;
                case "threat_restart": await GMRestartCurrentThreat(commandId); break;
                case "threat_resync": await GMResyncThreatRoom(commandId); break;
            }
        }
        finally { _activeDirectorCapability = null; }
        await SendSafeRoomResync(room);
        await BroadcastOmniscientStateToAuthorizedSpectators(room);
        var audit = action.StartsWith("threat_", StringComparison.Ordinal) ? null : _gmAudit.GetRecent(room, 1).FirstOrDefault();
        var irreversible = action.StartsWith("threat_force_", StringComparison.Ordinal);
        return _directorControls.Remember(commandId, new(action, true, false, audit?.RelatedSnapshotId, !irreversible && audit?.CanUndo == true, DirectorControlService.StateVersion(room)));
    }

    private async Task ApplyDirectorReveal(Room room, Player actor, Player target, IEnumerable<string> categories, string commandId, bool hide)
    {
        var changed = categories.Where(GmPlayerStateMutator.CanHideCharacteristic)
            .Where(key => hide ? IsCharacteristicRevealed(target, key) : !IsCharacteristicRevealed(target, key)).ToList();
        if (changed.Count == 0) return;
        var snapshot = CreateMutationSnapshot(room, RoomService.GetPlayerKey(actor), hide ? "director_hide_all" : "director_reveal", commandId, "Before director reveal-state change");
        foreach (var key in changed) { if (hide) GmPlayerStateMutator.HideCharacteristic(target, key); else SetCharacteristicRevealed(target, key); }
        _roomService.UpdatePlayer(target.ConnectionId, target);
        await SendPersonalPlayerSnapshot(target.ConnectionId, target, hide ? "director_hidden" : "director_revealed");
        await SendPublicPlayersUpdate(room);
        await AppendGmAudit(room, RoomService.GetPlayerKey(actor), hide ? "director_characteristics_hidden" : "director_characteristics_revealed", GmAuditResult.Success,
            $"Director changed public reveal state for {changed.Count} categor(ies).", RoomService.GetPlayerKey(target), commandId, snapshot: snapshot);
    }

    private (Room Room, Player Actor) RequireDirectorCaller(GmCapability capability)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !_roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var actor) || !IsAuthorizedDirector(actor, capability) ||
            !room.IrreversibleOmniscientPlayerIds.Contains(RoomService.GetPlayerKey(actor))) throw new HubException("director_access_denied");
        return (room, actor);
    }
    private bool IsAuthorizedDirector(Player player, GmCapability capability) => _omniscientAccess.CanViewHidden(player, capability);
    private static GmCapability DirectorCapability(string action) => action.StartsWith("threat_", StringComparison.Ordinal) ? GmCapability.UseDirectorThreatControls :
        action is "pause" or "resume" or "round_forward" or "reset_readiness" or "clear_votes" or "remove_vote" or "voting_resync" ? GmCapability.UseDirectorRoundControls : GmCapability.UseDirectorPlayerControls;
    private Player? ResolveDirectorTarget(Room room, string? stablePlayerId, string action)
    {
        if (!NeedsPlayerTarget(action) && action != "remove_vote") return null;
        if (string.IsNullOrWhiteSpace(stablePlayerId)) return null;
        var target = _roomService.GetPlayerByAnyId(room, stablePlayerId);
        return target != null && string.Equals(target.StablePlayerId, stablePlayerId, StringComparison.Ordinal) ? target : null;
    }
    private static bool NeedsPlayerTarget(string action) => action is "reveal" or "hide" or "reveal_all" or "hide_all" or "eliminate" or "restore" or "condition_severity" or "condition_remove";
}
