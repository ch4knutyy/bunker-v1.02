using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bunker.Models
{
    public class Profession
    {
        public string Name { get; set; } = "";
        public int ExperienceYears { get; set; }
        public string Type { get; set; } = "";
        
        /// <summary>
        /// Список навичок професії
        /// </summary>
        public List<string> Skills { get; set; } = new();
        
        /// <summary>
        /// Всі можливі предмети професії
        /// </summary>
        public List<string> AllItems { get; set; } = new();
        
        /// <summary>
        /// Вибраний один предмет з масиву items
        /// </summary>
        public string SelectedItem { get; set; } = "";
        public int? SelectedItemIndex { get; set; }
        
        /// <summary>
        /// Бонус професії
        /// </summary>
        public string Bonus { get; set; } = "";

        public List<string> CapabilityTags { get; set; } = new();
        
        /// <summary>
        /// Автоматично згенерований tooltip
        /// Формат: "Вміє {bonus}."
        /// </summary>
        public string Tooltip { get; set; } = "";
        
        /// <summary>
        /// Чи є tooltip для цієї характеристики
        /// </summary>
        public bool HasTooltip => !string.IsNullOrEmpty(Tooltip);

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }
}
