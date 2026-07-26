using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public Task<IReadOnlyList<CatalogPickerCategoryDto>> GetCatalogPickerCategories(
        string? language = null)
    {
        var (_, actor) = RequireCatalogActor();
        var categories = _catalogItems.GetCategories(language);
        if (!_developerAuthority.IsDeveloper(actor))
        {
            categories = categories
                .Where(category => category.Key is not ("specialCard" or "additionalPhysicalCondition"))
                .ToArray();
        }
        return Task.FromResult(categories);
    }

    public Task<CatalogPickerPageDto> GetCatalogPickerPage(
        string category,
        string targetPlayerId,
        string? language = null,
        int page = 1,
        int pageSize = 30,
        string? search = null)
    {
        var (room, actor) = RequireCatalogActor();
        if (!_roomService.TryResolvePlayer(room, targetPlayerId, out _, out var target))
            throw new HubException("player_not_found");
        if (IsDeveloperOnlyCatalog(category) && !_developerAuthority.IsDeveloper(actor))
            throw new HubException("developer_required");

        var canViewCurrent = CanViewCatalogValue(room, actor, target, category);
        try
        {
            return Task.FromResult(_catalogItems.GetPage(
                category,
                canViewCurrent ? target : null,
                language,
                page,
                pageSize,
                search,
                _developerAuthority.IsDeveloper(actor)));
        }
        catch (CatalogItemRequestException exception)
        {
            throw new HubException(exception.Code);
        }
    }

    public Task<CatalogMutationPreviewDto> PreviewCatalogReplacement(
        CatalogReplacementCommand command)
    {
        var (room, actor) = RequireCatalogActor();
        if (!_roomService.TryResolvePlayer(room, command.TargetPlayerId, out _, out var target))
            throw new HubException("player_not_found");
        if (IsDeveloperOnlyCatalog(command.Category) && !_developerAuthority.IsDeveloper(actor))
            throw new HubException("developer_required");
        if (!CanViewCatalogValue(room, actor, target, command.Category))
            throw new HubException("hidden_value_access_denied");
        return Task.FromResult(_catalogItems.PreviewReplacement(target, command, "uk"));
    }

    public async Task ApplyCatalogReplacement(CatalogReplacementCommand command)
    {
        var (room, actor) = RequireCatalogActor();
        if (!_roomService.TryResolvePlayer(
                room, command.TargetPlayerId, out var targetConnectionId, out var target))
            throw new HubException("player_not_found");
        if (IsDeveloperOnlyCatalog(command.Category) && !_developerAuthority.IsDeveloper(actor))
            throw new HubException("developer_required");
        if (!CanViewCatalogValue(room, actor, target, command.Category))
            throw new HubException("hidden_value_access_denied");
        if (string.IsNullOrWhiteSpace(command.CommandId))
            throw new HubException("command_id_required");

        var preview = _catalogItems.PreviewReplacement(target, command, "uk");
        if (!preview.Allowed)
            throw new HubException(preview.Code);
        if (!RememberPlayerCommand(room, command.CommandId))
        {
            await Clients.Caller.SendAsync("CatalogItemApplied", new
            {
                category = command.Category,
                playerId = RoomService.GetPlayerKey(target),
                idempotent = true
            });
            return;
        }

        var snapshot = CreateMutationSnapshot(
            room,
            RoomService.GetPlayerKey(actor),
            "catalog_runtime_replace",
            command.CommandId,
            $"Before {command.Category} {command.ActionType}");
        var result = _catalogItems.ApplyReplacement(target, command);
        if (!result.Success)
            throw new HubException(result.Code);

        _roomService.UpdatePlayer(targetConnectionId, target);
        await ProjectCatalogMutation(room, targetConnectionId, target, command.Category);
        await AppendGmAudit(
            room,
            RoomService.GetPlayerKey(actor),
            $"catalog_{command.ActionType}",
            GmAuditResult.Success,
            $"Runtime catalog mutation; category:{command.Category}; record:{command.RecordId}.",
            RoomService.GetPlayerKey(target),
            command.CommandId,
            snapshot: snapshot);
        QueueRoomRecovery(room, "catalog_runtime_mutation");
        await Clients.Caller.SendAsync("CatalogItemApplied", new
        {
            category = command.Category,
            action = command.ActionType,
            playerId = RoomService.GetPlayerKey(target),
            recordId = command.RecordId,
            idempotent = false
        });
    }

    public Task<CatalogMutationPreviewDto> PreviewCharacteristicOperation(
        CharacteristicOperationCommand command)
    {
        var (room, actor) = RequireCatalogActor();
        var (source, target) = ResolveOperationPlayers(room, command);
        EnsureAdvancedOperationPermission(room, actor, source, target, command);
        return Task.FromResult(_catalogItems.PreviewOperation(source, target, command));
    }

    public async Task ApplyCharacteristicOperation(
        CharacteristicOperationCommand command)
    {
        var (room, actor) = RequireCatalogActor();
        var (source, target) = ResolveOperationPlayers(room, command);
        EnsureAdvancedOperationPermission(room, actor, source, target, command);
        if (string.IsNullOrWhiteSpace(command.CommandId))
            throw new HubException("command_id_required");

        var preview = _catalogItems.PreviewOperation(source, target, command);
        if (!preview.Allowed)
            throw new HubException(preview.Code);
        if (!RememberPlayerCommand(room, command.CommandId))
        {
            await Clients.Caller.SendAsync("CatalogOperationApplied", new
            {
                operation = command.Operation,
                category = command.Category,
                idempotent = true
            });
            return;
        }

        var snapshot = CreateMutationSnapshot(
            room,
            RoomService.GetPlayerKey(actor),
            "catalog_characteristic_operation",
            command.CommandId,
            $"Before {command.Operation} {command.Category}");
        var result = _catalogItems.ApplyOperation(source, target, command);
        if (!result.Success)
            throw new HubException(result.Code);

        if (_roomService.TryResolvePlayer(
                room, RoomService.GetPlayerKey(source), out var sourceConnectionId, out _))
        {
            _roomService.UpdatePlayer(sourceConnectionId, source);
            await ProjectCatalogMutation(room, sourceConnectionId, source, command.Category);
        }
        if (target is not null &&
            _roomService.TryResolvePlayer(
                room, RoomService.GetPlayerKey(target), out var targetConnectionId, out _))
        {
            _roomService.UpdatePlayer(targetConnectionId, target);
            await ProjectCatalogMutation(room, targetConnectionId, target, command.Category);
        }
        await AppendGmAudit(
            room,
            RoomService.GetPlayerKey(actor),
            $"characteristic_{command.Operation.ToLowerInvariant()}",
            GmAuditResult.Success,
            $"Runtime characteristic operation; category:{command.Category}; source:{RoomService.GetPlayerKey(source)}; target:{(target is null ? "none" : RoomService.GetPlayerKey(target))}.",
            target is null ? RoomService.GetPlayerKey(source) : RoomService.GetPlayerKey(target),
            command.CommandId,
            snapshot: snapshot);
        QueueRoomRecovery(room, "catalog_characteristic_operation");
        await Clients.Caller.SendAsync("CatalogOperationApplied", new
        {
            operation = command.Operation,
            category = command.Category,
            sourcePlayerId = RoomService.GetPlayerKey(source),
            targetPlayerId = target is null ? null : RoomService.GetPlayerKey(target),
            idempotent = false
        });
    }

    private (Room Room, Player Actor) RequireCatalogActor()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room is null ||
            !_roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var actor) ||
            !HasActiveRoomCapability(room, actor, RoomActorCapability.ManagePlayers))
            throw new HubException("catalog_picker_access_denied");
        return (room, actor);
    }

    private (Player Source, Player? Target) ResolveOperationPlayers(
        Room room,
        CharacteristicOperationCommand command)
    {
        if (!_roomService.TryResolvePlayer(room, command.SourcePlayerId, out _, out var source))
            throw new HubException("player_not_found");
        Player? target = null;
        if (!string.IsNullOrWhiteSpace(command.TargetPlayerId) &&
            !_roomService.TryResolvePlayer(room, command.TargetPlayerId, out _, out target))
            throw new HubException("player_not_found");
        return (source, target);
    }

    private void EnsureAdvancedOperationPermission(
        Room room,
        Player actor,
        Player source,
        Player? target,
        CharacteristicOperationCommand command)
    {
        var operation = command.Operation.Trim().ToLowerInvariant();
        if (operation is "steal" or "transfer" or "annul" or "restore" ||
            command.Category.Equals("specialCard", StringComparison.OrdinalIgnoreCase))
        {
            if (!_developerAuthority.IsDeveloper(actor) ||
                !HasActiveRoomCapability(room, actor, RoomActorCapability.UseDeveloperTools))
                throw new HubException("developer_required");
            return;
        }

        if (!CanViewCatalogValue(room, actor, source, command.Category) ||
            target is not null && !CanViewCatalogValue(room, actor, target, command.Category))
            throw new HubException("hidden_value_access_denied");
    }

    private bool CanViewCatalogValue(Room room, Player actor, Player target, string category) =>
        _developerAuthority.IsDeveloper(actor) ||
        GmCapabilities.Allows(actor.GmRole, GmCapability.ViewHiddenPlayerState) ||
        IsCharacteristicRevealed(target, CatalogCharacteristicKey(category));

    private static bool IsDeveloperOnlyCatalog(string category) =>
        category.Trim() is "specialCard" or "SpecialCard" or
            "additionalPhysicalCondition" or "AdditionalPhysicalCondition";

    private async Task ProjectCatalogMutation(
        Room room,
        string connectionId,
        Player player,
        string category)
    {
        var characteristic = CatalogCharacteristicKey(category);

        await SendPersonalPlayerSnapshot(connectionId, player, "catalog_runtime_updated");
        if (IsCharacteristicRevealed(player, characteristic))
        {
            await Clients.Group(room.Id).SendAsync("CharacteristicUpdated", new
            {
                connectionId,
                playerName = player.Name,
                characteristicKey = characteristic,
                data = GetRevealedDataForCharacteristic(player, characteristic)
            });
        }
        await SendPlayerHostControlData(room);
        await BroadcastOmniscientStateToAuthorizedSpectators(room);
        await BroadcastRoundStateAfterSpecialCardChange(room, characteristic);
    }

    private static string CatalogCharacteristicKey(string category) =>
        category.Trim().ToLowerInvariant() switch
        {
            "profession" => "Profession",
            "physicalhealth" or "additionalphysicalcondition" => "PhysicalHealth",
            "mentalhealth" => "MentalHealth",
            "hobby" => "Hobby",
            "phobia" => "Phobia",
            "charactertrait" => "CharacterTrait",
            "fact" => "Fact",
            "inventory" => "Inventory",
            "property" => "Property",
            "specialcard" => "SpecialCard",
            "personalitysex" => "Personality",
            _ => category
        };
}
