namespace Bunker.Models.Spy
{
    public class SpyPlayer
    {
        public string PlayerId { get; set; } = "";
        public string ConnectionId { get; set; } = "";
        public string Name { get; set; } = "";
        public bool IsHost { get; set; }
        public bool IsConnected { get; set; } = true;
        public DateTime? DisconnectedAt { get; set; }
        public string? VoteTargetPlayerId { get; set; }
    }
}
