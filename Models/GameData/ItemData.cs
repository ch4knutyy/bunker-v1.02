using System.Text.Json.Serialization;
using System.Text.Json;

namespace Bunker.Models.GameData
{
    public class ItemData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("item")]
        public string Item { get; set; } = "";
        
        [JsonPropertyName("category")]
        public string Category { get; set; } = "";

        [JsonPropertyName("resourceTags")]
        public List<string> ResourceTags { get; set; } = new();

        [JsonPropertyName("protectionTags")]
        public List<string> ProtectionTags { get; set; } = new();

        [JsonPropertyName("threatUsage")]
        public Dictionary<string, JsonElement>? ThreatUsage { get; set; }

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }

    public class ItemsRoot
    {
        [JsonPropertyName("items")]
        public List<ItemData> Items { get; set; } = new();
    }
}
