using Bunker.Models.GameData;

namespace Bunker.Models
{
    public static class RadiationConsequenceFactory
    {
        public const string RadiationConditionId = "physical_152";

        public static bool TryAddRadiationCondition(
            Player player,
            PhysicalConditionData? condition,
            string severityCode,
            string sourceThreatId,
            int? appliedAtRound,
            out PlayerConditionEffect? effect)
        {
            effect = null;
            if (condition?.AllowSeverityDisplay == false)
            {
                return false;
            }

            if (player.AdditionalConditionEffects.Any(existing =>
                    string.Equals(existing.ConditionId, RadiationConditionId, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(existing.SourceThreatId, sourceThreatId, StringComparison.OrdinalIgnoreCase)))
            {
                return false;
            }

            var baseName = GetLocalizedConditionName(condition, "uk");
            if (string.IsNullOrWhiteSpace(baseName))
            {
                return false;
            }

            var severityLevel = SeverityHelper.GetSeverityLevelFromCode(severityCode);
            var severityName = SeverityHelper.GetSeverityName(severityLevel, "uk");
            effect = new PlayerConditionEffect
            {
                Id = Guid.NewGuid().ToString("N"),
                ConditionId = RadiationConditionId,
                BaseName = baseName,
                Name = SeverityHelper.FormatNameWithSeverity(baseName, severityLevel, "uk"),
                SeverityCode = severityCode,
                SeverityLevel = severityName,
                SourceThreatId = sourceThreatId,
                AppliedAtRound = appliedAtRound,
                Description = GetLocalizedConditionDescription(condition, "uk", severityCode),
                Localization = condition?.Localization
            };
            player.AdditionalConditionEffects.Add(effect);
            return true;
        }

        private static string GetLocalizedConditionName(PhysicalConditionData? condition, string language)
        {
            if (condition == null)
            {
                return "";
            }

            foreach (var lang in GetConditionLanguageOrder(condition.Localization, language))
            {
                if (condition.Localization != null &&
                    condition.Localization.TryGetValue(lang, out var localized) &&
                    !string.IsNullOrWhiteSpace(localized.Name))
                {
                    return localized.Name.Trim();
                }
            }

            return string.IsNullOrWhiteSpace(condition.Name) ? "" : condition.Name.Trim();
        }

        private static string GetLocalizedConditionDescription(PhysicalConditionData? condition, string language, string severityCode)
        {
            if (condition == null)
            {
                return "";
            }

            foreach (var lang in GetConditionLanguageOrder(condition.Localization, language))
            {
                if (condition.Localization == null ||
                    !condition.Localization.TryGetValue(lang, out var localized))
                {
                    continue;
                }

                if (localized.Descriptions != null &&
                    localized.Descriptions.TryGetValue(severityCode, out var severityDescription) &&
                    !string.IsNullOrWhiteSpace(severityDescription))
                {
                    return severityDescription.Trim();
                }

                if (!string.IsNullOrWhiteSpace(localized.Description))
                {
                    return localized.Description.Trim();
                }
            }

            return condition.Description?.Trim() ?? "";
        }

        private static IEnumerable<string> GetConditionLanguageOrder(
            Dictionary<string, ConditionLocalization>? localization,
            string language)
        {
            var result = new List<string>();
            void Add(string? value)
            {
                if (!string.IsNullOrWhiteSpace(value) && !result.Contains(value, StringComparer.OrdinalIgnoreCase))
                {
                    result.Add(value);
                }
            }

            Add(language);
            Add("uk");
            Add("ru");
            Add("en");

            if (localization != null)
            {
                foreach (var key in localization.Keys)
                {
                    Add(key);
                }
            }

            return result;
        }
    }
}
