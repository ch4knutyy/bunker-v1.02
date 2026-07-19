using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    private async Task<ScenarioRunResult?> TryRunScenarioAfterRound(
        Room room,
        int completedRound,
        bool configuredThreatAlreadyDue,
        string triggerPhase = "after_round_before_voting")
    {
        if (configuredThreatAlreadyDue)
        {
            if (_scenarioScheduler.IsDue(room, completedRound, triggerPhase))
            {
                _scenarioScheduler.MarkPostponed(room, completedRound, "configured_threat_collision");
                await AppendGmAudit(room, "system", "scenario_postponed", GmAuditResult.Success,
                    "Scenario postponed because the existing threat flow occupied the major situation slot.",
                    allowUndo: false);
            }
            return null;
        }
        var selection = _scenarioScheduler.SelectForCompletedRound(room, completedRound, triggerPhase);
        if (!selection.IsDue || selection.IsPostponed || selection.Scenario == null) return null;

        var scenarioCommandId = $"scenario-{room.Id}-{completedRound}-{Guid.NewGuid():N}";
        var snapshot = CreateMutationSnapshot(room, "system", "scenario_started",
            scenarioCommandId, "Before scheduled scenario");
        var result = _scenarioRunner.Run(room, selection.Scenario, completedRound);
        if (!result.Success)
        {
            _scenarioScheduler.MarkResolved(room, "failed");
            await Clients.Client(room.HostConnectionId).SendAsync("ReceiveError",
                result.ErrorCode ?? "scenario_resolution_failed");
            return result;
        }

        await Clients.Group(room.Id).SendAsync("ScenarioStarted", new
        {
            scenario = result.Public,
            resourceDelta = new
            {
                foodBefore = result.FoodBefore,
                foodAfter = result.FoodAfter,
                waterBefore = result.WaterBefore,
                waterAfter = result.WaterAfter
            },
            recipientCount = result.Private.Count,
            hasUnknownRecipients = result.Private.Count > 0
        });
        foreach (var message in result.Private)
        {
            var connectionId = _roomService.GetCurrentConnectionId(room, RoomService.GetPlayerKey(message.Player));
            if (!string.IsNullOrWhiteSpace(connectionId))
                await Clients.Client(connectionId).SendAsync("ScenarioPrivateOpened", message.Payload);
        }
        await BroadcastBunkerIntelProjection(room);
        await AppendGmAudit(room, "system", "scenario_started", GmAuditResult.Success,
            $"Scenario {selection.Scenario.Id} started.", commandId: scenarioCommandId, snapshot: snapshot);
        if (!result.BlocksVoting)
            await AppendGmAudit(room, "system", "scenario_resolved", GmAuditResult.Success,
                $"Scenario {selection.Scenario.Id} resolved.", allowUndo: false);
        QueueRoomRecovery(room, "scenario_started");
        return result;
    }

    private async Task BroadcastBunkerIntelProjection(Room room)
    {
        if (room.Bunker == null) return;
        foreach (var entry in RoomService.GetPlayersSnapshot(room))
        {
            var player = entry.Value;
            var connectionId = _roomService.GetCurrentConnectionId(room, RoomService.GetPlayerKey(player));
            if (string.IsNullOrWhiteSpace(connectionId)) continue;
            var elevated = player.GmRole is GmMode.TechnicalGm or GmMode.OmniscientGm ||
                           player.IsSpectatorGm && player.HasSeenOmniscientState;
            await Clients.Client(connectionId).SendAsync("BunkerChanged", new
            {
                bunker = _bunkerIntel.Project(room, player, elevated)
            });
        }
    }

    private async Task<bool> StartCanonicalScenarioThreat(Room room, int completedRound)
    {
        lock (room.ThreatSyncRoot)
        {
            room.CurrentThreat = DrawThreatForRound(room, completedRound);
            room.ThreatState = null;
            room.IsThreatRevealed = true;
            room.ThreatRevealedAtRound = completedRound;
            room.ThreatsTriggeredCount++;
            room.ThreatRoundsTriggered.Add(completedRound);
            if (!string.IsNullOrWhiteSpace(room.CurrentThreat?.Id))
                room.TriggeredThreatIds.Add(room.CurrentThreat.Id);
            EnsureRadiationThreatState(room);
            room.CurrentPhase = GamePhase.Threat;
            _threatAudit.Append(room, ThreatAuditEventType.Revealed, deduplicateTransition: true);
        }
        var threatState = BuildRoundState(room);
        await Clients.Group(room.Id).SendAsync("ThreatRevealed", new
        {
            completedRound,
            threat = room.CurrentThreat,
            roundState = threatState
        });
        await Clients.Group(room.Id).SendAsync("RoundStateUpdated", threatState);
        if (!string.IsNullOrWhiteSpace(room.HostConnectionId))
            await Clients.Client(room.HostConnectionId).SendAsync("GMThreatControlData", BuildGMThreatControlData(room));
        return true;
    }

    private async Task AdvanceRoundAfterVotingScenario(Room room, int completedRound)
    {
        RestoreExpiredTemporarySpecialCardEffects(room, completedRound);
        room.CurrentRound = completedRound + 1;
        room.CurrentRoundReveals.Clear();
        room.VotingReadyResponses.Clear();
        room.CurrentPhase = GamePhase.RoundReveal;
        StartConfiguredRoundTimer(room);
        var bunkerReveal = _bunkerIntel.RevealNextPublic(room, completedRound);
        if (bunkerReveal.Success)
        {
            await Clients.Group(room.Id).SendAsync("BunkerIntelRevealed", bunkerReveal);
            await BroadcastBunkerIntelProjection(room);
        }
        var nextRoundState = BuildRoundState(room);
        await Clients.Group(room.Id).SendAsync("RoundAdvanced", new
        {
            completedRound,
            currentRound = room.CurrentRound,
            roundState = nextRoundState
        });
        await Clients.Group(room.Id).SendAsync("RoundStateUpdated", nextRoundState);
    }

    private async Task SendPendingScenarioState(Room room, Player player, string connectionId)
    {
        var pending = room.ScenarioSituations?.PendingPrivateChoices.Values.FirstOrDefault(choice =>
            string.Equals(choice.PlayerId, player.Id.ToString("N"), StringComparison.OrdinalIgnoreCase));
        if (pending == null) return;
        await Clients.Client(connectionId).SendAsync("ScenarioPrivateOpened", new
        {
            instanceId = room.ScenarioSituations?.ActiveScenario?.Id,
            scenarioId = pending.ScenarioId,
            choice = new
            {
                choiceId = pending.ChoiceId,
                choices = pending.Payload.GetProperty("choices").Clone()
            },
            expiresAtUtc = pending.ExpiresAtUtc,
            restoredAfterReconnect = true
        });
    }

    private async Task ContinueAfterBlockingScenario(Room room, int completedRound)
    {
        var additionalInventory = GrantConfiguredBonusInventory(room, completedRound);
        if (additionalInventory.Count > 0)
        {
            room.CurrentPhase = GamePhase.ExtraInventory;
            var inventoryState = BuildRoundState(room);
            await Clients.Group(room.Id).SendAsync("AdditionalInventoryGranted", new
            {
                completedRound,
                grants = additionalInventory,
                roundState = inventoryState
            });
            await Clients.Group(room.Id).SendAsync("RoundStateUpdated", inventoryState);
        }

        if (IsVotingRound(room, completedRound))
        {
            room.CurrentPhase = GamePhase.PreVotingReadyCheck;
            var votingState = BuildRoundState(room);
            await Clients.Group(room.Id).SendAsync("VotingReadyCheckStarted", new
            {
                round = room.CurrentRound,
                message = "Всі готові до голосування?",
                roundState = votingState
            });
            await Clients.Group(room.Id).SendAsync("RoundStateUpdated", votingState);
            return;
        }

        RestoreExpiredTemporarySpecialCardEffects(room, completedRound);
        room.CurrentRound = completedRound + 1;
        room.CurrentRoundReveals.Clear();
        room.VotingReadyResponses.Clear();
        room.CurrentPhase = GamePhase.RoundReveal;
        StartConfiguredRoundTimer(room);
        var reveal = _bunkerIntel.RevealNextPublic(room, completedRound);
        if (reveal.Success)
        {
            await Clients.Group(room.Id).SendAsync("BunkerIntelRevealed", reveal);
            await BroadcastBunkerIntelProjection(room);
        }
        var nextRoundState = BuildRoundState(room);
        await Clients.Group(room.Id).SendAsync("RoundAdvanced", new
        {
            completedRound,
            currentRound = room.CurrentRound,
            roundState = nextRoundState
        });
        await Clients.Group(room.Id).SendAsync("RoundStateUpdated", nextRoundState);
    }

    public async Task ResolveScenarioChoice(
        string choiceId,
        string optionId,
        string? targetPlayerId,
        string commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null ||
            !_roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var actor))
        {
            await Clients.Caller.SendAsync("ReceiveError", "scenario_room_not_found");
            return;
        }
        Player? target = null;
        if (!string.IsNullOrWhiteSpace(targetPlayerId))
            target = RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value).FirstOrDefault(player =>
                string.Equals(player.Id.ToString("N"), targetPlayerId, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(RoomService.GetPlayerKey(player), targetPlayerId, StringComparison.OrdinalIgnoreCase));
        var result = _scenarioRunner.ResolvePrivateChoice(room, actor, commandId, choiceId, optionId, target);
        if (!result.Success)
        {
            await Clients.Caller.SendAsync("ReceiveError", result.ErrorCode ?? "scenario_choice_failed");
            return;
        }
        await Clients.Group(room.Id).SendAsync("ScenarioResolved", new
        {
            scenarioId = room.ScenarioSituations?.ActiveScenario?.ScenarioId,
            result = "private_choice_resolved"
        });
        QueueRoomRecovery(room, "scenario_choice_resolved");
        var completedRound = room.ScenarioSituations?.ActiveScenario?.TriggeredAfterRound ?? room.CurrentRound;
        if (room.ScenarioSituations?.TriggerPhase == "after_voting")
            await AdvanceRoundAfterVotingScenario(room, completedRound);
        else
            await ContinueAfterBlockingScenario(room, completedRound);
    }

    public async Task SkipPendingScenarioChoice(string choiceId, string commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !IsCallerHost())
        {
            await Clients.Caller.SendAsync("ReceiveError", "scenario_host_required");
            return;
        }
        if (!_scenarioRunner.SkipPendingChoice(room, choiceId, commandId))
        {
            await Clients.Caller.SendAsync("ReceiveError", "pending_choice_not_found");
            return;
        }
        await Clients.Group(room.Id).SendAsync("ScenarioResolved", new
        {
            scenarioId = room.ScenarioSituations?.ActiveScenario?.ScenarioId,
            result = "host_skipped"
        });
        QueueRoomRecovery(room, "scenario_choice_skipped");
        var completedRound = room.ScenarioSituations?.ActiveScenario?.TriggeredAfterRound ?? room.CurrentRound;
        if (room.ScenarioSituations?.TriggerPhase == "after_voting")
            await AdvanceRoundAfterVotingScenario(room, completedRound);
        else
            await ContinueAfterBlockingScenario(room, completedRound);
    }

    public async Task UseEventSpecialCard(
        string runtimeCardId,
        string actionId,
        string? targetPlayerId,
        string? choiceId,
        string? selectedOptionId,
        string commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null ||
            !_roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var owner))
        {
            await Clients.Caller.SendAsync("ReceiveError", "event_card_room_not_found");
            return;
        }
        var target = ResolveScenarioPlayer(room, targetPlayerId);
        var pendingEliminationPlayerId = room.PendingElimination?.PlayerId;
        var snapshot = CreateMutationSnapshot(room, "system", "event_card_used",
            commandId, "Before event card use");
        var result = _eventSpecialCards.Use(room, owner, runtimeCardId, actionId, target,
            choiceId, selectedOptionId, commandId);
        if (!result.Success)
        {
            await Clients.Caller.SendAsync("ReceiveError", result.ErrorCode ?? "event_card_use_failed");
            return;
        }
        await SendPersonalPlayerSnapshot(Context.ConnectionId, owner, "event_card_used");
        if (target != null && target.Id != owner.Id)
        {
            var targetConnection = _roomService.GetCurrentConnectionId(room, RoomService.GetPlayerKey(target));
            if (!string.IsNullOrWhiteSpace(targetConnection))
                await SendPersonalPlayerSnapshot(targetConnection, target, "event_card_effect");
        }
        if (result.Card is { } && owner.EventSpecialCards.Any(card =>
                card.RuntimeCardId == runtimeCardId && card.IsRevealedPublicly))
            await Clients.Group(room.Id).SendAsync("EventCardPubliclyUsed", new
            {
                ownerPlayerId = owner.Id,
                ownerName = owner.Name,
                definitionId = owner.EventSpecialCards.First(card => card.RuntimeCardId == runtimeCardId).DefinitionId
            });
        if (pendingEliminationPlayerId != null && room.PendingElimination == null && target != null)
            await Clients.Group(room.Id).SendAsync("PlayerEliminationCancelled", new
            {
                playerId = target.Id,
                playerName = target.Name,
                source = "anonymous_guarantee"
            });
        await BroadcastBunkerIntelProjection(room);
        await AppendGmAudit(room, "system", "event_card_used", GmAuditResult.Success,
            "A private event card was used.", commandId: commandId, snapshot: snapshot);
        QueueRoomRecovery(room, "event_card_used");
    }

    public async Task TransferEventSpecialCard(string runtimeCardId, string targetPlayerId, string commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null ||
            !_roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var owner) ||
            ResolveScenarioPlayer(room, targetPlayerId) is not { } target)
        {
            await Clients.Caller.SendAsync("ReceiveError", "invalid_event_card_target");
            return;
        }
        var snapshot = CreateMutationSnapshot(room, "system", "event_card_transferred",
            commandId, "Before event card transfer");
        var result = _eventSpecialCards.Transfer(room, owner, runtimeCardId, target, commandId);
        if (!result.Success)
        {
            await Clients.Caller.SendAsync("ReceiveError", result.ErrorCode ?? "event_card_transfer_failed");
            return;
        }
        await SendPersonalPlayerSnapshot(Context.ConnectionId, owner, "event_card_transferred");
        var targetConnection = _roomService.GetCurrentConnectionId(room, RoomService.GetPlayerKey(target));
        if (!string.IsNullOrWhiteSpace(targetConnection))
            await SendPersonalPlayerSnapshot(targetConnection, target, "event_card_received");
        await AppendGmAudit(room, "system", "event_card_transferred", GmAuditResult.Success,
            "A private event card changed owner.", commandId: commandId, snapshot: snapshot);
        QueueRoomRecovery(room, "event_card_transferred");
    }

    public async Task FinalizePendingElimination(string commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !IsCallerHost() || !RememberPlayerCommand(room, commandId))
        {
            await Clients.Caller.SendAsync("ReceiveError", "scenario_host_required");
            return;
        }
        if (!await FinalizePendingEliminationInternal(room, force: true))
            await Clients.Caller.SendAsync("ReceiveError", "pending_elimination_not_found");
    }

    private async Task<bool> FinalizePendingEliminationInternal(Room room, bool force)
    {
        var pending = room.PendingElimination;
        if (pending == null || !force && DateTimeOffset.UtcNow < pending.ExpiresAtUtc) return false;
        var player = ResolveScenarioPlayer(room, pending.PlayerId);
        room.PendingElimination = null;
        if (player == null || !player.IsEliminated) return false;
        TryMarkGameFinishedAfterElimination(room, pending.Source, out var completion);
        await Clients.Group(room.Id).SendAsync("PendingEliminationFinalized", new
        {
            playerId = player.Id,
            playerName = player.Name,
            pending.Round
        });
        if (completion != null)
            await PublishGameCompletionAsync(room, completion, GetGmActorId(room));
        QueueRoomRecovery(room, "pending_elimination_finalized");
        return true;
    }

    public async Task RevealNextBunkerIntel(string commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !HasGmCapability(room, GmCapability.ManagePublicGameState))
        {
            await Clients.Caller.SendAsync("ReceiveError", "gm_capability_required");
            return;
        }
        room.BunkerIntel ??= _bunkerIntel.InitializeForNewGame(_roomGameSettings.GetEffective(room));
        lock (room.BunkerIntel.ProcessedCommandIds)
        {
            if (!room.BunkerIntel.ProcessedCommandIds.Add(commandId)) return;
        }
        var snapshot = CreateMutationSnapshot(room, GetGmActorId(room), "bunker_intel_public_revealed",
            commandId, "Before public bunker intel reveal");
        var result = _bunkerIntel.RevealNextPublic(room, Math.Max(1, room.CurrentRound - 1), force: true);
        if (!result.Success)
        {
            await Clients.Caller.SendAsync("ReceiveError", "no_hidden_bunker_intel");
            return;
        }
        await Clients.Group(room.Id).SendAsync("BunkerIntelRevealed", result);
        await BroadcastBunkerIntelProjection(room);
        await AppendGmAudit(room, GetGmActorId(room), "bunker_intel_public_revealed",
            GmAuditResult.Success, $"Public bunker intel category {result.Category} revealed.",
            commandId: commandId, snapshot: snapshot);
        QueueRoomRecovery(room, "bunker_intel_public_revealed");
    }

    public Task<object> GetScenarioAdminState()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !HasGmCapability(room, GmCapability.ManagePublicGameState))
            return Task.FromResult<object>(new { available = false });
        var state = room.ScenarioSituations;
        return Task.FromResult<object>(new
        {
            available = true,
            enabled = state?.Enabled == true,
            nextDue = state?.NextDueAfterRound,
            currentPhase = room.CurrentPhase.ToString(),
            active = state?.ActiveScenario == null ? null : new
            {
                state.ActiveScenario.ScenarioId,
                state.ActiveScenario.Type,
                state.ActiveScenario.IsBlocking,
                state.ActiveScenario.IsResolved
            },
            pendingChoices = state?.PendingPrivateChoices.Count ?? 0,
            lastScenario = state?.LastScenarioId
        });
    }

    public async Task GrantNextPrivateBunkerIntel(string targetPlayerId, string commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        var target = room == null ? null : ResolveScenarioPlayer(room, targetPlayerId);
        if (room == null || target == null || !HasGmCapability(room, GmCapability.ManagePublicGameState))
        {
            await Clients.Caller.SendAsync("ReceiveError", "gm_capability_required");
            return;
        }
        room.BunkerIntel ??= _bunkerIntel.InitializeForNewGame(_roomGameSettings.GetEffective(room));
        lock (room.BunkerIntel.ProcessedCommandIds)
        {
            if (!room.BunkerIntel.ProcessedCommandIds.Add(commandId)) return;
        }
        var snapshot = CreateMutationSnapshot(room, GetGmActorId(room), "bunker_intel_private_granted",
            commandId, "Before private bunker intel grant");
        var result = _bunkerIntel.RevealRandomPrivate(room, target);
        if (!result.Success)
        {
            await Clients.Caller.SendAsync("ReceiveError", "no_hidden_bunker_intel");
            return;
        }
        var connectionId = _roomService.GetCurrentConnectionId(room, RoomService.GetPlayerKey(target));
        if (!string.IsNullOrWhiteSpace(connectionId))
        {
            await Clients.Client(connectionId).SendAsync("BunkerChanged", new
            {
                bunker = _bunkerIntel.Project(room, target),
                privateIntelGranted = true
            });
            await Clients.Client(connectionId).SendAsync("ScenarioPrivateOpened", new
            {
                title = "Архів бункера",
                message = "Вам відкрито приватний факт про бункер.",
                intel = result
            });
        }
        await AppendGmAudit(room, "system", "bunker_intel_private_granted", GmAuditResult.Success,
            "Private bunker intel was granted to one player.", commandId: commandId, snapshot: snapshot);
        QueueRoomRecovery(room, "bunker_intel_private_granted");
    }

    public async Task PostponeScenario(string commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room?.ScenarioSituations == null || !HasGmCapability(room, GmCapability.ManagePublicGameState) ||
            !RememberPlayerCommand(room, commandId)) return;
        room.ScenarioSituations.NextDueAfterRound = Math.Max(room.CurrentRound + 1,
            room.ScenarioSituations.NextDueAfterRound + 1);
        await AppendGmAudit(room, GetGmActorId(room), "scenario_postponed", GmAuditResult.Success,
            "Scenario was postponed to the next free round.", commandId: commandId, allowUndo: false);
        QueueRoomRecovery(room, "scenario_postponed");
    }

    public async Task CancelActiveScenario(string commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        var active = room?.ScenarioSituations?.ActiveScenario;
        if (room == null || active == null || active.IsResolved ||
            !HasGmCapability(room, GmCapability.ManagePublicGameState) ||
            !RememberPlayerCommand(room, commandId)) return;
        if (room.ScenarioSituations!.PendingPrivateChoices.Count == 0)
        {
            await Clients.Caller.SendAsync("ReceiveError", "scenario_effects_already_applied");
            return;
        }
        _scenarioScheduler.MarkResolved(room, "cancelled");
        await Clients.Group(room.Id).SendAsync("ScenarioResolved", new
        {
            scenarioId = active.ScenarioId,
            result = "cancelled"
        });
        await AppendGmAudit(room, GetGmActorId(room), "scenario_cancelled", GmAuditResult.Success,
            "Pending scenario was cancelled before private effects.", commandId: commandId, allowUndo: false);
        QueueRoomRecovery(room, "scenario_cancelled");
    }

    public Task<object> PreviewScenarioById(string scenarioId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !HasGmCapability(room, GmCapability.ManagePublicGameState))
            return Task.FromResult<object>(new { canApply = false, errorCode = "gm_capability_required" });
        var definition = _scenarioContent.FindEvent(scenarioId);
        if (definition == null)
            return Task.FromResult<object>(new { canApply = false, errorCode = "scenario_not_found" });
        return Task.FromResult<object>(new
        {
            canApply = room.ScenarioSituations?.ActiveScenario is not { IsResolved: false },
            scenarioId = definition.Id,
            definition.Type,
            title = definition.Title,
            currentRound = room.CurrentRound
        });
    }

    public async Task ForceScenarioById(string scenarioId, string commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        var definition = _scenarioContent.FindEvent(scenarioId);
        if (room == null || definition == null ||
            !HasGmCapability(room, GmCapability.ManagePublicGameState) ||
            room.ScenarioSituations?.ActiveScenario is { IsResolved: false } ||
            !RememberPlayerCommand(room, commandId))
        {
            await Clients.Caller.SendAsync("ReceiveError", "scenario_force_rejected");
            return;
        }
        room.ScenarioSituations ??= _scenarioScheduler.InitializeForNewGame(_roomGameSettings.GetEffective(room));
        var snapshot = CreateMutationSnapshot(room, GetGmActorId(room), "scenario_started",
            commandId, "Before forced scenario");
        var result = _scenarioRunner.Run(room, definition, room.CurrentRound);
        if (!result.Success)
        {
            await Clients.Caller.SendAsync("ReceiveError", result.ErrorCode ?? "scenario_force_failed");
            return;
        }
        await Clients.Group(room.Id).SendAsync("ScenarioStarted", new
        {
            scenario = result.Public,
            resourceDelta = new
            {
                foodBefore = result.FoodBefore,
                foodAfter = result.FoodAfter,
                waterBefore = result.WaterBefore,
                waterAfter = result.WaterAfter
            },
            recipientCount = result.Private.Count,
            hasUnknownRecipients = result.Private.Count > 0
        });
        foreach (var message in result.Private)
        {
            var connection = _roomService.GetCurrentConnectionId(room, RoomService.GetPlayerKey(message.Player));
            if (!string.IsNullOrWhiteSpace(connection))
                await Clients.Client(connection).SendAsync("ScenarioPrivateOpened", message.Payload);
        }
        await AppendGmAudit(room, GetGmActorId(room), "scenario_started", GmAuditResult.Success,
            $"Scenario {definition.Id} was forced.", commandId: commandId, snapshot: snapshot);
        await BroadcastBunkerIntelProjection(room);
        QueueRoomRecovery(room, "scenario_forced");
    }

    private static Player? ResolveScenarioPlayer(Room room, string? playerId) =>
        string.IsNullOrWhiteSpace(playerId) ? null :
        RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value).FirstOrDefault(player =>
            string.Equals(player.Id.ToString("N"), playerId, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(RoomService.GetPlayerKey(player), playerId, StringComparison.OrdinalIgnoreCase));
}
