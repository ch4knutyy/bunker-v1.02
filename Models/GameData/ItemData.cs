using System.Text.Json.Serialization;

namespace Bunker.Models.GameData
{
    public class ItemData
    {
        [JsonPropertyName("item")]
        public string Item { get; set; } = "";
        
        [JsonPropertyName("category")]
        public string Category { get; set; } = "";
    }

    public class ItemsRoot
    {
        [JsonPropertyName("items")]
        public List<ItemData> Items { get; set; } = new();
    }
}
