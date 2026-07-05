using System.Text.Json.Serialization;
using System.Text.Json;

namespace Bunker.Models.GameData
{
    public class FactData
    {
        public string Id { get; set; } = "";
        public string Source { get; set; } = "";
        public string Type { get; set; } = "";
        public string Category { get; set; } = "";
        public string Fact { get; set; } = "";
        public string Description { get; set; } = "";

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }

    public class FactsRoot
    {
        [JsonPropertyName("facts")]
        public List<FactData> Facts { get; set; } = new();
    }
}
