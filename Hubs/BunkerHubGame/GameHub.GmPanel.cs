using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
	public async Task<GmPanelStateDto> GetGmPanelState()
	{
		var connectionId = Context.ConnectionId;
		Room? room = null;
		Player? caller = null;
		try
		{
			room = _roomService.GetPlayerRoom(connectionId);
			if (room is null)
			{
				_logger.LogWarning(
					"GM panel state rejected. Connection {ConnectionId}, ErrorCode {ErrorCode}",
					ShortGmPanelIdentifier(connectionId),
					"room_not_found");
				throw new HubException("room_not_found");
			}
			if (!_roomService.TryResolvePlayer(
					room,
					connectionId,
					out _,
					out caller))
			{
				_logger.LogWarning(
					"GM panel state rejected. Connection {ConnectionId}, Room {RoomCode}, ErrorCode {ErrorCode}",
					ShortGmPanelIdentifier(connectionId),
					room.Id,
					"gm_panel_access_denied");
				throw new HubException("gm_panel_access_denied");
			}

			var canOpenContentEditor =
				_authorizationService is not null &&
				Context.User?.Identity?.IsAuthenticated == true &&
				(await _authorizationService.AuthorizeAsync(
					Context.User,
					resource: null,
					policyName: "OwnerOnly")).Succeeded;
			var state = _gmPanelStateBuilder.TryBuild(
				room,
				caller,
				canOpenContentEditor);
			if (state is null)
			{
				_logger.LogWarning(
					"GM panel state rejected. Connection {ConnectionId}, Room {RoomCode}, Player {PlayerId}, Role {Role}, State {RoomState}, ErrorCode {ErrorCode}",
					ShortGmPanelIdentifier(connectionId),
					room.Id,
					RoomService.GetPlayerKey(caller),
					caller.GmRole,
					room.State,
					"gm_panel_access_denied");
				throw new HubException("gm_panel_access_denied");
			}

			_logger.LogInformation(
				"GM panel state built. Connection {ConnectionId}, Room {RoomCode}, Player {PlayerId}, Role {Role}, State {RoomState}",
				ShortGmPanelIdentifier(connectionId),
				room.Id,
				RoomService.GetPlayerKey(caller),
				state.Role,
				room.State);
			return state;
		}
		catch (HubException)
		{
			throw;
		}
		catch (Exception exception)
		{
			_logger.LogError(
				exception,
				"GM panel state failed. Connection {ConnectionId}, Room {RoomCode}, Player {PlayerId}, Role {Role}, State {RoomState}, ErrorCode {ErrorCode}",
				ShortGmPanelIdentifier(connectionId),
				room?.Id,
				caller is null ? null : RoomService.GetPlayerKey(caller),
				caller?.GmRole,
				room?.State,
				"gm_panel_state_failed");
			throw new HubException("gm_panel_state_failed");
		}
	}

	private static string ShortGmPanelIdentifier(string? value) =>
		string.IsNullOrWhiteSpace(value)
			? "none"
			: value[..Math.Min(value.Length, 8)];
}
