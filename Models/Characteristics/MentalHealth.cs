namespace Bunker.Models.Сharacteristics
{
    public class MentalHealth
    {
        public string Id { get; set; } = "";
        
        /// <summary>
        /// Базова назва стану (без ступеня)
        /// </summary>
        public string BaseName { get; set; } = "";
        
        /// <summary>
        /// Повна назва з ступенем тяжкості (якщо є)
        /// Формат: "Піроманія (важка форма)"
        /// </summary>
        public string Name { get; set; } = "";
        
        public string Category { get; set; } = "";
        public string Tone { get; set; } = "";
        public string Rarity { get; set; } = "";
        
        /// <summary>
        /// Базова тяжкість з JSON
        /// </summary>
        public int BaseSeverity { get; set; }
        
        /// <summary>
        /// Випадковий ступінь тяжкості (легка/середня/важка тощо)
        /// </summary>
        public string SeverityLevel { get; set; } = "";
        
        public string Visibility { get; set; } = "";
        public string Description { get; set; } = "";
        public string GameEffect { get; set; } = "";
        public int SurvivalImpact { get; set; }
        public int SocialImpact { get; set; }
        public int TreatmentDifficulty { get; set; }
        public bool IsFictional { get; set; }
        public List<string> Tags { get; set; } = new();
        
        /// <summary>
        /// Автоматично згенерований tooltip
        /// Формат: "{SeverityLevel} {BaseName}. {Description}. Ефект у грі: {GameEffect}."
        /// </summary>
        public string Tooltip { get; set; } = "";
        
        /// <summary>
        /// Чи є tooltip для цієї характеристики
        /// </summary>
        public bool HasTooltip => !string.IsNullOrEmpty(Tooltip);
    }
}
