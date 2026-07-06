using System.Text.Json.Serialization;
using System.Text.Json;

namespace Bunker.Models.GameData
{
    public class MentalConditionData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";
        
        [JsonPropertyName("назва")]
        public string Name { get; set; } = "";

        [JsonPropertyName("name")]
        public string NameAlias
        {
            get => Name;
            set
            {
                if (!string.IsNullOrWhiteSpace(value)) Name = value;
            }
        }
        
        [JsonPropertyName("категорія")]
        public string Category { get; set; } = "";

        [JsonPropertyName("category")]
        public string CategoryAlias
        {
            get => Category;
            set
            {
                if (!string.IsNullOrWhiteSpace(value)) Category = value;
            }
        }

        [JsonPropertyName("hasSeverity")]
        public bool? HasSeverity { get; set; }

        [JsonPropertyName("localization")]
        public Dictionary<string, ConditionLocalization>? Localization { get; set; }
        
        [JsonPropertyName("тон")]
        public string Tone { get; set; } = "";
        
        [JsonPropertyName("рідкість")]
        public string Rarity { get; set; } = "";
        
        [JsonPropertyName("тяжкість")]
        public int Severity { get; set; }
        
        [JsonPropertyName("видимість")]
        public string Visibility { get; set; } = "";
        
        [JsonPropertyName("опис")]
        public string Description { get; set; } = "";
        
        [JsonPropertyName("ефект_у_грі")]
        public string GameEffect { get; set; } = "";
        
        [JsonPropertyName("вплив_на_виживання")]
        public int SurvivalImpact { get; set; }
        
        [JsonPropertyName("вплив_на_соціум")]
        public int SocialImpact { get; set; }
        
        [JsonPropertyName("складність_лікування")]
        public int TreatmentDifficulty { get; set; }
        
        [JsonPropertyName("вигаданий")]
        public bool IsFictional { get; set; }
        
        [JsonPropertyName("теги")]
        public List<string> Tags { get; set; } = new();

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }

    public class MentalConditionsRoot
    {
        [JsonPropertyName("mental_conditions")]
        public List<MentalConditionData> MentalConditions { get; set; } = new();
    }
}
