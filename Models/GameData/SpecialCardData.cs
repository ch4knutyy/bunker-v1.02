using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bunker.Models.GameData
{
    public class SpecialCardData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("description")]
        public string Description { get; set; } = "";

        [JsonPropertyName("isSecret")]
        public bool IsSecret { get; set; } = true;

        [JsonPropertyName("isOneTimeUse")]
        public bool IsOneTimeUse { get; set; } = true;

        [JsonPropertyName("phase")]
        public string Phase { get; set; } = "beforeVoting";

        [JsonPropertyName("effectType")]
        public string EffectType { get; set; } = "";

        [JsonPropertyName("requiresTarget")]
        public bool RequiresTarget { get; set; }

        [JsonPropertyName("effectDuration")]
        public string EffectDuration { get; set; } = "instant";

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }
}
