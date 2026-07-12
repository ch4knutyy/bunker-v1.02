using System.Text.Json.Serialization;
using System.Text.Json;

namespace Bunker.Models.GameData
{
    public class CharacterTraitData
    {
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [JsonPropertyName("trait")]
        public string Trait { get; set; } = "";
        
        [JsonPropertyName("type")]
        public string Type { get; set; } = "";

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }

    public class CharacterTraitsRoot
    {
        [JsonPropertyName("character_traits")]
        public List<CharacterTraitData> CharacterTraits { get; set; } = new();
    }
}
