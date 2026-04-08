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
        
        /// <summary>
        /// Бонус професії
        /// </summary>
        public string Bonus { get; set; } = "";
        
        /// <summary>
        /// Автоматично згенерований tooltip
        /// Формат: "Вміє {bonus} та має при собі {selectedItem}."
        /// </summary>
        public string Tooltip { get; set; } = "";
        
        /// <summary>
        /// Чи є tooltip для цієї характеристики
        /// </summary>
        public bool HasTooltip => !string.IsNullOrEmpty(Tooltip);
    }
}
