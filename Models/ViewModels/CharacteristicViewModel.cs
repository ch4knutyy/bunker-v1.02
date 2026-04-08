namespace Bunker.Models.ViewModels
{
    /// <summary>
    /// Загальна модель для характеристики з підтримкою tooltip
    /// </summary>
    public class CharacteristicViewModel
    {
        /// <summary>
        /// Назва характеристики (відображається в UI)
        /// </summary>
        public string Name { get; set; } = "";
        
        /// <summary>
        /// Короткий опис для показу в картці
        /// </summary>
        public string Description { get; set; } = "";
        
        /// <summary>
        /// Повний текст для tooltip (при наведенні на знак оклику)
        /// </summary>
        public string Tooltip { get; set; } = "";
        
        /// <summary>
        /// Бонус або ефект у грі
        /// </summary>
        public string Bonus { get; set; } = "";
        
        /// <summary>
        /// Вибраний предмет (для професії/хобі)
        /// </summary>
        public string? SelectedItem { get; set; }
        
        /// <summary>
        /// Ступінь тяжкості (для ментальних/фізичних станів)
        /// </summary>
        public string? Severity { get; set; }
        
        /// <summary>
        /// Чи має ця характеристика tooltip
        /// </summary>
        public bool HasTooltip { get; set; }
        
        /// <summary>
        /// Чи видима характеристика іншим гравцям
        /// </summary>
        public bool IsVisibleToOthers { get; set; }
        
        /// <summary>
        /// Чи вже розкрита характеристика
        /// </summary>
        public bool IsRevealed { get; set; }
        
        /// <summary>
        /// Категорія характеристики (для стилізації)
        /// </summary>
        public string Category { get; set; } = "";
        
        /// <summary>
        /// Тип характеристики (сильна/слабка тощо)
        /// </summary>
        public string Type { get; set; } = "";
    }
}
