using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services;

public sealed class RoomSnapshotService
{
    public const int CurrentStateVersion = 1;
    public const int MaxSnapshotsPerRoom = 20;
    private readonly RoomIntegrityService _integrity;
    private readonly GmAuditService _audit;
    private readonly TimeProvider _timeProvider;
    private readonly Func<string> _idFactory;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public RoomSnapshotService(RoomIntegrityService integrity, GmAuditService audit, TimeProvider timeProvider, Func<string>? idFactory = null)
    {
        _integrity = integrity;
        _audit = audit;
        _timeProvider = timeProvider;
        _idFactory = idFactory ?? (() => Guid.NewGuid().ToString("N"));
    }

    public RoomSnapshot CreateSnapshot(Room room, string actorPlayerId, string reason, string? relatedActionType = null,
        string? relatedCommandId = null, string? protectedSnapshotId = null)
    {
        lock (room.SnapshotSyncRoot)
        {
            if (!string.IsNullOrWhiteSpace(relatedCommandId))
            {
                var existing = room.SnapshotHistory.LastOrDefault(snapshot =>
                    string.Equals(snapshot.RelatedCommandId, relatedCommandId, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(snapshot.RelatedActionType, relatedActionType, StringComparison.OrdinalIgnoreCase));
                if (existing != null) return existing;
            }

            var state = CaptureState(room);
            var snapshot = new RoomSnapshot
            {
                SnapshotId = _idFactory(),
                CreatedAtUtc = _timeProvider.GetUtcNow(),
                CreatedByPlayerId = SafeId(actorPlayerId),
                Reason = SanitizeReason(reason),
                RelatedActionType = SafeOptionalToken(relatedActionType),
                RelatedCommandId = SafeOptionalId(relatedCommandId),
                RoundNumber = room.CurrentRound,
                Phase = room.CurrentPhase.ToString(),
                StateVersion = CurrentStateVersion,
                State = state,
                Fingerprint = Fingerprint(state),
                HostTopologyPlayerId = GetCurrentHostPlayerId(room),
                PlayerTopologyIds = GetTopologyIds(room)
            };
            room.SnapshotHistory.Add(snapshot);
            TrimHistory(room, snapshot.SnapshotId, protectedSnapshotId);
            return snapshot;
        }
    }

    public IReadOnlyList<RoomSnapshotMetadataDto> GetSafeSnapshotList(Room room)
    {
        lock (room.SnapshotSyncRoot)
        {
            foreach (var snapshot in room.SnapshotHistory.Where(item => item.RestoreStatus != RoomSnapshotRestoreStatus.Restored))
            {
                var validation = Validate(room, snapshot);
                snapshot.RestoreStatus = validation.CanRestore ? RoomSnapshotRestoreStatus.Restorable : RoomSnapshotRestoreStatus.Blocked;
                snapshot.BlockedReason = validation.Reason;
            }
            return room.SnapshotHistory.OrderByDescending(snapshot => snapshot.CreatedAtUtc)
                .Take(MaxSnapshotsPerRoom).Select(ToDto).ToList();
        }
    }

    public RoomSnapshotRestorePreviewDto PreviewRestore(Room room, string snapshotId)
    {
        lock (room.SnapshotSyncRoot)
        {
            var snapshot = Find(room, snapshotId);
            if (snapshot == null)
                return new(null, false, "snapshot_not_found", [], _timeProvider.GetUtcNow());
            var validation = Validate(room, snapshot);
            return new(ToDto(snapshot), validation.CanRestore, validation.Reason,
                BuildDiff(room, snapshot.State), _timeProvider.GetUtcNow());
        }
    }

    public RoomSnapshotRestoreResult RestoreSnapshot(Room room, string snapshotId, string actorPlayerId, string commandId)
    {
        lock (room.SnapshotSyncRoot)
        {
            if (TryGetCommandResult(room, commandId, out var previous))
                return previous with { IsDuplicate = true };
            if (!RememberCommand(room, commandId))
                return new(false, true, "duplicate_command", "Duplicate snapshot command.", null, null);
            var snapshot = Find(room, snapshotId);
            if (snapshot == null) return CacheResult(room, commandId, Failure("snapshot_not_found"));
            var validation = Validate(room, snapshot);
            if (!validation.CanRestore)
            {
                snapshot.RestoreStatus = RoomSnapshotRestoreStatus.Blocked;
                snapshot.BlockedReason = validation.Reason;
                return CacheResult(room, commandId, Failure(validation.Reason ?? "restore_blocked"));
            }

            var safety = CreateSnapshot(room, actorPlayerId, "Safety snapshot before restore", "restore_safety", commandId + "-safety", snapshotId);
            ApplyState(room, snapshot.State);
            var report = _integrity.Check(room, "en");
            if (report.ErrorCount > 0)
            {
                ApplyState(room, safety.State);
                return CacheResult(room, commandId, new(false, false, "integrity_failed", "Restored state failed room integrity validation.", null, safety.SnapshotId));
            }

            snapshot.RestoreStatus = RoomSnapshotRestoreStatus.Restored;
            snapshot.BlockedReason = null;
            snapshot.RestoredAtUtc = _timeProvider.GetUtcNow();
            snapshot.RestoredByPlayerId = SafeId(actorPlayerId);
            _audit.DisableUndoForSnapshot(room, snapshot.SnapshotId);
            return CacheResult(room, commandId, new(true, false, null, null, snapshot.SnapshotId, safety.SnapshotId));
        }
    }

    public RoomSnapshotRestoreResult UndoLastGmAction(Room room, string actorPlayerId, string commandId, out GmAuditEntry? originalEntry)
    {
        if (TryGetCommandResult(room, commandId, out var previous))
        {
            originalEntry = null;
            return previous with { IsDuplicate = true };
        }
        originalEntry = _audit.GetLatestSuccessful(room);
        if (originalEntry == null) return Failure("no_successful_action");
        if (!originalEntry.CanUndo || originalEntry.WasUndone || string.IsNullOrWhiteSpace(originalEntry.RelatedSnapshotId))
            return Failure(originalEntry.WasUndone ? "already_undone" : "last_action_not_undoable");
        return RestoreSnapshot(room, originalEntry.RelatedSnapshotId, actorPlayerId, commandId);
    }

    public bool IsRestorable(Room room, string snapshotId)
    {
        lock (room.SnapshotSyncRoot)
            return Find(room, snapshotId) is { } snapshot && Validate(room, snapshot).CanRestore;
    }

    public void ReconcileAuditUndoAvailability(Room room)
    {
        lock (room.SnapshotSyncRoot)
        {
            foreach (var entry in room.GmAuditLog.Where(entry => entry.CanUndo && !entry.WasUndone && !string.IsNullOrWhiteSpace(entry.RelatedSnapshotId)).ToList())
            {
                var snapshot = Find(room, entry.RelatedSnapshotId!);
                if (snapshot == null || !Validate(room, snapshot).CanRestore)
                    _audit.DisableUndoForSnapshot(room, entry.RelatedSnapshotId!);
            }
        }
    }

    public bool TryRememberManualCommand(Room room, string commandId) => RememberCommand(room, commandId);

    private static bool TryGetCommandResult(Room room, string commandId, out RoomSnapshotRestoreResult result)
    {
        lock (room.ProcessedSnapshotCommandIds) return room.SnapshotCommandResults.TryGetValue(commandId, out result!);
    }

    private static RoomSnapshotRestoreResult CacheResult(Room room, string commandId, RoomSnapshotRestoreResult result)
    {
        lock (room.ProcessedSnapshotCommandIds) room.SnapshotCommandResults[commandId] = result;
        return result;
    }

    internal static RoomSnapshotState CaptureState(Room room)
    {
        var state = new RoomSnapshotState
        {
            State = room.State,
            GameSettings = RoomGameSettingsService.Clone(room.GameSettings),
            FrozenGameSettings = room.FrozenGameSettings == null ? null : RoomGameSettingsService.Clone(room.FrozenGameSettings),
            SettingsRevision = room.SettingsRevision,
            SettingsFrozen = room.SettingsFrozen,
            ResolvedBunkerCapacity = room.ResolvedBunkerCapacity,
            HostDisplayName = room.HostName,
            CurrentRound = room.CurrentRound,
            CurrentPhase = room.CurrentPhase,
            CurrentTurnPlayerId = NormalizePlayerReference(room, room.CurrentTurnPlayerId),
            IsPaused = room.IsPaused,
            PauseReason = room.PauseReason,
            PausedAtUtc = room.PausedAtUtc,
            PausedByPlayerId = NormalizePlayerReference(room, room.PausedByPlayerId),
            GameTimer = Clone(room.GameTimer) ?? new(),
            CurrentRoundReveals = Clone(room.CurrentRoundReveals) ?? new(StringComparer.OrdinalIgnoreCase),
            RoundDiceRolls = Clone(room.RoundDiceRolls) ?? new(),
            AdditionalInventoryGrantedAfterRound3 = room.AdditionalInventoryGrantedAfterRound3,
            ThreatsTriggeredCount = room.ThreatsTriggeredCount,
            TriggeredThreatIds = new(room.TriggeredThreatIds, StringComparer.OrdinalIgnoreCase),
            ThreatRoundsTriggered = new(room.ThreatRoundsTriggered),
            IsThreatRevealed = room.IsThreatRevealed,
            ThreatRevealedAtRound = room.ThreatRevealedAtRound,
            VotingReadyResponses = Clone(room.VotingReadyResponses) ?? new(StringComparer.OrdinalIgnoreCase),
            CurrentVoting = Clone(room.CurrentVoting),
            Apocalypse = Clone(room.Apocalypse),
            ApocalypseActivationPolicy = Clone(room.ApocalypseActivationPolicy),
            Bunker = Clone(room.Bunker),
            ScenarioSituations = Clone(room.ScenarioSituations),
            BunkerIntel = Clone(room.BunkerIntel),
            PendingElimination = Clone(room.PendingElimination)
        };
        lock (room.ThreatSyncRoot)
        {
            state.CurrentThreat = Clone(room.CurrentThreat);
            state.ThreatState = Clone(room.ThreatState);
        }
        if (state.CurrentThreat != null)
        {
            state.CurrentThreat.ImagePath = null;
            state.CurrentThreat.UploadedImagePath = null;
        }
        NormalizePlayerReferences(room, state);
        foreach (var entry in RoomService.GetPlayersSnapshot(room))
        {
            var id = GetStableTopologyId(entry.Value);
            var player = Clone(entry.Value)!;
            player.ConnectionId = "";
            player.IsConnected = false;
            player.DisconnectedAt = null;
            player.SpecialCard.TargetPlayerId = NormalizePlayerReference(room, player.SpecialCard.TargetPlayerId);
            foreach (var card in player.SpecialCards) card.TargetPlayerId = NormalizePlayerReference(room, card.TargetPlayerId);
            state.PlayersByStableId[id] = player;
        }
        return state;
    }

    internal static void ApplyState(Room room, RoomSnapshotState source)
    {
        var state = Clone(source)!;
        room.State = state.State;
        room.GameSettings = RoomGameSettingsService.Migrate(state.GameSettings);
        room.FrozenGameSettings = state.FrozenGameSettings == null ? null : RoomGameSettingsService.Migrate(state.FrozenGameSettings);
        room.SettingsRevision = Math.Max(1, state.SettingsRevision);
        room.SettingsFrozen = state.SettingsFrozen;
        room.ResolvedBunkerCapacity = state.ResolvedBunkerCapacity;
        room.MaxPlayers = room.GameSettings.MaxGameplayPlayers;
        room.MinPlayers = room.GameSettings.MinGameplayPlayers;
        room.HostName = state.HostDisplayName;
        room.CurrentRound = state.CurrentRound;
        room.CurrentPhase = state.CurrentPhase;
        room.CurrentTurnPlayerId = state.CurrentTurnPlayerId;
        room.IsPaused = state.IsPaused;
        room.PauseReason = state.PauseReason;
        room.PausedAtUtc = state.PausedAtUtc;
        room.PausedByPlayerId = state.PausedByPlayerId;
        room.GameTimer = state.GameTimer;
        room.CurrentRoundReveals = state.CurrentRoundReveals;
        room.RoundDiceRolls = state.RoundDiceRolls;
        room.AdditionalInventoryGrantedAfterRound3 = state.AdditionalInventoryGrantedAfterRound3;
        room.ThreatsTriggeredCount = state.ThreatsTriggeredCount;
        room.TriggeredThreatIds = new(state.TriggeredThreatIds ?? [], StringComparer.OrdinalIgnoreCase);
        room.ThreatRoundsTriggered = new(state.ThreatRoundsTriggered ?? []);
        room.IsThreatRevealed = state.IsThreatRevealed;
        room.ThreatRevealedAtRound = state.ThreatRevealedAtRound;
        lock (room.ThreatSyncRoot)
        {
            room.CurrentThreat = state.CurrentThreat;
            room.ThreatState = state.ThreatState;
        }
        room.VotingReadyResponses = state.VotingReadyResponses;
        room.CurrentVoting = state.CurrentVoting;
        room.Apocalypse = state.Apocalypse;
        room.ApocalypseActivationPolicy = state.ApocalypseActivationPolicy;
        room.Bunker = state.Bunker;
        room.ScenarioSituations = state.ScenarioSituations;
        room.BunkerIntel = state.BunkerIntel;
        room.PendingElimination = state.PendingElimination;

        lock (room.Players)
        {
            foreach (var connectionKey in room.Players.Keys.ToList())
            {
                var current = room.Players[connectionKey];
                var id = GetStableTopologyId(current);
                if (!state.PlayersByStableId.TryGetValue(id, out var saved)) continue;
                var restored = Clone(saved)!;
                restored.ConnectionId = current.ConnectionId;
                restored.IsConnected = current.IsConnected;
                restored.DisconnectedAt = current.DisconnectedAt;
                room.Players[connectionKey] = restored;
            }
            foreach (var player in room.Players.Values.Where(player => room.IrreversibleOmniscientPlayerIds.Contains(GetStableTopologyId(player))))
            {
                player.IsSpectatorGm = true;
                player.HasSeenOmniscientState = true;
                player.GmRole = GmMode.OmniscientGm;
                RoomService.RemoveGameplayParticipationReferences(room, player);
            }
        }
    }

    private static void NormalizePlayerReferences(Room room, RoomSnapshotState state)
    {
        state.CurrentRoundReveals = state.CurrentRoundReveals.ToDictionary(
            pair => NormalizePlayerReference(room, pair.Key) ?? pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);
        state.VotingReadyResponses = state.VotingReadyResponses.ToDictionary(
            pair => NormalizePlayerReference(room, pair.Key) ?? pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);
        foreach (var roll in state.RoundDiceRolls.Values)
            roll.RolledByPlayerId = NormalizePlayerReference(room, roll.RolledByPlayerId) ?? roll.RolledByPlayerId;

        if (state.CurrentVoting is { } voting)
        {
            voting.Votes = voting.Votes.ToDictionary(
                pair => NormalizeVoterReference(room, pair.Key),
                pair => NormalizePlayerReference(room, pair.Value) ?? pair.Value,
                StringComparer.OrdinalIgnoreCase);
            voting.EligibleVoters = voting.EligibleVoters.Select(id => NormalizePlayerReference(room, id) ?? id).ToHashSet(StringComparer.OrdinalIgnoreCase);
            voting.BlockedVoterIds = voting.BlockedVoterIds.Select(id => NormalizePlayerReference(room, id) ?? id).ToHashSet(StringComparer.OrdinalIgnoreCase);
            voting.VoteMultipliers = voting.VoteMultipliers.ToDictionary(pair => NormalizePlayerReference(room, pair.Key) ?? pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);
            foreach (var effect in voting.AppliedSpecialCardEffects)
            {
                effect.OwnerPlayerId = NormalizePlayerReference(room, effect.OwnerPlayerId) ?? effect.OwnerPlayerId;
                effect.TargetPlayerId = NormalizePlayerReference(room, effect.TargetPlayerId);
            }
        }

        if (state.ThreatState is not { } threat) return;
        threat.SecretSupportDrop.RecipientPlayerId = NormalizePlayerReference(room, threat.SecretSupportDrop.RecipientPlayerId) ?? threat.SecretSupportDrop.RecipientPlayerId;
        threat.VolunteerSelection.SelectedPlayerId = NormalizePlayerReference(room, threat.VolunteerSelection.SelectedPlayerId) ?? threat.VolunteerSelection.SelectedPlayerId;
        threat.ParticipantPlayerIds = threat.ParticipantPlayerIds.Select(id => NormalizePlayerReference(room, id) ?? id).ToList();
        threat.ForcedParticipantPlayerId = NormalizePlayerReference(room, threat.ForcedParticipantPlayerId) ?? threat.ForcedParticipantPlayerId;
        foreach (var contribution in threat.Contributions)
        {
            contribution.OwnerPlayerId = NormalizePlayerReference(room, contribution.OwnerPlayerId) ?? contribution.OwnerPlayerId;
            contribution.PlayerId = NormalizePlayerReference(room, contribution.PlayerId) ?? contribution.PlayerId;
        }
        threat.ThreatVolunteerVote.Votes = threat.ThreatVolunteerVote.Votes.ToDictionary(
            pair => NormalizePlayerReference(room, pair.Key) ?? pair.Key,
            pair => NormalizePlayerReference(room, pair.Value) ?? pair.Value,
            StringComparer.OrdinalIgnoreCase);
        threat.ThreatVolunteerVote.SelectedPlayerId = NormalizePlayerReference(room, threat.ThreatVolunteerVote.SelectedPlayerId) ?? threat.ThreatVolunteerVote.SelectedPlayerId;
        threat.OperationBonuses.ProtectedPlayerIds = threat.OperationBonuses.ProtectedPlayerIds.Select(id => NormalizePlayerReference(room, id) ?? id).ToList();
        threat.MiniGame.LeaderPlayerId = NormalizePlayerReference(room, threat.MiniGame.LeaderPlayerId) ?? threat.MiniGame.LeaderPlayerId;
    }

    private static string NormalizeVoterReference(Room room, string voterId)
    {
        if (!VotingSession.IsExtraVoteId(voterId)) return NormalizePlayerReference(room, voterId) ?? voterId;
        const string prefix = "_extra_";
        var value = voterId[prefix.Length..];
        var separator = value.LastIndexOf('_');
        if (separator <= 0) return voterId;
        var owner = value[..separator];
        var suffix = value[separator..];
        return prefix + (NormalizePlayerReference(room, owner) ?? owner) + suffix;
    }

    private (bool CanRestore, string? Reason) Validate(Room room, RoomSnapshot snapshot)
    {
        if (snapshot.StateVersion != CurrentStateVersion) return (false, "unsupported_snapshot_version");
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(snapshot.Fingerprint), Encoding.UTF8.GetBytes(Fingerprint(snapshot.State))))
            return (false, "snapshot_fingerprint_invalid");
        if (!snapshot.PlayerTopologyIds.SetEquals(GetTopologyIds(room))) return (false, "player_topology_changed");
        if (!string.Equals(snapshot.HostTopologyPlayerId, GetCurrentHostPlayerId(room), StringComparison.OrdinalIgnoreCase)) return (false, "host_topology_changed");
        if (room.State != RoomState.Lobby && snapshot.State.State == RoomState.Lobby) return (false, "running_to_lobby_forbidden");
        if (room.State != RoomState.Lobby && RoomService.GetPlayersSnapshot(room).Any(entry =>
            snapshot.State.PlayersByStableId.TryGetValue(RoomService.GetPlayerKey(entry.Value), out var saved) &&
            (saved.IsLobbySpectator != entry.Value.IsLobbySpectator || saved.GmRole != entry.Value.GmRole || saved.IsSpectatorGm != entry.Value.IsSpectatorGm)))
            return (false, "lobby_role_boundary_changed");
        if (room.IrreversibleOmniscientPlayerIds.Any(id => snapshot.State.PlayersByStableId.TryGetValue(id, out var player) && !player.IsSpectatorGm)) return (false, "omniscient_boundary_irreversible");
        if (snapshot.RestoreStatus == RoomSnapshotRestoreStatus.Restored) return (false, "snapshot_already_restored");
        return (true, null);
    }

    private static IReadOnlyList<RoomSnapshotDiffDto> BuildDiff(Room room, RoomSnapshotState state)
    {
        var current = CaptureState(room);
        var result = new List<RoomSnapshotDiffDto>();
        void Add(string category, int count) { if (count > 0) result.Add(new(category, count)); }
        Add("round_phase", current.CurrentRound != state.CurrentRound || current.CurrentPhase != state.CurrentPhase || current.State != state.State ? 1 : 0);
        Add("game_settings", Json(current.GameSettings) != Json(state.GameSettings) || Json(current.FrozenGameSettings) != Json(state.FrozenGameSettings) || current.SettingsFrozen != state.SettingsFrozen || current.ResolvedBunkerCapacity != state.ResolvedBunkerCapacity ? 1 : 0);
        Add("pause", current.IsPaused != state.IsPaused || current.PauseReason != state.PauseReason ? 1 : 0);
        Add("players_state", state.PlayersByStableId.Count(pair => current.PlayersByStableId.TryGetValue(pair.Key, out var player) && Json(player) != Json(pair.Value)));
        Add("revealed_state", state.PlayersByStableId.Count(pair => current.PlayersByStableId.TryGetValue(pair.Key, out var player) && Json(player.Revealed) != Json(pair.Value.Revealed)));
        Add("additional_conditions", state.PlayersByStableId.Count(pair => current.PlayersByStableId.TryGetValue(pair.Key, out var player) && Json(player.AdditionalConditionEffects) != Json(pair.Value.AdditionalConditionEffects)));
        Add("bunker", Json(current.Bunker) != Json(state.Bunker) || Json(current.Apocalypse) != Json(state.Apocalypse) ? 1 : 0);
        Add("voting", Json(current.CurrentVoting) != Json(state.CurrentVoting) || Json(current.VotingReadyResponses) != Json(state.VotingReadyResponses) ? 1 : 0);
        Add("threat_state", Json(current.CurrentThreat) != Json(state.CurrentThreat) || Json(current.ThreatState) != Json(state.ThreatState) ? 1 : 0);
        Add("scenario_state", Json(current.ScenarioSituations) != Json(state.ScenarioSituations) ||
            Json(current.BunkerIntel) != Json(state.BunkerIntel) ? 1 : 0);
        Add("pending_elimination", Json(current.PendingElimination) != Json(state.PendingElimination) ? 1 : 0);
        return result;
    }

    private void TrimHistory(Room room, string newSnapshotId, string? additionallyProtected)
    {
        while (room.SnapshotHistory.Count > MaxSnapshotsPerRoom)
        {
            var pendingUndoId = _audit.GetLatestSuccessful(room) is { CanUndo: true, WasUndone: false } entry ? entry.RelatedSnapshotId : null;
            var removable = room.SnapshotHistory.FirstOrDefault(snapshot =>
                !string.Equals(snapshot.SnapshotId, newSnapshotId, StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(snapshot.SnapshotId, additionallyProtected, StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(snapshot.SnapshotId, pendingUndoId, StringComparison.OrdinalIgnoreCase));
            removable ??= room.SnapshotHistory.First(snapshot => !string.Equals(snapshot.SnapshotId, newSnapshotId, StringComparison.OrdinalIgnoreCase));
            room.SnapshotHistory.Remove(removable);
            _audit.DisableUndoForSnapshot(room, removable.SnapshotId);
        }
    }

    private static bool RememberCommand(Room room, string commandId)
    {
        if (string.IsNullOrWhiteSpace(commandId)) return false;
        lock (room.ProcessedSnapshotCommandIds) return room.ProcessedSnapshotCommandIds.Add(commandId);
    }

    private static RoomSnapshot? Find(Room room, string snapshotId) => room.SnapshotHistory.FirstOrDefault(snapshot =>
        string.Equals(snapshot.SnapshotId, snapshotId, StringComparison.OrdinalIgnoreCase));
    private static RoomSnapshotRestoreResult Failure(string code) => new(false, false, code, code, null, null);
    private static T? Clone<T>(T? value) => value == null ? default : JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value, JsonOptions), JsonOptions);
    private static string Json<T>(T value) => JsonSerializer.Serialize(value, JsonOptions);
    private static string Fingerprint(RoomSnapshotState state) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Json(state))));
    private static string GetStableTopologyId(Player player) => !string.IsNullOrWhiteSpace(player.StablePlayerId) ? player.StablePlayerId : player.Id.ToString("N");
    private static HashSet<string> GetTopologyIds(Room room) => RoomService.GetPlayersSnapshot(room).Select(entry => GetStableTopologyId(entry.Value)).ToHashSet(StringComparer.OrdinalIgnoreCase);
    private static string GetCurrentHostPlayerId(Room room) => RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value).FirstOrDefault(room.IsHost) is { } host ? GetStableTopologyId(host) : "";
    private static string? NormalizePlayerReference(Room room, string? reference) => string.IsNullOrWhiteSpace(reference) ? null :
        RoomService.GetPlayersSnapshot(room).FirstOrDefault(entry => string.Equals(entry.Key, reference, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(entry.Value.ConnectionId, reference, StringComparison.OrdinalIgnoreCase) || string.Equals(GetStableTopologyId(entry.Value), reference, StringComparison.OrdinalIgnoreCase)).Value is { } player
            ? GetStableTopologyId(player) : reference;
    private static string SanitizeReason(string? value)
    {
        var clean = new string((value ?? "").Where(character => !char.IsControl(character)).ToArray()).Replace("<", "").Replace(">", "").Trim();
        if (string.IsNullOrWhiteSpace(clean)) clean = "Manual checkpoint";
        return clean[..Math.Min(clean.Length, 120)];
    }
    private static string SafeId(string value) => new string(value.Where(character => char.IsLetterOrDigit(character) || character is '_' or '-').Take(80).ToArray());
    private static string? SafeOptionalId(string? value) => string.IsNullOrWhiteSpace(value) ? null : SafeId(value);
    private static string? SafeOptionalToken(string? value) => string.IsNullOrWhiteSpace(value) ? null : SafeId(value).ToLowerInvariant();
    private static RoomSnapshotMetadataDto ToDto(RoomSnapshot snapshot) => new(snapshot.SnapshotId, snapshot.CreatedAtUtc,
        snapshot.CreatedByPlayerId, snapshot.Reason, snapshot.RelatedActionType, snapshot.RelatedCommandId, snapshot.RoundNumber,
        snapshot.Phase, snapshot.StateVersion, snapshot.Fingerprint, snapshot.RestoreStatus.ToString().ToLowerInvariant(),
        snapshot.BlockedReason, snapshot.RestoredAtUtc, snapshot.RestoredByPlayerId);
}
