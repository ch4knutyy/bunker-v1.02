using System.Text.Json.Serialization;

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
    }

    public class HobbiesRoot
    {
        [JsonPropertyName("hobbies")]
        public List<HobbyData> Hobbies { get; set; } = new();
    }
}
