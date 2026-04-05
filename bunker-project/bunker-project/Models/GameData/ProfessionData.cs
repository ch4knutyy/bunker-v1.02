using System.Text.Json.Serialization;

namespace Bunker.Models.GameData
{
    public class ProfessionData
    {
        [JsonPropertyName("profession")]
        public string Profession { get; set; } = "";
        
        [JsonPropertyName("type")]
        public string Type { get; set; } = "";
        
        [JsonPropertyName("skills")]
        public List<string> Skills { get; set; } = new();
        
        [JsonPropertyName("items")]
        public List<string> Items { get; set; } = new();
        
        [JsonPropertyName("bonus")]
        public string Bonus { get; set; } = "";
    }

    public class ProfessionsRoot
    {
        [JsonPropertyName("professions")]
        public List<ProfessionData> Professions { get; set; } = new();
    }
}
