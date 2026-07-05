using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bunker.Models.Сharacteristics
{
    public class Fact
    {
        public string Id { get; set; } = "";
        public string Source { get; set; } = "";
        public string Type { get; set; } = "";
        public string Category { get; set; } = "";
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Tooltip { get; set; } = "";
        public bool HasTooltip => !string.IsNullOrEmpty(Tooltip);

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }
}
