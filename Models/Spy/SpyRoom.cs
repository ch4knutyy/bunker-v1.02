namespace Bunker.Models.Spy
{
    public class SpyRoom
    {
        public string RoomCode { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public string HostPlayerId { get; set; } = "";
        public Dictionary<string, SpyPlayer> Players { get; set; } = new(StringComparer.OrdinalIgnoreCase);
        public int CurrentRound { get; set; }
        public bool IsRoundActive { get; set; }
        public string? SelectedLocationId { get; set; }
        public string? SelectedLocationName { get; set; }
        public string? SpyPlayerId { get; set; }
        public DateTime? RoundStartedAt { get; set; }
        public int? RoundDurationSeconds { get; set; }
        public bool RolesRevealed { get; set; }
    }
}
