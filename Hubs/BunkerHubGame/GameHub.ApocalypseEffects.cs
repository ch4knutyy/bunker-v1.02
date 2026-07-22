using Bunker.Models;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    private async Task<ApocalypseActivationExecutionResult> ActivateApocalypseEffects(
        Room room,
        string trigger,
        int round,
        string discriminator)
    {
        var result = _apocalypseEffects.TryActivate(room, trigger, round, discriminator);
        if (!result.Due || result.Record == null || result.Execution == null) return result;

        var execution = result.Execution;
        var record = result.Record;
        try
        {
            await AppendGmAudit(
            room,
            GetGmActorId(room),
            execution.Success ? "apocalypse_effect_activation" : "apocalypse_effect_activation_failed",
            execution.Success ? GmAuditResult.Success : GmAuditResult.Failed,
            execution.Success
                ? $"Apocalypse effect activation {record.ActivationId} applied to {record.AffectedPlayerCount} players."
                : $"Apocalypse effect activation {record.ActivationId} failed atomically.",
            commandId: record.ActivationId,
            errorCode: execution.FailureCode,
            allowUndo: false);

            await Clients.Group(room.Id).SendAsync("ApocalypseEffectActivated", new
            {
            activationId = record.ActivationId,
            result = record.Result,
            trigger = record.Trigger,
            round = record.Round,
            affectedPlayerCount = record.AffectedPlayerCount,
            summaryCode = record.PublicSummaryCode,
            occurredAtUtc = record.OccurredAtUtc
            });

            if (!execution.Success) return result;

            foreach (var entry in execution.PersonalChanges)
            {
            var connectionId = _roomService.GetCurrentConnectionId(room, entry.Key);
            if (string.IsNullOrWhiteSpace(connectionId) ||
                !string.Equals(_roomService.GetPlayerRoomId(connectionId), room.Id, StringComparison.OrdinalIgnoreCase) ||
                !_roomService.TryResolvePlayer(room, entry.Key, out _, out var player))
                continue;

                await SendPersonalPlayerSnapshot(connectionId, player, "apocalypse_effect_applied");
                await Clients.Client(connectionId).SendAsync("ApocalypseEffectPersonalChanged", new
                {
                activationId = record.ActivationId,
                changes = entry.Value.Select(change => new
                {
                    field = change.Field,
                    before = change.Before,
                    after = change.After
                })
                });
            }

            await SendPublicPlayersUpdate(room);
        }
        catch (Exception exception)
        {
            // Transport/audit failures must not reinterpret an already-atomic
            // domain result or cancel an otherwise valid game start.
            _logger.LogError(exception,
                "Failed to publish apocalypse activation {ActivationId} for room {RoomId}",
                record.ActivationId, room.Id);
        }
        return result;
    }

    private async Task ActivateApocalypseEffectsWithoutBreakingFlow(
        Room room,
        string trigger,
        int round,
        string discriminator)
    {
        try
        {
            await ActivateApocalypseEffects(room, trigger, round, discriminator);
        }
        catch (Exception exception)
        {
            _logger.LogError(exception,
                "Apocalypse activation hook failed for room {RoomId}, trigger {Trigger}, round {Round}",
                room.Id, trigger, round);
        }
    }
}
