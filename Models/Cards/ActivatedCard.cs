using Bunker.Models;
namespace Bunker.Models

{
	public class ActivatedCard
	{
		public string CardId { get; set; } = "";
		public string PlayerId { get; set; } = "";
		public string? TargetPlayerId { get; set; }
		public DateTime ActivatedAt { get; set; } = DateTime.UtcNow;
		
	}
}