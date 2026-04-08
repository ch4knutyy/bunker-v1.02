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
        /// Ефект у бункері - як фобія впливає на гру
        /// </summary>
        public string BunkerEffect { get; set; } = "";
        
        /// <summary>
        /// Автоматично сформований tooltip
        /// </summary>
        public string Tooltip => string.IsNullOrEmpty(Description) 
            ? "" 
            : $"{Description}. Ефект у бункері: {BunkerEffect}";
        
        /// <summary>
        /// Чи є tooltip для цієї характеристики
        /// </summary>
        public bool HasTooltip => !string.IsNullOrEmpty(Description);
    }
}
