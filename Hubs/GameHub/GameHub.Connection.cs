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
                        await Clients.Group(room.Id).SendAsync("PlayerLeftRoom", new
                        {
                            connectionId = disconnectedId,
                            newHostConnectionId = newHostConnectionId,
                            newHostName = newHostConnectionId != null && room.Players.ContainsKey(newHostConnectionId)
                                ? room.Players[newHostConnectionId].Name
                                : (string?)null
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


