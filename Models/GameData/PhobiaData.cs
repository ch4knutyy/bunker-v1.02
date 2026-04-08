using System.Text.Json.Serialization;

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
    }

    public class PhobiasRoot
    {
        [JsonPropertyName("phobias")]
        public List<PhobiaData> Phobias { get; set; } = new();
    }
}
