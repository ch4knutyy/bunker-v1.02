using Bunker.Models;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
	public async Task<GmPanelStateDto> GetGmPanelState()
	{
		var room = _roomService.GetPlayerRoom(Context.ConnectionId);
		if (room is null ||
			!_roomService.TryResolvePlayer(
				room,
				Context.ConnectionId,
				out _,
				out var caller))
		{
			throw new HubException("gm_panel_not_available");
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
			throw new HubException("gm_panel_not_authorized");
		}

		return state;
	}
}
