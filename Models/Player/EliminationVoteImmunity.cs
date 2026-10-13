namespace Bunker.Models;

public sealed class EliminationVoteImmunity
{
    public bool IsActive { get; set; }
    public string SourceThreatId { get; set; } = "";
    public int? GrantedAtRound { get; set; }
    public int RemainingUses { get; set; }
}
