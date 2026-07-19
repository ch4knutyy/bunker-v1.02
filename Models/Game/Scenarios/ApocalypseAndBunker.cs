using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bunker.Models
{
    /// <summary>
    /// Апокаліпсис - глобальна катастрофа
    /// </summary>
    public class Apocalypse
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Severity { get; set; } = "medium"; // low, medium, high, extreme
        public int SurvivalChance { get; set; } = 50; // Шанс виживання у %
        public string Duration { get; set; } = ""; // Тривалість перебування в бункері
        public List<string> Threats { get; set; } = new(); // Загрози зовні
        public List<string> Requirements { get; set; } = new(); // Що потрібно для виживання
        public List<string> Tags { get; set; } = new();
        public string? ImageUrl { get; set; } // URL зображення апокаліпсису

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }

        public object ToClientInfo()
        {
            return new
            {
                id = Id,
                name = Name,
                description = Description,
                severity = Severity,
                survivalChance = SurvivalChance,
                duration = Duration,
                threats = Threats,
                requirements = Requirements,
                tags = Tags,
                imageUrl = ImageUrl,
                _i18n = I18n
            };
        }
        
        /// <summary>
        /// Генерує промпт для AI-генерації зображення
        /// </summary>
        public string GenerateImagePrompt()
        {
            var threatsList = Threats.Count > 0 ? string.Join(", ", Threats.Take(3)) : "unknown dangers";
            return $"Create a dark cinematic post-apocalyptic illustration of '{Name}'. " +
                   $"{Description} " +
                   $"Show {threatsList}, desperate survival mood, dramatic lighting, realistic detailed style. " +
                   $"Severity: {Severity}. Dark atmospheric scene, high detail, 4k quality.";
        }
    }

    /// <summary>
    /// Бункер - укриття для виживання
    /// </summary>
    public class BunkerInfo
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public int Capacity { get; set; } = 6; // Максимальна кількість людей
        public string Location { get; set; } = "";
        [JsonPropertyName("suppliesMonths")]
        public int SuppliesMonths { get; set; } = 12; // Запас їжі у місяцях
        private int? _waterMonths;

        [JsonIgnore]
        public int WaterMonths
        {
            get => _waterMonths ?? SuppliesMonths;
            set => _waterMonths = value;
        }

        [JsonPropertyName("waterMonths")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public int? SerializedWaterMonths
        {
            get => _waterMonths;
            set => _waterMonths = value;
        }

        [JsonIgnore]
        public bool HasExplicitWaterMonths => _waterMonths.HasValue;
        public List<string> Facilities { get; set; } = new(); // Доступні приміщення
        public List<string> Resources { get; set; } = new(); // Наявні ресурси
        public List<string> Problems { get; set; } = new(); // Проблеми бункера
        public string Condition { get; set; } = "good"; // poor, fair, good, excellent
        public List<string> BunkerTags { get; set; } = new();
        public BunkerThreatAssets ThreatAssets { get; set; } = new();
        public string? ImageUrl { get; set; } // URL зображення бункера

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }

        public object ToClientInfo()
        {
            return new
            {
                id = Id,
                name = Name,
                description = Description,
                capacity = Capacity,
                location = Location,
                suppliesMonths = SuppliesMonths,
                waterMonths = WaterMonths,
                facilities = Facilities,
                resources = Resources,
                threatAssets = ThreatAssets.ToClientInfo(),
                problems = Problems,
                condition = Condition,
                bunkerTags = BunkerTags,
                imageUrl = ImageUrl,
                _i18n = I18n
            };
        }
        
        /// <summary>
        /// Генерує промпт для AI-генерації зображення
        /// </summary>
        public string GenerateImagePrompt()
        {
            var facilitiesList = Facilities.Count > 0 ? string.Join(", ", Facilities.Take(3)) : "basic rooms";
            var problemsList = Problems.Count > 0 ? string.Join(", ", Problems.Take(2)) : "";
            var problemsText = !string.IsNullOrEmpty(problemsList) ? $"Problems visible: {problemsList}. " : "";
            
            return $"Create a dark realistic underground survival bunker illustration of '{Name}'. " +
                   $"{Description} " +
                   $"Location: {Location}. Facilities: {facilitiesList}. " +
                   $"{problemsText}" +
                   $"Condition: {Condition}. Survival atmosphere, cinematic lighting, realistic detailed style, 4k quality.";
        }
    }

    /// <summary>
    /// Кореневі об'єкти для JSON
    /// </summary>
    public class ApocalypsesRoot
    {
        public List<Apocalypse> Apocalypses { get; set; } = new();
    }

    public class BunkersRoot
    {
        public List<BunkerInfo> Bunkers { get; set; } = new();
    }

    public class BunkerThreatAssets
    {
        public List<BunkerThreatAsset> Resources { get; set; } = new();
        public List<BunkerThreatAsset> Facilities { get; set; } = new();

        public object ToClientInfo()
        {
            return new
            {
                resources = Resources.Select(asset => asset.ToClientInfo()).ToList(),
                facilities = Facilities.Select(asset => asset.ToClientInfo()).ToList()
            };
        }
    }

    public class BunkerThreatAsset
    {
        [JsonPropertyName("assetId")]
        public string Id { get; set; } = "";

        [JsonPropertyName("name")]
        public JsonElement? NameI18n { get; set; }

        [JsonPropertyName("defaultState")]
        public string Status { get; set; } = "available";
        public int? Quantity { get; set; }
        public List<string> ResourceTags { get; set; } = new();
        public List<string> FacilityTags { get; set; } = new();
        public List<string> ProtectionTags { get; set; } = new();

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }

        public string GetName(string language = "uk")
        {
            if (NameI18n is { ValueKind: JsonValueKind.String })
            {
                return NameI18n.Value.GetString() ?? Id;
            }

            if (NameI18n is { ValueKind: JsonValueKind.Object })
            {
                if (NameI18n.Value.TryGetProperty(language, out var localized) &&
                    localized.ValueKind == JsonValueKind.String)
                {
                    return localized.GetString() ?? Id;
                }

                if (NameI18n.Value.TryGetProperty("uk", out var uk) &&
                    uk.ValueKind == JsonValueKind.String)
                {
                    return uk.GetString() ?? Id;
                }
            }

            return Id;
        }

        public object ToClientInfo()
        {
            return new
            {
                id = Id,
                name = GetName(),
                localizedName = NameI18n,
                status = string.IsNullOrWhiteSpace(Status) ? "available" : Status,
                quantity = Quantity,
                resourceTags = ResourceTags,
                facilityTags = FacilityTags,
                protectionTags = ProtectionTags,
                _i18n = I18n
            };
        }
    }
}
