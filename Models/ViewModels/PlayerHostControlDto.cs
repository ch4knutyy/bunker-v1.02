namespace Bunker.Models.ViewModels;

/// <summary>Host-facing player state without hidden characteristics.</summary>
public sealed class PlayerHostControlDto
{
    public string ConnectionId { get; init; } = "";
    public string StablePlayerId { get; init; } = "";
    public string Name { get; init; } = "";
    public int SeatNumber { get; init; }
    public bool IsHost { get; init; }
    public bool IsConnected { get; init; }
    public bool IsEliminated { get; init; }
    public int? EliminatedAtRound { get; init; }
    public bool EliminatedByVote { get; init; }
    public bool CanRevealAllAfterElimination { get; init; }
    public bool HasRevealedAllAfterElimination { get; init; }
    public RevealedCharacteristics Revealed { get; init; } = new();
}
