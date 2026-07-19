using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services;

public sealed class RoomIntegrityService(RoomService roomService, GameDataService gameData, TimeProvider timeProvider)
{
    private static readonly HashSet<string> TerminalThreatStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "resolved", "resolved_safely", "resolved_with_casualty", "failed", "aborted", "cancelled", "completed"
    };

    public RoomIntegrityReportDto Check(Room room, string? language = null)
    {
        var now = timeProvider.GetUtcNow();
        var issues = FindIssues(room, NormalizeLanguage(language));
        return new(
            !issues.Any(issue => issue.Severity is "error" or "warning"),
            now,
            issues.Count(issue => issue.Severity == "error"),
            issues.Count(issue => issue.Severity == "warning"),
            issues.Count(issue => issue.Severity == "info"),
            issues,
            now);
    }

    public RoomAutoFixPreviewDto PreviewAutoFix(Room room, string? language = null)
    {
        var now = timeProvider.GetUtcNow();
        var lang = NormalizeLanguage(language);
        var changes = BuildFixCounts(room).Where(item => item.Value > 0)
            .Select(item => new RoomAutoFixChangeDto(item.Key, Message(item.Key, lang), item.Value)).ToList();
        return new(now, changes, changes.Sum(change => change.Count), changes.Count > 0, now);
    }

    public int ApplySafeFixes(Room room)
    {
        var fixedCount = 0;
        foreach (var connectionId in roomService.GetConnectionMappingsSnapshot(room.Id).Keys.ToList())
            if (roomService.RemoveStaleConnectionMapping(room, connectionId)) fixedCount++;

        var validIds = BuildValidPlayerIds(room);
        foreach (var key in room.VotingReadyResponses.Keys.Where(key => !validIds.Contains(key)).ToList())
            if (room.VotingReadyResponses.Remove(key)) fixedCount++;

        if (room.CurrentVoting is { } voting)
        {
            foreach (var voter in voting.Votes.Where(vote =>
                         (!VotingSession.IsExtraVoteId(vote.Key) && !validIds.Contains(vote.Key)) || !validIds.Contains(vote.Value))
                     .Select(vote => vote.Key).ToList())
                if (voting.Votes.Remove(voter)) fixedCount++;
        }

        if (room.ThreatState is { } threat)
        {
            fixedCount += threat.ParticipantPlayerIds.RemoveAll(id => !validIds.Contains(id));
            if (!string.IsNullOrWhiteSpace(threat.MiniGame.LeaderPlayerId) &&
                (!validIds.Contains(threat.MiniGame.LeaderPlayerId) ||
                 !threat.ParticipantPlayerIds.Contains(threat.MiniGame.LeaderPlayerId, StringComparer.OrdinalIgnoreCase)))
            {
                threat.MiniGame.LeaderPlayerId = "";
                fixedCount++;
            }
        }

        foreach (var player in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value))
            fixedCount += RemoveExactDuplicateConditions(player);

        return fixedCount;
    }

    private List<RoomIntegrityIssueDto> FindIssues(Room room, string language)
    {
        var issues = new List<RoomIntegrityIssueDto>();
        var players = RoomService.GetPlayersSnapshot(room);
        var validIds = BuildValidPlayerIds(room);
        void Add(string code, RoomIntegritySeverity severity, bool fix = false, Player? player = null) =>
            issues.Add(new(code, severity.ToString().ToLowerInvariant(), Message(code, language),
                player == null ? null : RoomService.GetPlayerKey(player), player?.Name, fix));

        if (string.IsNullOrWhiteSpace(room.HostPlayerId) && string.IsNullOrWhiteSpace(room.HostConnectionId)) Add("host_missing", RoomIntegritySeverity.Error);
        else if (!validIds.Contains(room.HostPlayerId) && !validIds.Contains(room.HostConnectionId)) Add("host_player_missing", RoomIntegritySeverity.Error);

        var duplicateIds = players.GroupBy(entry => RoomService.GetPlayerKey(entry.Value), StringComparer.OrdinalIgnoreCase)
            .Where(group => !string.IsNullOrWhiteSpace(group.Key) && group.Count() > 1);
        foreach (var _ in duplicateIds) Add("duplicate_player_id", RoomIntegritySeverity.Error);

        foreach (var mapping in roomService.GetConnectionMappingsSnapshot(room.Id))
            if (!room.Players.TryGetValue(mapping.Key, out var mappedPlayer) || mappedPlayer == null)
                Add("stale_connection_mapping", RoomIntegritySeverity.Warning, true);

        foreach (var entry in players)
        {
            var player = entry.Value;
            if (player.IsConnected && (string.IsNullOrWhiteSpace(player.ConnectionId) ||
                !string.Equals(entry.Key, player.ConnectionId, StringComparison.OrdinalIgnoreCase)))
                Add("active_player_stale_mapping", RoomIntegritySeverity.Warning, false, player);
            if (player.IsEliminated && (room.CurrentTurnPlayerId == entry.Key || room.CurrentTurnPlayerId == RoomService.GetPlayerKey(player)))
                Add("eliminated_player_is_current", RoomIntegritySeverity.Error, false, player);
            AddConditionIssues(player, issues, language);
        }

        if (!string.IsNullOrWhiteSpace(room.CurrentTurnPlayerId))
        {
            var current = roomService.GetPlayerByAnyId(room, room.CurrentTurnPlayerId);
            if (current == null) Add("current_turn_player_missing", RoomIntegritySeverity.Error);
            else if (!RoomService.IsGameplayParticipant(current) || !current.IsConnected) Add("current_turn_player_inactive", RoomIntegritySeverity.Error, false, current);
        }

        var minRound = room.State is RoomState.Lobby or RoomState.Waiting ? 0 : 1;
        if (room.CurrentRound < minRound || room.CurrentRound > 99) Add("round_out_of_range", RoomIntegritySeverity.Error);
        if (room.IsPaused && (room.PausedAtUtc == null || string.IsNullOrWhiteSpace(room.PausedByPlayerId))) Add("pause_metadata_incomplete", RoomIntegritySeverity.Warning);
        if (!room.IsPaused && (room.PausedAtUtc != null || !string.IsNullOrWhiteSpace(room.PauseReason) || !string.IsNullOrWhiteSpace(room.PausedByPlayerId))) Add("pause_metadata_stale", RoomIntegritySeverity.Warning);

        foreach (var key in room.VotingReadyResponses.Keys.Where(key => !validIds.Contains(key))) Add("ready_player_missing", RoomIntegritySeverity.Warning, true);
        foreach (var key in room.VotingReadyResponses.Keys.Where(key => validIds.Contains(key) && !RoomService.IsGameplayParticipant(roomService.GetPlayerByAnyId(room, key)))) Add("ready_player_inactive", RoomIntegritySeverity.Warning);
        AddVotingIssues(room, validIds, issues, language);
        AddThreatIssues(room, validIds, issues, language);

        if (room.Bunker is { Capacity: < 1 or > 99 }) Add("bunker_capacity_invalid", RoomIntegritySeverity.Error);
        if (room.Bunker is { SuppliesMonths: < 0 or > 120 }) Add("bunker_food_invalid", RoomIntegritySeverity.Error);
        if (room.Bunker is { WaterMonths: < 0 or > 120 }) Add("bunker_water_invalid", RoomIntegritySeverity.Error);
        if (!Enum.IsDefined(room.GmMode)) Add("gm_mode_invalid", RoomIntegritySeverity.Error);
        return issues;
    }

    private void AddVotingIssues(Room room, HashSet<string> validIds, List<RoomIntegrityIssueDto> issues, string language)
    {
        if (room.CurrentVoting is not { } voting) return;
        void Add(string code, RoomIntegritySeverity severity, bool fix = false) => issues.Add(new(code,
            severity.ToString().ToLowerInvariant(), Message(code, language), null, null, fix));
        foreach (var voter in voting.EligibleVoters.Where(id => !validIds.Contains(id))) Add("voting_player_missing", RoomIntegritySeverity.Warning);
        foreach (var vote in voting.Votes)
        {
            if (!VotingSession.IsExtraVoteId(vote.Key) && !validIds.Contains(vote.Key)) Add("vote_voter_missing", RoomIntegritySeverity.Warning, true);
            if (!validIds.Contains(vote.Value)) Add("vote_target_missing", RoomIntegritySeverity.Warning, true);
        }
        if (voting.State == VotingState.Active && voting.EndedAt != null) Add("voting_state_inconsistent", RoomIntegritySeverity.Warning);
        if (voting.State != VotingState.Active && voting.EndedAt == null) Add("voting_state_inconsistent", RoomIntegritySeverity.Warning);
        if (room.State == RoomState.Voting && voting.State == VotingState.Resolved) Add("voting_room_state_inconsistent", RoomIntegritySeverity.Warning);
    }

    private void AddThreatIssues(Room room, HashSet<string> validIds, List<RoomIntegrityIssueDto> issues, string language)
    {
        void Add(string code, RoomIntegritySeverity severity, bool fix = false) => issues.Add(new(code,
            severity.ToString().ToLowerInvariant(), Message(code, language), null, null, fix));
        if (room.CurrentThreat != null && !gameData.Threats.Any(item => string.Equals(item.Id, room.CurrentThreat.Id, StringComparison.OrdinalIgnoreCase)))
            Add("current_threat_not_loaded", RoomIntegritySeverity.Error);
        if (room.CurrentThreat == null && room.ThreatState != null) Add("threat_state_without_threat", RoomIntegritySeverity.Warning);
        if (room.CurrentThreat != null && room.ThreatState != null &&
            !string.Equals(room.CurrentThreat.Id, room.ThreatState.CurrentThreatId, StringComparison.OrdinalIgnoreCase)) Add("threat_state_mismatch", RoomIntegritySeverity.Error);
        if (room.ThreatState is not { } threat) return;
        var terminal = TerminalThreatStatuses.Contains(threat.ThreatStatus) || TerminalThreatStatuses.Contains(threat.MiniGame.Status);
        if (threat.Resolution.EffectsApplied && !terminal) Add("effects_applied_non_terminal", RoomIntegritySeverity.Error);
        if (terminal && !threat.Resolution.EffectsApplied && !string.Equals(threat.ThreatStatus, "aborted", StringComparison.OrdinalIgnoreCase))
            Add("terminal_effects_not_applied", RoomIntegritySeverity.Warning);
        foreach (var id in threat.ParticipantPlayerIds.Where(id => !validIds.Contains(id))) Add("threat_participant_missing", RoomIntegritySeverity.Warning, true);
        if (!string.IsNullOrWhiteSpace(threat.MiniGame.LeaderPlayerId) &&
            (!validIds.Contains(threat.MiniGame.LeaderPlayerId) || !threat.ParticipantPlayerIds.Contains(threat.MiniGame.LeaderPlayerId, StringComparer.OrdinalIgnoreCase)))
            Add("operation_leader_invalid", RoomIntegritySeverity.Warning, true);
        if (!string.IsNullOrWhiteSpace(threat.PlanChoice.SelectedPlanId) && room.CurrentThreat != null &&
            !HasPlan(room.CurrentThreat.Mechanics, threat.PlanChoice.SelectedPlanId)) Add("selected_plan_invalid", RoomIntegritySeverity.Error);
    }

    private static void AddConditionIssues(Player player, List<RoomIntegrityIssueDto> issues, string language)
    {
        foreach (var group in player.AdditionalConditionEffects.Where(effect => !string.IsNullOrWhiteSpace(ConditionKey(effect)))
                     .GroupBy(ConditionKey, StringComparer.OrdinalIgnoreCase).Where(group => group.Count() > 1))
        {
            var exact = group.GroupBy(ExactConditionKey, StringComparer.Ordinal).Any(duplicates => duplicates.Count() > 1);
            issues.Add(new("duplicate_additional_condition", "warning", Message("duplicate_additional_condition", language),
                RoomService.GetPlayerKey(player), player.Name, exact));
        }
    }

    private Dictionary<string, int> BuildFixCounts(Room room)
    {
        var validIds = BuildValidPlayerIds(room);
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["stale_connection_mapping"] = roomService.GetConnectionMappingsSnapshot(room.Id).Keys.Count(id => !room.Players.ContainsKey(id)),
            ["ready_player_missing"] = room.VotingReadyResponses.Keys.Count(id => !validIds.Contains(id)),
            ["vote_reference_missing"] = room.CurrentVoting?.Votes.Count(vote =>
                (!VotingSession.IsExtraVoteId(vote.Key) && !validIds.Contains(vote.Key)) || !validIds.Contains(vote.Value)) ?? 0,
            ["threat_participant_missing"] = room.ThreatState?.ParticipantPlayerIds.Count(id => !validIds.Contains(id)) ?? 0,
            ["operation_leader_invalid"] = room.ThreatState is { MiniGame.LeaderPlayerId.Length: > 0 } threat &&
                (!validIds.Contains(threat.MiniGame.LeaderPlayerId) || !threat.ParticipantPlayerIds.Contains(threat.MiniGame.LeaderPlayerId, StringComparer.OrdinalIgnoreCase)) ? 1 : 0,
            ["duplicate_additional_condition"] = RoomService.GetPlayersSnapshot(room).Sum(entry => CountExactDuplicateConditions(entry.Value))
        };
        return counts;
    }

    private static HashSet<string> BuildValidPlayerIds(Room room)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in RoomService.GetPlayersSnapshot(room))
        {
            result.Add(entry.Key);
            if (!string.IsNullOrWhiteSpace(entry.Value.ConnectionId)) result.Add(entry.Value.ConnectionId);
            var key = RoomService.GetPlayerKey(entry.Value);
            if (!string.IsNullOrWhiteSpace(key)) result.Add(key);
            result.Add(entry.Value.Id.ToString());
        }
        return result;
    }

    private static bool HasPlan(JsonElement? mechanics, string planId)
    {
        if (mechanics is not { ValueKind: JsonValueKind.Object } root) return false;
        JsonElement plans;
        if (root.TryGetProperty("planChoice", out var planChoice) && planChoice.ValueKind == JsonValueKind.Object && planChoice.TryGetProperty("plans", out plans) || root.TryGetProperty("plans", out plans))
            return plans.ValueKind == JsonValueKind.Array && plans.EnumerateArray().Any(plan =>
                plan.ValueKind == JsonValueKind.Object && plan.TryGetProperty("id", out var id) && string.Equals(id.GetString(), planId, StringComparison.OrdinalIgnoreCase));
        return false;
    }

    private static int CountExactDuplicateConditions(Player player) => player.AdditionalConditionEffects
        .Where(effect => !string.IsNullOrWhiteSpace(ConditionKey(effect)))
        .GroupBy(ExactConditionKey, StringComparer.Ordinal).Sum(group => Math.Max(0, group.Count() - 1));

    private static int RemoveExactDuplicateConditions(Player player)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        return player.AdditionalConditionEffects.RemoveAll(effect =>
            !string.IsNullOrWhiteSpace(ConditionKey(effect)) && !seen.Add(ExactConditionKey(effect)));
    }

    private static string ConditionKey(PlayerConditionEffect effect) => string.IsNullOrWhiteSpace(effect.ConditionId) ? effect.Id : effect.ConditionId;
    private static string ExactConditionKey(PlayerConditionEffect effect) => string.Join("|", ConditionKey(effect), effect.SeverityCode,
        effect.SourceThreatId, effect.AppliedAtRound, effect.Name, effect.Description);
    private static string NormalizeLanguage(string? language) => language?.Trim().ToLowerInvariant() is "ru" or "en" ? language.Trim().ToLowerInvariant() : "uk";

    private static string Message(string code, string language)
    {
        var en = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
            ["host_missing"]="Room has no host.", ["host_player_missing"]="Host is not present among room players.", ["duplicate_player_id"]="Duplicate player ID detected.",
            ["stale_connection_mapping"]="A connection mapping points to a missing player.", ["active_player_stale_mapping"]="An active player has a stale connection mapping.",
            ["eliminated_player_is_current"]="An eliminated player is marked as the current turn player.", ["current_turn_player_missing"]="Current turn player does not exist.",
            ["current_turn_player_inactive"]="Current turn player is not active.", ["round_out_of_range"]="Round is outside the valid range.", ["pause_metadata_incomplete"]="Pause metadata is incomplete.",
            ["pause_metadata_stale"]="Pause metadata remains while the room is not paused.", ["ready_player_missing"]="Readiness refers to a missing player.", ["ready_player_inactive"]="Readiness belongs to an inactive player.",
            ["voting_player_missing"]="Voting session refers to a missing player.", ["vote_voter_missing"]="A vote belongs to a missing voter.", ["vote_target_missing"]="A vote targets a missing player.",
            ["vote_reference_missing"]="Invalid votes will be removed.", ["voting_state_inconsistent"]="Voting status and completion time disagree.", ["voting_room_state_inconsistent"]="Room and voting states disagree.",
            ["current_threat_not_loaded"]="Current threat is absent from loaded data.", ["threat_state_without_threat"]="Threat interaction state exists without a current threat.", ["threat_state_mismatch"]="Threat interaction state does not match the current threat.",
            ["effects_applied_non_terminal"]="Effects are marked applied for a non-terminal threat.", ["threat_participant_missing"]="Threat participant is absent from the room.",
            ["terminal_effects_not_applied"]="Terminal threat is not marked as having applied its effects.",
            ["operation_leader_invalid"]="Operation leader is not a valid participant.", ["selected_plan_invalid"]="Selected plan does not exist in the active threat.",
            ["duplicate_additional_condition"]="Duplicate additional physical condition detected.", ["bunker_capacity_invalid"]="Bunker capacity must be between 1 and 99.",
            ["bunker_food_invalid"]="Bunker food must be between 0 and 120 months.", ["bunker_water_invalid"]="Bunker water must be between 0 and 120 months.", ["gm_mode_invalid"]="GM mode is invalid."
        };
        var uk = new Dictionary<string, string>(en, StringComparer.OrdinalIgnoreCase) {
            ["host_missing"]="Кімната не має хоста.", ["host_player_missing"]="Хост відсутній серед гравців кімнати.", ["duplicate_player_id"]="Виявлено дублікат ID гравця.",
            ["stale_connection_mapping"]="Connection mapping вказує на відсутнього гравця.", ["active_player_stale_mapping"]="Активний гравець має застарілий connection mapping.", ["ready_player_missing"]="Готовність належить відсутньому гравцю.",
            ["vote_voter_missing"]="Голос належить відсутньому voter.", ["vote_target_missing"]="Голос вказує на відсутнього гравця.", ["vote_reference_missing"]="Некоректні голоси буде видалено.",
            ["eliminated_player_is_current"]="Вибулий гравець позначений як поточний.", ["current_turn_player_missing"]="Поточний гравець не існує.", ["current_turn_player_inactive"]="Поточний гравець неактивний.",
            ["round_out_of_range"]="Номер раунду поза допустимим діапазоном.", ["pause_metadata_incomplete"]="Метадані паузи неповні.", ["pause_metadata_stale"]="Метадані паузи залишилися після продовження гри.",
            ["ready_player_inactive"]="Готовність належить неактивному гравцю.", ["voting_player_missing"]="Голосування посилається на відсутнього гравця.", ["voting_state_inconsistent"]="Статус голосування не узгоджений із часом завершення.",
            ["voting_room_state_inconsistent"]="Стан кімнати не узгоджений зі станом голосування.", ["current_threat_not_loaded"]="Поточна загроза відсутня в завантажених даних.", ["threat_state_without_threat"]="Interaction state існує без поточної загрози.",
            ["threat_state_mismatch"]="Interaction state не відповідає поточній загрозі.", ["effects_applied_non_terminal"]="EffectsApplied встановлено для незавершеної загрози.", ["terminal_effects_not_applied"]="Завершена загроза не позначена як така, де наслідки застосовано.",
            ["threat_participant_missing"]="Учасник загрози відсутній у кімнаті.", ["operation_leader_invalid"]="Керівник операції не є чинним учасником.", ["selected_plan_invalid"]="Обраного плану немає в активній загрозі.",
            ["duplicate_additional_condition"]="Виявлено дублікат додаткового фізичного стану.", ["bunker_capacity_invalid"]="Місткість бункера має бути від 1 до 99.", ["gm_mode_invalid"]="Режим GM має некоректне значення."
        };
        var ru = new Dictionary<string, string>(en, StringComparer.OrdinalIgnoreCase) {
            ["host_missing"]="У комнаты нет ведущего.", ["host_player_missing"]="Ведущий отсутствует среди игроков комнаты.", ["duplicate_player_id"]="Обнаружен дубликат ID игрока.",
            ["stale_connection_mapping"]="Connection mapping указывает на отсутствующего игрока.", ["active_player_stale_mapping"]="У активного игрока устаревший connection mapping.", ["eliminated_player_is_current"]="Выбывший игрок отмечен как текущий.",
            ["current_turn_player_missing"]="Текущий игрок не существует.", ["current_turn_player_inactive"]="Текущий игрок неактивен.", ["round_out_of_range"]="Номер раунда вне допустимого диапазона.",
            ["pause_metadata_incomplete"]="Метаданные паузы неполны.", ["pause_metadata_stale"]="Метаданные паузы остались после продолжения игры.", ["ready_player_missing"]="Готовность принадлежит отсутствующему игроку.",
            ["ready_player_inactive"]="Готовность принадлежит неактивному игроку.", ["voting_player_missing"]="Голосование ссылается на отсутствующего игрока.", ["vote_voter_missing"]="Голос принадлежит отсутствующему voter.",
            ["vote_target_missing"]="Голос указывает на отсутствующего игрока.", ["vote_reference_missing"]="Некорректные голоса будут удалены.", ["voting_state_inconsistent"]="Статус голосования не согласован со временем завершения.",
            ["voting_room_state_inconsistent"]="Состояние комнаты не согласовано с голосованием.", ["current_threat_not_loaded"]="Текущая угроза отсутствует в загруженных данных.", ["threat_state_without_threat"]="Interaction state существует без текущей угрозы.",
            ["threat_state_mismatch"]="Interaction state не соответствует текущей угрозе.", ["effects_applied_non_terminal"]="EffectsApplied установлен для незавершённой угрозы.", ["terminal_effects_not_applied"]="Завершённая угроза не отмечена как применившая последствия.",
            ["threat_participant_missing"]="Участник угрозы отсутствует в комнате.", ["operation_leader_invalid"]="Руководитель операции не является текущим участником.", ["selected_plan_invalid"]="Выбранного плана нет в активной угрозе.",
            ["duplicate_additional_condition"]="Обнаружен дубликат дополнительного физического состояния.", ["bunker_capacity_invalid"]="Вместимость бункера должна быть от 1 до 99.", ["gm_mode_invalid"]="Режим GM имеет некорректное значение."
        };
        var source = language == "en" ? en : language == "ru" ? ru : uk;
        return source.TryGetValue(code, out var message) ? message : code;
    }
}
