using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public async Task GMPreviewForceThreat(string requestedOutcome, string? language = null)
    {
        if (GetForceThreatRoom() is not { } room)
        {
            await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав для примусового завершення загрози");
            return;
        }
        if (!TryNormalizeForceOutcome(requestedOutcome, out var outcome))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Некоректний примусовий результат загрози");
            return;
        }

        GMThreatForcePreviewDto? preview;
        lock (room.ThreatSyncRoot)
        {
            preview = GMThreatStateMutator.CanForceOutcome(room)
                ? BuildForceThreatPreview(room, outcome, NormalizeThreatLanguage(language))
                : null;
        }
        if (preview == null)
        {
            await Clients.Caller.SendAsync("ReceiveError", "Примусово завершити можна лише активну незавершену загрозу");
            return;
        }
        await Clients.Caller.SendAsync("GMThreatForcePreview", preview);
    }

    public async Task GMConfirmForceThreat(string requestedOutcome, string previewFingerprint, string commandId, string? language = null)
    {
        if (GetForceThreatRoom() is not { } room)
        {
            await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав для примусового завершення загрози");
            return;
        }
        if (!TryNormalizeForceOutcome(requestedOutcome, out var outcome) ||
            string.IsNullOrWhiteSpace(previewFingerprint) || string.IsNullOrWhiteSpace(commandId))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Некоректні дані підтвердження примусового завершення");
            return;
        }

        var duplicate = false;
        var stale = false;
        var terminal = false;
        var applied = false;
        ThreatMiniGamePublicState? miniGamePublicState = null;
        lock (room.ThreatSyncRoot)
        {
            lock (room.ProcessedGmThreatCommandIds)
                duplicate = room.ProcessedGmThreatCommandIds.Contains(commandId);

            if (!duplicate && !GMThreatStateMutator.CanForceOutcome(room))
                terminal = true;
            else if (!duplicate)
            {
                var currentPreview = BuildForceThreatPreview(room, outcome, NormalizeThreatLanguage(language));
                stale = !string.Equals(currentPreview.Fingerprint, previewFingerprint, StringComparison.Ordinal);
                if (!stale && TryRememberThreatCommand(room, commandId))
                    applied = ForceFinalizeThreatLocked(room, outcome, GetThreatActorId(room), commandId, out miniGamePublicState);
            }
        }

        if (duplicate)
        {
            await SyncThreatRoom(room);
            return;
        }
        if (stale)
        {
            await Clients.Caller.SendAsync("GMThreatForceRejected", new { code = "stale_preview", message = "Стан загрози змінився. Створіть preview повторно." });
            return;
        }
        if (terminal || !applied)
        {
            await Clients.Caller.SendAsync("ReceiveError", "Загроза вже завершена або має зафіксований результат");
            return;
        }

        if (miniGamePublicState != null)
            await Clients.Group(room.Id).SendAsync("ThreatMiniGameUpdated", miniGamePublicState);
        await SyncThreatRoom(room, outcome == "success" ? "Загрозу примусово завершено успіхом" : "Загрозу примусово завершено провалом");
    }

    public async Task GetGMThreatControlData()
    {
        if (!TryGetHostRoom(out var room)) return;
        await Clients.Caller.SendAsync("GMThreatControlData", BuildGMThreatControlData(room));
    }

    public async Task GMGenerateRandomRareThreat(string commandId, bool confirmedReplace)
    {
        if (!TryGetHostRoom(out var room) || !await CanRunThreatReplacement(room, commandId, confirmedReplace)) return;
        var rare = _gameData.Threats.Where(IsAvailableSpecialThreat).ToList();
        if (rare.Count == 0)
        {
            await Clients.Caller.SendAsync("ReceiveError", "Немає доступних рідкісних загроз");
            return;
        }
        await ReplaceThreatForGM(room, rare[_random.Next(rare.Count)], commandId, "Випадкову рідкісну загрозу запущено");
    }

    public async Task GMGenerateTextThreat(string commandId, bool confirmedReplace)
    {
        if (!TryGetHostRoom(out var room) || !await CanRunThreatReplacement(room, commandId, confirmedReplace)) return;
        var selected = new ThreatPoolSelector().Select(
            _gameData.Threats,
            _ => false,
            _random.Next,
            _gameData.Threats.FirstOrDefault() ?? new ThreatData { Id = "fallback_threat", Name = "Невідома загроза" });
        if (IsExplicitSpecialThreat(selected))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Немає доступних текстових загроз");
            return;
        }
        await ReplaceThreatForGM(room, selected, commandId, "Випадкову текстову загрозу запущено");
    }

    public async Task GMSelectThreat(string threatId, string commandId, bool confirmedReplace)
    {
        if (!TryGetHostRoom(out var room)) return;
        if (!HasGmCapability(room, GmCapability.BrowseFutureThreatCatalog))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Поточний режим GM не дозволяє вибір майбутньої загрози");
            return;
        }
        if (!await CanRunThreatReplacement(room, commandId, confirmedReplace)) return;
        var threat = _gameData.Threats.FirstOrDefault(item => string.Equals(item.Id, threatId, StringComparison.OrdinalIgnoreCase));
        if (threat == null || (IsExplicitSpecialThreat(threat) && !IsAvailableSpecialThreat(threat)))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Загрозу не знайдено або її механіка недоступна");
            return;
        }
        await ReplaceThreatForGM(room, threat, commandId, "Обрану загрозу запущено");
    }

    public async Task GMCancelCurrentThreat(string commandId)
    {
        if (await GetThreatRecoveryRoom(commandId) is not { } room) return;
        if (!TryRememberThreatCommand(room, commandId)) { await SyncThreatRoom(room); return; }
        if (GMThreatStateMutator.CanReset(room))
            _ = CreateMutationSnapshot(room, GetThreatActorId(room) ?? "unknown", "threat_cancel", commandId, "Before threat cancel");
        var aborted = false;
        lock (room.ThreatSyncRoot)
        {
            aborted = GMThreatStateMutator.Abort(room);
            if (aborted) _threatAudit.Append(room, ThreatAuditEventType.Aborted, GetThreatActorId(room), commandId);
        }
        if (!aborted)
        {
            await Clients.Caller.SendAsync("ReceiveError", "Скасувати можна лише активну незавершену загрозу");
            return;
        }
        await SyncThreatRoom(room, "Загрозу скасовано ведучим");
        await SendRoomSnapshots(room, Clients.Client(room.HostConnectionId));
    }

    public async Task GMRestartCurrentThreat(string commandId)
    {
        if (await GetThreatRecoveryRoom(commandId) is not { } room) return;
        if (!TryRememberThreatCommand(room, commandId)) { await SyncThreatRoom(room); return; }
        if (GMThreatStateMutator.CanReset(room))
            _ = CreateMutationSnapshot(room, GetThreatActorId(room) ?? "unknown", "threat_restart", commandId, "Before threat restart");
        var restarted = false;
        lock (room.ThreatSyncRoot)
        {
            restarted = GMThreatStateMutator.Restart(room);
            if (restarted) _threatAudit.Append(room, ThreatAuditEventType.AttemptReset, GetThreatActorId(room), commandId);
        }
        if (!restarted)
        {
            await Clients.Caller.SendAsync("ReceiveError", "Перезапустити можна лише активну незавершену загрозу");
            return;
        }
        EnsureRadiationThreatState(room);
        await SyncThreatRoom(room, "Поточний прогрес спроби очищено");
        await SendRoomSnapshots(room, Clients.Client(room.HostConnectionId));
    }

    public async Task GMResyncThreatRoom(string commandId)
    {
        if (await GetThreatRecoveryRoom(commandId) is not { } room) return;
        if (!TryRememberThreatCommand(room, commandId)) { await SyncThreatRoom(room); return; }
        await SyncThreatRoom(room, "Кімнату синхронізовано");
    }

    private async Task<Room?> GetThreatRecoveryRoom(string? commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !HasGmCapability(room, GmCapability.ManagePublicGameState))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав для аварійного керування загрозою");
            return null;
        }
        if (string.IsNullOrWhiteSpace(commandId))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Некоректний ідентифікатор GM-команди");
            return null;
        }
        return room;
    }

    private Room? GetForceThreatRoom()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        return room != null &&
            _roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var player) &&
            (room.IsHost(player) || (_activeDirectorCapability == GmCapability.UseDirectorThreatControls && IsAuthorizedDirector(player, GmCapability.UseDirectorThreatControls))) &&
            HasGmCapability(room, GmCapability.ManagePublicGameState)
                ? room
                : null;
    }

    private static bool TryNormalizeForceOutcome(string? value, out string outcome)
    {
        outcome = value?.Trim().ToLowerInvariant() ?? "";
        return outcome is "success" or "failure";
    }

    private GMThreatForcePreviewDto BuildForceThreatPreview(Room room, string outcome, string language)
    {
        var threat = room.CurrentThreat!;
        var state = room.ThreatState!;
        var isFailure = outcome == "failure";
        var effectsWillBeApplied = false;
        var affectedPlayers = 0;

        if (string.Equals(threat.Id, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase))
        {
            effectsWillBeApplied = true;
            if (isFailure)
            {
                var participantIds = GetThreatParticipantIds(state);
                if (participantIds.Count == 0 && !string.IsNullOrWhiteSpace(state.VolunteerSelection.SelectedPlayerId))
                    participantIds.Add(state.VolunteerSelection.SelectedPlayerId);
                affectedPlayers = participantIds.Distinct(StringComparer.OrdinalIgnoreCase)
                    .Count(id => !state.OperationBonuses.ProtectedPlayerIds.Contains(id, StringComparer.OrdinalIgnoreCase));
            }
        }
        else if (string.Equals(threat.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase) &&
            TryGetForcedPlanElement(threat.Mechanics, state.PlanChoice.SelectedPlanId, out var plan))
        {
            var effectsKey = isFailure ? "onFailure" : "onSafeSuccess";
            if (plan.TryGetProperty("effects", out var effects) && effects.TryGetProperty(effectsKey, out var list) && list.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                effectsWillBeApplied = list.EnumerateArray().Any(effect => GetJsonString(effect, "", "type") != "resolve_threat");
                affectedPlayers = list.EnumerateArray().Any(effect => GetJsonString(effect, "", "target") == "all_active_players")
                    ? GetActiveThreatPlayers(room).Count()
                    : list.EnumerateArray().Any(effect => GetJsonString(effect, "", "type") == "add_physical_condition") ? 1 : 0;
            }
        }

        var localized = language switch
        {
            "en" => isFailure
                ? ("The threat will be forcibly completed as a failure. Standard failure effects may be applied and cannot be rolled back automatically.", "Effects already applied cannot be rolled back automatically.")
                : ("The threat will be forcibly completed successfully. The unfinished attempt will be closed.", "Effects already applied cannot be rolled back automatically."),
            "ru" => isFailure
                ? ("Угроза будет принудительно завершена провалом. Стандартные последствия провала могут быть применены и не могут быть автоматически отменены.", "Уже применённые последствия нельзя автоматически откатить.")
                : ("Угроза будет принудительно завершена успехом. Незавершённая попытка будет закрыта.", "Уже применённые последствия нельзя автоматически откатить."),
            _ => isFailure
                ? ("Загрозу буде примусово завершено провалом. Стандартні наслідки провалу можуть бути застосовані й не можуть бути автоматично відкочені.", "Уже застосовані наслідки не можна автоматично відкотити.")
                : ("Загрозу буде примусово завершено успіхом. Незавершена спроба буде закрита.", "Уже застосовані наслідки не можна автоматично відкотити.")
        };
        var scope = language switch
        {
            "en" => effectsWillBeApplied ? "Current threat effects pipeline" : "Threat state only",
            "ru" => effectsWillBeApplied ? "Текущий механизм последствий угрозы" : "Только состояние угрозы",
            _ => effectsWillBeApplied ? "Чинний механізм наслідків загрози" : "Лише стан загрози"
        };
        return new GMThreatForcePreviewDto(
            threat.Id,
            GetLocalizedThreatName(threat, language),
            room.CurrentRound,
            outcome,
            effectsWillBeApplied,
            scope,
            affectedPlayers,
            localized.Item1,
            localized.Item2,
            GMThreatStateMutator.BuildForcePreviewFingerprint(room, outcome));
    }

    private static string GetLocalizedThreatName(ThreatData threat, string language)
    {
        if (threat.I18n != null && threat.I18n.TryGetValue(language, out var localized) &&
            localized.ValueKind == System.Text.Json.JsonValueKind.Object && localized.TryGetProperty("name", out var name) &&
            name.ValueKind == System.Text.Json.JsonValueKind.String && !string.IsNullOrWhiteSpace(name.GetString()))
            return name.GetString()!;
        return threat.Name;
    }

    private bool TryGetHostRoom(out Room room)
    {
        room = _roomService.GetPlayerRoom(Context.ConnectionId)!;
        return room != null && IsCallerHost();
    }

    private async Task<bool> CanRunThreatReplacement(Room room, string commandId, bool confirmed)
    {
        if (string.IsNullOrWhiteSpace(commandId))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Некоректний ідентифікатор GM-команди");
            return false;
        }
        if (room.ProcessedGmThreatCommandIds.Contains(commandId)) return true;
        var unfinished = room.CurrentThreat != null && room.ThreatState?.Resolution.EffectsApplied != true;
        if (unfinished && !confirmed)
        {
            await Clients.Caller.SendAsync("ReceiveError", "Потрібне подвійне підтвердження заміни активної загрози");
            return false;
        }
        return true;
    }

    private async Task ReplaceThreatForGM(Room room, ThreatData source, string commandId, string message)
    {
        if (!TryRememberThreatCommand(room, commandId)) { await SyncThreatRoom(room); return; }
        _ = CreateMutationSnapshot(room, GetThreatActorId(room) ?? "unknown", "threat_replace", commandId, "Before threat replacement");
        lock (room.ThreatSyncRoot)
        {
            GMThreatStateMutator.Replace(room, CloneThreatData(source), IsExplicitSpecialThreat(source) ? "collecting_contributions" : "revealed");
            EnsureRadiationThreatState(room);
            _threatAudit.Append(room, ThreatAuditEventType.Revealed, GetThreatActorId(room), commandId);
        }
        await SyncThreatRoom(room, message);
        await SendRoomSnapshots(room, Clients.Client(room.HostConnectionId));
    }

    private string? GetThreatActorId(Room room) =>
        _roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var player)
            ? RoomService.GetPlayerKey(player)
            : null;

    private bool TryRememberThreatCommand(Room room, string commandId)
    {
        return GMThreatStateMutator.TryRememberCommand(room, commandId);
    }

    private async Task SyncThreatRoom(Room room, string? message = null)
    {
        var roundState = BuildRoundState(room);
        await Clients.Group(room.Id).SendAsync("RoundStateUpdated", roundState);
        await BroadcastThreatState(room, room.Id);
        await Clients.Caller.SendAsync("GMThreatControlData", BuildGMThreatControlData(room));
        if (!string.IsNullOrWhiteSpace(message))
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = message });
    }

    private object BuildGMThreatControlData(Room room)
    {
        var canBrowseFutureThreatCatalog = GmCapabilities.Allows(room.GmMode, GmCapability.BrowseFutureThreatCatalog);
        return new
        {
        gmMode = room.GmMode.ToString(),
        canBrowseFutureThreatCatalog,
        currentThreat = room.CurrentThreat == null ? null : new
        {
            room.CurrentThreat.Id,
            room.CurrentThreat.Name,
            type = GetThreatControlType(room.CurrentThreat),
            status = room.ThreatState?.ThreatStatus ?? "none",
            effectsApplied = room.ThreatState?.Resolution.EffectsApplied ?? false,
            canRecoverAttempt = GMThreatStateMutator.CanReset(room),
            canForceOutcome = GMThreatStateMutator.CanForceOutcome(room)
        },
        auditLog = _threatAudit.GetRecent(room),
        threats = canBrowseFutureThreatCatalog ? _gameData.Threats.Where(item => !string.IsNullOrWhiteSpace(item.Id) && !string.IsNullOrWhiteSpace(item.Name))
            .Select(item => new { item.Id, item.Name, type = GetThreatControlType(item), available = !IsExplicitSpecialThreat(item) || IsAvailableSpecialThreat(item) })
            .OrderBy(item => item.Name).ToList() : []
        };
    }

    private bool IsAvailableSpecialThreat(ThreatData threat) =>
        string.Equals(threat.Id, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase)
            ? _threatMiniGames.TryGet(RadiationLeakThreatId, out _)
            : string.Equals(threat.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase) && IsPlanChoiceMechanics(threat.Mechanics);

    private static bool IsExplicitSpecialThreat(ThreatData threat) =>
        string.Equals(threat.Id, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(threat.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase);

    private string GetThreatControlType(ThreatData threat) =>
        string.Equals(threat.Id, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase) ? "team_operation" :
        string.Equals(threat.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase) && IsPlanChoiceMechanics(threat.Mechanics) ? "plan_choice" : "text";
}
