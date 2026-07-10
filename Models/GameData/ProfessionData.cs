using System.Text.Json.Serialization;
using System.Text.Json;

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

        [JsonPropertyName("capabilityTags")]
        public List<string> CapabilityTags { get; set; } = new();

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }

    public class ProfessionsRoot
    {
        [JsonPropertyName("professions")]
        public List<ProfessionData> Professions { get; set; } = new();
    }
}
