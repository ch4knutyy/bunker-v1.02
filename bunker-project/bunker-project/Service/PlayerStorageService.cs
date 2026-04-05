using Bunker.Models;

namespace Bunker.Services
{
    public class PlayerStorageService
    {
        private readonly Dictionary<string, Player> _playersByConnectionId = new();

        public void SavePlayer(string connectionId, Player player)
        {
            _playersByConnectionId[connectionId] = player;
        }

        public Player? GetPlayer(string connectionId)
        {
            _playersByConnectionId.TryGetValue(connectionId, out var player);
            return player;
        }

        public void RemovePlayer(string connectionId)
        {
            _playersByConnectionId.Remove(connectionId);
        }

        public IEnumerable<Player> GetAllPlayers()
        {
            return _playersByConnectionId.Values;
        }

        public Player? GetPlayerByName(string name)
        {
            return _playersByConnectionId.Values.FirstOrDefault(p => p.Name == name);
        }
    }
}
