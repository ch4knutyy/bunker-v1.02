using System.Text.Json.Serialization;

namespace Bunker.Models.GameData
{
    public class ConditionLocalization
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("description")]
        public string Description { get; set; } = "";

        [JsonPropertyName("descriptions")]
        public Dictionary<string, string> Descriptions { get; set; } = new();
    }
}
