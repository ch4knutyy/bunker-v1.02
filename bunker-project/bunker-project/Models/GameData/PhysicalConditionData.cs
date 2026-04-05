using System.Text.Json.Serialization;

namespace Bunker.Models.GameData
{
    public class PhysicalConditionData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";
        
        [JsonPropertyName("назва")]
        public string Name { get; set; } = "";
        
        [JsonPropertyName("категорія")]
        public string Category { get; set; } = "";
        
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
        
        [JsonPropertyName("вплив_на_рух")]
        public int MovementImpact { get; set; }
        
        [JsonPropertyName("рівень_болю")]
        public int PainLevel { get; set; }
        
        [JsonPropertyName("складність_лікування")]
        public int TreatmentDifficulty { get; set; }
        
        [JsonPropertyName("вигаданий")]
        public bool IsFictional { get; set; }
        
        [JsonPropertyName("теги")]
        public List<string> Tags { get; set; } = new();
        
        // Додаткове поле для визначення чи потрібна ступінь тяжкості
        // Визначається автоматично на основі категорії
        public bool AllowSeverityDisplay => Category == "хронічний" || 
                                            Category == "тривожний" ||
                                            Name.Contains("Астма") ||
                                            Name.Contains("Артрит") ||
                                            Name.Contains("біль") ||
                                            Name.Contains("Біль");
    }

    public class PhysicalConditionsRoot
    {
        [JsonPropertyName("physical_conditions")]
        public List<PhysicalConditionData> PhysicalConditions { get; set; } = new();
    }
}
