namespace Bunker.Models
{
    /// <summary>
    /// Ступені тяжкості для ментальних/фізичних станів
    /// </summary>
    public enum SeverityLevel
    {
        None,
        Mild,
        Moderate,
        Severe,
        VerySevere,
        Critical
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

            if (roll < 35) return SeverityLevel.Mild;
            if (roll < 65) return SeverityLevel.Moderate;
            if (roll < 85) return SeverityLevel.Severe;
            if (roll < 95) return SeverityLevel.VerySevere;
            return SeverityLevel.Critical;
        }

        public static string GetSeverityCode(SeverityLevel level)
        {
            return level switch
            {
                SeverityLevel.Mild => "light",
                SeverityLevel.Moderate => "medium",
                SeverityLevel.Severe => "hard",
                SeverityLevel.VerySevere => "veryHard",
                SeverityLevel.Critical => "critical",
                _ => "none"
            };
        }

        /// <summary>
        /// Отримати українську назву ступеня
        /// </summary>
        public static string GetSeverityName(SeverityLevel level, string lang = "uk")
        {
            return lang switch
            {
                "ru" => level switch
                {
                    SeverityLevel.Mild => "лёгкая форма",
                    SeverityLevel.Moderate => "средняя форма",
                    SeverityLevel.Severe => "тяжёлая форма",
                    SeverityLevel.VerySevere => "очень тяжёлая форма",
                    SeverityLevel.Critical => "критическая форма",
                    _ => ""
                },
                "en" => level switch
                {
                    SeverityLevel.Mild => "mild",
                    SeverityLevel.Moderate => "moderate",
                    SeverityLevel.Severe => "severe",
                    SeverityLevel.VerySevere => "very severe",
                    SeverityLevel.Critical => "critical",
                    _ => ""
                },
                _ => level switch
                {
                    SeverityLevel.Mild => "легка форма",
                    SeverityLevel.Moderate => "середня форма",
                    SeverityLevel.Severe => "важка форма",
                    SeverityLevel.VerySevere => "дуже важка форма",
                    SeverityLevel.Critical => "критична форма",
                    _ => ""
                }
            };
        }

        /// <summary>
        /// Форматувати назву з ступенем
        /// </summary>
        public static string FormatNameWithSeverity(string name, SeverityLevel level, string lang = "uk")
        {
            if (level == SeverityLevel.None)
                return name;
                
            var severityName = GetSeverityName(level, lang);
            return $"{name} ({severityName})";
        }
    }
}
