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
	}
}