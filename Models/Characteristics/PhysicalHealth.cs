namespace Bunker.Models.Сharacteristics
{
    public class PhysicalHealth
    {
        public string Id { get; set; } = "";
        
        /// <summary>
        /// Базова назва стану (без ступеня)
        /// </summary>
        public string BaseName { get; set; } = "";
        
        /// <summary>
        /// Повна назва з ступенем тяжкості (якщо застосовно)
        /// Формат: "Астма (середня форма)"
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
        /// Null якщо для цього стану ступінь не застосовується
        /// </summary>
        public string? SeverityLevel { get; set; }
        
        /// <summary>
        /// Чи застосовується ступінь тяжкості для цього стану
        /// </summary>
        public bool AllowsSeverity { get; set; }
        
        public string Visibility { get; set; } = "";
        public string Description { get; set; } = "";
        public string GameEffect { get; set; } = "";
        public int SurvivalImpact { get; set; }
        public int SocialImpact { get; set; }
        public int MovementImpact { get; set; }
        public int PainLevel { get; set; }
        public int TreatmentDifficulty { get; set; }
        public bool IsFictional { get; set; }
        public List<string> Tags { get; set; } = new();
        
        /// <summary>
        /// Автоматично згенерований tooltip
        /// Формат: "{Description}. Ефект у грі: {GameEffect}."
        /// </summary>
        public string Tooltip { get; set; } = "";
        
        /// <summary>
        /// Чи є tooltip для цієї характеристики
        /// </summary>
        public bool HasTooltip => !string.IsNullOrEmpty(Tooltip);
    }
}
