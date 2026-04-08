using System.Text.Json.Serialization;

namespace Bunker.Models.GameData
{
    public class TraitData
    {
        [JsonPropertyName("trait")]
        public string Trait { get; set; } = "";
        
        [JsonPropertyName("type")]
        public string Type { get; set; } = "";
        
        [JsonPropertyName("category")]
        public string Category { get; set; } = "";
        
        [JsonPropertyName("effect")]
        public string Effect { get; set; } = "";
    }

    public class TraitsRoot
    {
        [JsonPropertyName("traits")]
        public List<TraitData> Traits { get; set; } = new();
    }
}
