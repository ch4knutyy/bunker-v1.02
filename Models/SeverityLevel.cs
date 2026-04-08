namespace Bunker.Models
{
    /// <summary>
    /// Ступені тяжкості для ментальних/фізичних станів
    /// </summary>
    public enum SeverityLevel
    {
        None,       // Немає (50%)
        Mild,       // Легка (20%)
        Moderate,   // Середня (15%)
        Severe,     // Важка (8%)
        VerySevere, // Дуже важка (5%)
        Critical    // Критична (2%)
    }

    public static class SeverityHelper
    {
        private static readonly Random _random = new();

        /// <summary>
        /// Weighted Random вибір ступеня тяжкості
        /// </summary>
        public static SeverityLevel GetWeightedRandomSeverity()
        {
            int roll = _random.Next(100);
            
            // 50% - немає
            if (roll < 50) return SeverityLevel.None;
            // 20% - легка (50-70)
            if (roll < 70) return SeverityLevel.Mild;
            // 15% - середня (70-85)
            if (roll < 85) return SeverityLevel.Moderate;
            // 8% - важка (85-93)
            if (roll < 93) return SeverityLevel.Severe;
            // 5% - дуже важка (93-98)
            if (roll < 98) return SeverityLevel.VerySevere;
            // 2% - критична (98-100)
            return SeverityLevel.Critical;
        }

        /// <summary>
        /// Отримати українську назву ступеня
        /// </summary>
        public static string GetSeverityName(SeverityLevel level)
        {
            return level switch
            {
                SeverityLevel.None => "",
                SeverityLevel.Mild => "легка форма",
                SeverityLevel.Moderate => "середня форма",
                SeverityLevel.Severe => "важка форма",
                SeverityLevel.VerySevere => "дуже важка форма",
                SeverityLevel.Critical => "критична форма",
                _ => ""
            };
        }

        /// <summary>
        /// Форматувати назву з ступенем
        /// </summary>
        public static string FormatNameWithSeverity(string name, SeverityLevel level)
        {
            if (level == SeverityLevel.None)
                return name;
                
            var severityName = GetSeverityName(level);
            return $"{name} ({severityName})";
        }
    }
}
