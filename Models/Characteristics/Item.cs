using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bunker.Models
{
	public class Item
	{
		public string Name { get; set; } = "";
		public string Description { get; set; } = "";
		public int Quantity { get; set; }
		public string Unit { get; set; } = ""; // шт, кг, л, упаковка
		public double WeightKg { get; set; }
		public bool IsUsefulInBunker { get; set; }
		public string Rarity { get; set; } = "";
		public string InstanceId { get; set; } = "";
		public bool IsHidden { get; set; }
		public string Source { get; set; } = "";
		public string SourceThreatId { get; set; } = "";
		public int? AcquiredRound { get; set; }
		public List<string> ResourceTags { get; set; } = new();
		public List<string> ProtectionTags { get; set; } = new();
		public Dictionary<string, JsonElement>? ThreatUsage { get; set; }

		[JsonPropertyName("_i18n")]
		public Dictionary<string, JsonElement>? I18n { get; set; }
	}
}
