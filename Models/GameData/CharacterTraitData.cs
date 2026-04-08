using System.Text.Json.Serialization;

namespace Bunker.Models.GameData
{
    public class CharacterTraitData
    {
        [JsonPropertyName("trait")]
        public string Trait { get; set; } = "";
        
        [JsonPropertyName("type")]
        public string Type { get; set; } = "";
    }

    public class CharacterTraitsRoot
    {
        [JsonPropertyName("character_traits")]
        public List<CharacterTraitData> CharacterTraits { get; set; } = new();
    }
}
