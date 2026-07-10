namespace Bunker.Models
{
    public class AppliedSpecialCardEffect
    {
        public string CardId { get; set; } = "";
        public string CardName { get; set; } = "";
        public string EffectType { get; set; } = "";
        public string OwnerPlayerId { get; set; } = "";
        public string OwnerPlayerName { get; set; } = "";
        public string? TargetPlayerId { get; set; }
        public string? TargetPlayerName { get; set; }
        public bool WasUsedSilently { get; set; }
        public bool BlocksOwnerVote { get; set; }
        public int VoteMultiplier { get; set; } = 1;
        public int Round { get; set; }
    }
}
