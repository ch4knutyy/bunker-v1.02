using System.Text.Json.Serialization;
using System.Text.Json;

namespace Bunker.Models.GameData
{
    public class ItemData
    {
        [JsonPropertyName("item")]
        public string Item { get; set; } = "";
        
        [JsonPropertyName("category")]
        public string Category { get; set; } = "";

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }

    public class ItemsRoot
    {
        [JsonPropertyName("items")]
        public List<ItemData> Items { get; set; } = new();
    }
}
