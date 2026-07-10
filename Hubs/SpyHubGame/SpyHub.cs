using Bunker.Models.Spy;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs.GameHunSpy
{
    public class SpyHub : Hub
    {
        private readonly SpyRoomService _spyRooms;
        private readonly ILogger<SpyHub> _logger;

        public SpyHub(SpyRoomService spyRooms, ILogger<SpyHub> logger)
        {
            _spyRooms = spyRooms;
            _logger = logger;
        }

        public async Task CreateSpyRoom(string playerName, string playerId)
        {
            var room = _spyRooms.CreateRoom(Context.ConnectionId, playerName, playerId);
            await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomCode);
            await SendRoomState(room);
        }

        public async Task JoinSpyRoom(string roomCode, string playerName, string playerId)
        {
            var result = _spyRooms.JoinRoom(roomCode, Context.ConnectionId, playerName, playerId);
            if (!result.Success || result.Room == null)
            {
                await Clients.Caller.SendAsync("SpyError", result.Error ?? "Не вдалося приєднатися");
                return;
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, result.Room.RoomCode);
            await SendRoomState(result.Room);
        }

        public async Task StartSpyRound()
        {
            var result = _spyRooms.StartRound(Context.ConnectionId);
            await SendActionResult(result);
        }

        public async Task EndSpyRound()
        {
            var result = _spyRooms.EndRound(Context.ConnectionId);
            await SendActionResult(result);
        }

        public async Task NewSpyRound()
        {
            var result = _spyRooms.StartRound(Context.ConnectionId);
            await SendActionResult(result);
        }

        public async Task RevealSpyRoles()
        {
            var result = _spyRooms.RevealRoles(Context.ConnectionId);
            await SendActionResult(result);
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var room = _spyRooms.GetPlayerRoom(Context.ConnectionId);
            _spyRooms.MarkDisconnected(Context.ConnectionId);

            if (room != null)
                await SendRoomState(room);

            await base.OnDisconnectedAsync(exception);
        }

        private async Task SendActionResult((bool Success, string? Error, SpyRoom? Room) result)
        {
            if (!result.Success)
                await Clients.Caller.SendAsync("SpyError", result.Error ?? "Дію не виконано");

            if (result.Room != null)
                await SendRoomState(result.Room);
        }

        private async Task SendRoomState(SpyRoom room)
        {
            foreach (var connectionId in _spyRooms.GetConnectedConnectionIds(room))
            {
                await Clients.Client(connectionId).SendAsync(
                    "SpyStateUpdated",
                    _spyRooms.BuildClientState(room, connectionId));
            }
        }
    }
}
