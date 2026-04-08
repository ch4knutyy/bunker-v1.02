namespace Bunker.Models.Сharacteristics
{
    public class Hobby
    {
        public string Name { get; set; } = "";
        public string Type { get; set; } = "";
        
        /// <summary>
        /// Предмет що йде з хобі
        /// </summary>
        public string Item { get; set; } = "";
        
        /// <summary>
        /// Бонус від хобі
        /// </summary>
        public string Bonus { get; set; } = "";
        
        /// <summary>
        /// Автоматично згенерований tooltip
        /// Формат: "Може {bonus} та отримує бонусом: {item}."
        /// </summary>
        public string Tooltip { get; set; } = "";
        
        /// <summary>
        /// Чи є tooltip для цієї характеристики
        /// </summary>
        public bool HasTooltip => !string.IsNullOrEmpty(Tooltip);
    }
}
