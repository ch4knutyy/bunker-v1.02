namespace Bunker.Models.Сharacteristics
{
    public class Traits
    {
        /// <summary>
        /// Назва особливості
        /// </summary>
        public string Name { get; set; } = "";
        
        /// <summary>
        /// Тип: сильна/слабка
        /// </summary>
        public string Type { get; set; } = "";
        
        /// <summary>
        /// Категорія: мемна, серйозна, темна, дивна, соціальна
        /// </summary>
        public string Category { get; set; } = "";
        
        /// <summary>
        /// Ефект у грі
        /// </summary>
        public string Effect { get; set; } = "";
        
        /// <summary>
        /// Автоматично згенерований tooltip
        /// Формат: "{Name}. {Effect}."
        /// </summary>
        public string Tooltip { get; set; } = "";
        
        /// <summary>
        /// Чи є tooltip для цієї характеристики
        /// </summary>
        public bool HasTooltip => !string.IsNullOrEmpty(Tooltip);
    }
}
