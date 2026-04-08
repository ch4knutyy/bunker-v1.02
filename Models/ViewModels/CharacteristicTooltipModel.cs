namespace Bunker.Models.ViewModels
{
    /// <summary>
    /// Модель для відображення характеристики з tooltip в Razor View
    /// </summary>
    public class CharacteristicTooltipModel
    {
        /// <summary>
        /// Назва характеристики
        /// </summary>
        public string Name { get; set; } = "";
        
        /// <summary>
        /// Текст tooltip
        /// </summary>
        public string Tooltip { get; set; } = "";
        
        /// <summary>
        /// Чи показувати tooltip
        /// </summary>
        public bool HasTooltip => !string.IsNullOrEmpty(Tooltip);
        
        /// <summary>
        /// CSS клас для типу характеристики (profession, hobby, mental, physical, trait)
        /// </summary>
        public string TypeClass { get; set; } = "";
        
        /// <summary>
        /// Додаткова інформація (предмет, ступінь тощо)
        /// </summary>
        public string? AdditionalInfo { get; set; }
    }
}
