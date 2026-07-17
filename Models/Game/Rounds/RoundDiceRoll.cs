namespace Bunker.Models
{
    public class RoundDiceRoll
    {
        public int Round { get; set; }
        public int Value { get; set; }
        public DateTime RolledAt { get; set; } = DateTime.UtcNow;
        public string RolledByPlayerId { get; set; } = "";
        public string RolledByConnectionId { get; set; } = "";
        public string RolledByPlayerName { get; set; } = "GM";
    }
}
