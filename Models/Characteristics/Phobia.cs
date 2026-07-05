using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bunker.Models.Сharacteristics
{
    /// <summary>
    /// Фобія персонажа - ірраціональний страх
    /// </summary>
    public class Phobia
    {
        /// <summary>
        /// Ідентифікатор фобії
        /// </summary>
        public string Id { get; set; } = "";
        
        /// <summary>
        /// Назва фобії (наприклад: Клаустрофобія)
        /// </summary>
        public string Name { get; set; } = "";
        
        /// <summary>
        /// Короткий опис фобії
        /// </summary>
        public string Description { get; set; } = "";
        
        /// <summary>
        /// Опис впливу фобії
        /// </summary>
        public string BunkerEffect { get; set; } = "";
        
        /// <summary>
        /// Автоматично сформований tooltip
        /// </summary>
        public string Tooltip => string.IsNullOrEmpty(Description) 
            ? "" 
            : string.IsNullOrEmpty(BunkerEffect) ? Description : $"{Description}. {BunkerEffect}";
        
        /// <summary>
        /// Чи є tooltip для цієї характеристики
        /// </summary>
        public bool HasTooltip => !string.IsNullOrEmpty(Description);

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }
}
