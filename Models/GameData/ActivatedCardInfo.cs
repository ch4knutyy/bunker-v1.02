namespace Bunker.Models
{
	public class ActivatedCardInfo
	{
		public string CardId { get; set; } = "";
		public string CardName { get; set; } = "";
		public string PlayerId { get; set; } = "";
		public string Rarity { get; set; } = "common";
		public string PlayerName { get; set; } = "";
		public string? TargetPlayerId { get; set; }
		public string Description { get; set; } = "";
		public string? TargetPlayerName { get; set; }
		public string? TargetCharacteristic { get; set; }
		public string ConnectionId { get; set; } = "";
		public DateTime ActivatedAt { get; set; } = DateTime.UtcNow;
	}
}