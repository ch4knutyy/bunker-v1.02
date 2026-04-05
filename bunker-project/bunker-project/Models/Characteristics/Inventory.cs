using System.Collections.Generic;

namespace Bunker.Models
{
	public class Inventory
	{
		public string Size { get; set; } = "";
		public List<Item> Items { get; set; } = new List<Item>();
	}
}