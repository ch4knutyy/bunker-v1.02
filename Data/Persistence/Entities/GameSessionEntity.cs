namespace Bunker.Data.Persistence.Entities
{
	public class GameSessionEntity
	{
		public Guid Id { get; set; }
		public string RoomCode { get; set; } = string.Empty;
		public DateTime CreatedAtUtc { get; set; }
		public DateTime? StartedAtUtc { get; set; }
		public DateTime? EndedAtUtc { get; set; }
		public string Status { get; set; } = string.Empty;
		public int PlayerCount { get; set; }
		public string? ApocalypseId { get; set; }
		public string? BunkerId { get; set; }
	}
}