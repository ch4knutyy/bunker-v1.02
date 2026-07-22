using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;
using System.Numerics;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace Bunker.Hubs
{
    public partial class GameHub
    {
        #region Connection Lifecycle

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var disconnectedId = Context.ConnectionId;
            var roomId = _roomService.GetPlayerRoomId(disconnectedId);
            
            if (roomId != null)
            {
                var room = _roomService.GetRoom(roomId);
                var disconnectedPlayer = _roomService.GetPlayer(disconnectedId);
                var disconnectedPlayerId = disconnectedPlayer == null ? disconnectedId : RoomService.GetPlayerKey(disconnectedPlayer);
                if (room != null && disconnectedPlayer != null && room.IsHost(disconnectedPlayer) &&
                    _roomGameSettings.GetEffective(room).PauseTimerOnHostDisconnect && _gameTimerService.Pause(room))
                {
                    await Clients.Group(room.Id).SendAsync("GameTimerUpdated", _gameTimerService.GetDto(room));
                }
                _roomService.MarkPlayerDisconnected(disconnectedId);
				if (room != null)
				{
					QueueRoomRecovery(room, "disconnect");
					await BroadcastDeveloperAuthorityState(room);
					await BroadcastPostGameTransition(room);
				}

                if (room != null && disconnectedPlayer != null)
                {
                    _playerDisconnectCleanup.Schedule(
                        room.Id,
                        disconnectedPlayer.Id,
                        disconnectedId,
                        disconnectedPlayerId);
                }
            }

            await base.OnDisconnectedAsync(exception);
        }

        #endregion
    }
}


