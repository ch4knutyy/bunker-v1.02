using System.Text.Json.Serialization;
using System.Text.Json;

namespace Bunker.Models.GameData
{
    public class HobbyData
    {
        [JsonPropertyName("hobby")]
        public string Hobby { get; set; } = "";
        
        [JsonPropertyName("type")]
        public string Type { get; set; } = "";
        
        [JsonPropertyName("item")]
        public string Item { get; set; } = "";
        
        [JsonPropertyName("bonus")]
        public string Bonus { get; set; } = "";

        [JsonPropertyName("capabilityTags")]
        public List<string> CapabilityTags { get; set; } = new();

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }

    public class HobbiesRoot
    {
        [JsonPropertyName("hobbies")]
        public List<HobbyData> Hobbies { get; set; } = new();
    }
}
