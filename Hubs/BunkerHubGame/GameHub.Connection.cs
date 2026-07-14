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

				// Даємо grace period на refresh, закриття вкладки або коротку втрату зв'язку.
				_ = Task.Run(async () =>
                {
					await Task.Delay(TimeSpan.FromMinutes(5));

					// Перевіряємо чи гравець вже перепідключився (connectionId змінився)
					var currentRoomId = _roomService.GetPlayerRoomId(disconnectedId);
                    if (currentRoomId == null)
                    {
                        // Вже видалений або перепідключився з новим connectionId
                        return;
                    }
                    
                    // Гравець не перепідключився — видаляємо
                    var (room, roomDeleted, newHostConnectionId) = _roomService.RemoveDisconnectedPlayer(disconnectedId);
                    
                    if (room != null && !roomDeleted)
                    {
                        var playersSnapshot = RoomService.GetPlayersSnapshot(room);
						if (room.State == RoomState.Lobby)
						{
							_gmAudit.Append(room, disconnectedPlayerId, "lobby_player_left", GmAuditResult.Success,
								"A disconnected lobby member left after the reconnect grace period.", disconnectedPlayerId);
						}
                        var newHostName = newHostConnectionId != null
                            ? playersSnapshot.FirstOrDefault(entry => entry.Key == newHostConnectionId).Value?.Name
                            : null;
						if (room.State == RoomState.Lobby && newHostConnectionId != null)
						{
							var newHost = playersSnapshot.FirstOrDefault(entry => entry.Key == newHostConnectionId).Value;
							if (newHost != null) _gmAudit.Append(room, disconnectedPlayerId, "host_transfer", GmAuditResult.Success,
								"Host role was transferred after the reconnect grace period.", RoomService.GetPlayerKey(newHost));
						}

                        await Clients.Group(room.Id).SendAsync("PlayerLeftRoom", new
                        {
                            connectionId = disconnectedId,
                            newHostConnectionId = newHostConnectionId,
                            newHostName = newHostName
                        });
                        
                        await Clients.All.SendAsync("RoomsListUpdated", _roomService.GetAllRooms());
                    }
                });
            }

            await base.OnDisconnectedAsync(exception);
        }

        #endregion
    }
}


