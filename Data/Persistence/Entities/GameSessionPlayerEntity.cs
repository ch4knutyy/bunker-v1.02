using Bunker.Data.Persistence.Identity;

namespace Bunker.Data.Persistence.Entities;

public sealed class GameSessionPlayerEntity
{
	public Guid Id { get; set; }
	public Guid GameSessionId { get; set; }
	public GameSessionEntity GameSession { get; set; } = null!;
	public Guid? UserId { get; set; }
	public ApplicationUser? User { get; set; }
	public string StablePlayerIdSnapshot { get; set; } = string.Empty;
	public string PlayerNameSnapshot { get; set; } = string.Empty;
	public bool IsHost { get; set; }
	public bool IsWinner { get; set; }
	public bool WasEliminated { get; set; }
	public int? EliminatedAtRound { get; set; }
}
