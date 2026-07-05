using System.Text.Json.Serialization;
using System.Text.Json;

namespace Bunker.Models.GameData
{
    public class PhobiaData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";
        
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";
        
        [JsonPropertyName("description")]
        public string Description { get; set; } = "";
        
        [JsonPropertyName("bunkerEffect")]
        public string BunkerEffect { get; set; } = "";

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }

    public class PhobiasRoot
    {
        [JsonPropertyName("phobias")]
        public List<PhobiaData> Phobias { get; set; } = new();
    }
}
