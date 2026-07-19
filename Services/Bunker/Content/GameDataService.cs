using System.Text.Json;
using Bunker.Models.GameData;
using Bunker.Models;

namespace Bunker.Services
{
    /// <summary>
    /// Сервіс для завантаження та кешування ігрових даних з JSON файлів
    /// </summary>
    public class GameDataService
    {
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<GameDataService> _logger;
        
        // Кешовані дані
        private List<HobbyData>? _hobbies;
        private List<ProfessionData>? _professions;
        private List<MentalConditionData>? _mentalConditions;
        private List<PhysicalConditionData>? _physicalConditions;
        private List<ItemData>? _items;
        private List<CharacterTraitData>? _characterTraits;
        private List<PhobiaData>? _phobias;
        private List<FactData>? _facts;
        private List<Apocalypse>? _apocalypses;
        private List<BunkerInfo>? _bunkers;
        private List<ThreatData>? _threats;
        private List<SpecialCardData>? _specialCards;
        private List<PropertyDefinition>? _properties;
        private Dictionary<string, PropertyConditionProfile>? _propertyConditionProfiles;

        private static readonly JsonSerializerOptions _jsonOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };

        public GameDataService(IWebHostEnvironment env, ILogger<GameDataService> logger)
        {
            _env = env;
            _logger = logger;
            LoadAllData();
        }

        /// <summary>
        /// Завантажити всі дані при запуску
        /// </summary>
        private void LoadAllData()
        {
            var dataPath = Path.Combine(_env.WebRootPath, "data");
            
            _hobbies = LoadJsonArray<HobbyData>(Path.Combine(dataPath, "hobbies.json"), "hobbies");
            _professions = LoadJsonArray<ProfessionData>(Path.Combine(dataPath, "professions.json"), "professions");
            _mentalConditions = LoadMentalConditions(dataPath);
            _physicalConditions = LoadPhysicalConditions(dataPath);
            _items = LoadJsonArray<ItemData>(Path.Combine(dataPath, "items.json"), "items");
            _characterTraits = LoadJsonArray<CharacterTraitData>(Path.Combine(dataPath, "character_traits.json"), "character_traits");
            _phobias = LoadJsonArray<PhobiaData>(Path.Combine(dataPath, "phobias.json"), "phobias");
            _facts = LoadJsonArray<FactData>(Path.Combine(dataPath, "facts.json"), "facts");
            _apocalypses = LoadJsonArray<Apocalypse>(Path.Combine(dataPath, "apocalypses.json"), "apocalypses");
            _bunkers = LoadJsonArray<BunkerInfo>(Path.Combine(dataPath, "bunkers.json"), "bunkers");
            _threats = LoadJsonArray<ThreatData>(Path.Combine(dataPath, "threats.json"), "threats");
            _specialCards = LoadJsonArray<SpecialCardData>(Path.Combine(dataPath, "special_cards.json"), "special_cards");
            var propertyData = LoadPropertyData(Path.Combine(dataPath, "property.json"));
            _propertyConditionProfiles = ValidatePropertyConditionProfiles(propertyData.ConditionProfiles);
            _properties = ValidatePropertyDefinitions(propertyData.Properties, _propertyConditionProfiles);

            _logger.LogInformation($"Завантажено: {_hobbies.Count} хобі, {_professions.Count} професій, " +
                                   $"{_mentalConditions.Count} ментальних станів, {_physicalConditions.Count} фізичних станів, " +
                                   $"{_items.Count} предметів, {_characterTraits.Count} рис характеру, " +
                                   $"{_phobias.Count} фобій, {_facts.Count} фактів, " +
                                   $"{_apocalypses.Count} апокаліпсисів, {_bunkers.Count} бункерів, " +
                                   $"{_threats.Count} загроз, {_specialCards.Count} спеціальних карт, " +
                                   $"{_properties.Count} варіантів майна");

            ValidateHealthConditions(_physicalConditions, "physical");
            ValidateHealthConditions(_mentalConditions, "mental");
        }

        private Dictionary<string, PropertyConditionProfile> ValidatePropertyConditionProfiles(
            IReadOnlyDictionary<string, PropertyConditionProfile> profiles)
        {
            var valid = new Dictionary<string, PropertyConditionProfile>(StringComparer.OrdinalIgnoreCase);
            foreach (var entry in profiles)
            {
                if (string.IsNullOrWhiteSpace(entry.Key) || entry.Value == null)
                {
                    _logger.LogError("property.json містить condition profile з порожнім ім'ям або значенням");
                    continue;
                }

                var configurationValid = true;
                foreach (var weight in entry.Value.Weights ?? [])
                {
                    if (!int.TryParse(
                            weight.Key,
                            System.Globalization.NumberStyles.Integer,
                            System.Globalization.CultureInfo.InvariantCulture,
                            out _))
                    {
                        _logger.LogError(
                            "Condition profile {ProfileName} містить нечисловий weight level {Level}",
                            entry.Key,
                            weight.Key);
                        configurationValid = false;
                    }
                    if (weight.Value < 0)
                    {
                        _logger.LogError(
                            "Condition profile {ProfileName} містить від'ємну вагу для level {Level}",
                            entry.Key,
                            weight.Key);
                        configurationValid = false;
                    }
                }

                foreach (var value in entry.Value.Values ?? [])
                {
                    if (!int.TryParse(
                            value.Key,
                            System.Globalization.NumberStyles.Integer,
                            System.Globalization.CultureInfo.InvariantCulture,
                            out _))
                    {
                        _logger.LogError(
                            "Condition profile {ProfileName} містить нечисловий value level {Level}",
                            entry.Key,
                            value.Key);
                        configurationValid = false;
                    }
                }

                if (configurationValid)
                {
                    valid[entry.Key.Trim()] = entry.Value;
                }
            }

            return valid;
        }

        private List<PropertyDefinition> ValidatePropertyDefinitions(
            IReadOnlyList<PropertyDefinition> definitions,
            IReadOnlyDictionary<string, PropertyConditionProfile> conditionProfiles)
        {
            if (definitions.Count == 0)
            {
                _logger.LogError("property.json не містить жодного коректного запису property");
                return new();
            }

            var valid = new List<PropertyDefinition>(definitions.Count);
            var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var definition in definitions)
            {
                if (string.IsNullOrWhiteSpace(definition.Id))
                {
                    _logger.LogError("property.json містить запис із порожнім id");
                    continue;
                }

                definition.Id = definition.Id.Trim();
                if (!ids.Add(definition.Id))
                {
                    _logger.LogError("property.json містить duplicate id {PropertyId}", definition.Id);
                    continue;
                }

                var configurationValid = true;
                foreach (var field in definition.RandomProperties ?? [])
                {
                    if (string.IsNullOrWhiteSpace(field.Key))
                    {
                        _logger.LogError("Property {PropertyId} містить randomProperties із порожнім key", definition.Id);
                        configurationValid = false;
                        continue;
                    }

                    if (!string.Equals(field.Type, "integer", StringComparison.OrdinalIgnoreCase))
                    {
                        _logger.LogError(
                            "Property {PropertyId} field {PropertyKey} має непідтримуваний type {PropertyType}",
                            definition.Id,
                            field.Key,
                            field.Type);
                        configurationValid = false;
                        continue;
                    }

                    if (field.Min > field.Max)
                    {
                        _logger.LogError(
                            "Property {PropertyId} field {PropertyKey} має min {Min} більше за max {Max}",
                            definition.Id,
                            field.Key,
                            field.Min,
                            field.Max);
                        configurationValid = false;
                    }
                }

                var conditionFields = (definition.RandomProperties ?? [])
                    .Where(field => string.Equals(
                        field.Key,
                        "conditionLevel",
                        StringComparison.OrdinalIgnoreCase))
                    .ToList();
                var templateUsesCondition = (definition.DisplayTemplate ?? [])
                    .Values.Any(template => template?.Contains(
                        "{condition}",
                        StringComparison.Ordinal) == true);
                var duplicateDisplayFields = (definition.DisplayFields ?? [])
                    .Where(field => !string.IsNullOrWhiteSpace(field.Key))
                    .GroupBy(field => field.Key, StringComparer.OrdinalIgnoreCase)
                    .FirstOrDefault(group => group.Count() > 1);
                if (duplicateDisplayFields != null)
                {
                    _logger.LogError(
                        "Property {PropertyId} містить duplicate display field {FieldKey}",
                        definition.Id,
                        duplicateDisplayFields.Key);
                    configurationValid = false;
                }
                if (string.IsNullOrWhiteSpace(definition.ConditionProfile) ||
                    !conditionProfiles.TryGetValue(definition.ConditionProfile, out var conditionProfile))
                {
                    _logger.LogError(
                        "Property {PropertyId} посилається на відсутній conditionProfile {ProfileName}",
                        definition.Id,
                        definition.ConditionProfile);
                    configurationValid = false;
                }
                else if (conditionFields.Count != 1)
                {
                    _logger.LogError(
                        "Property {PropertyId} повинно містити рівно одне поле conditionLevel",
                        definition.Id);
                    configurationValid = false;
                }
                else
                {
                    var conditionField = conditionFields[0];
                    for (var level = conditionField.Min; level <= conditionField.Max; level++)
                    {
                        if (!TryGetProfileLevel(conditionProfile.Values, level, out var localized) ||
                            localized.Count == 0)
                        {
                            _logger.LogError(
                                "Condition profile {ProfileName} не містить value для level {Level}, потрібного Property {PropertyId}",
                                definition.ConditionProfile,
                                level,
                                definition.Id);
                            configurationValid = false;
                        }
                    }

                    if (conditionField.WeightsFromProfile)
                    {
                        long totalWeight = 0;
                        for (var level = conditionField.Min; level <= conditionField.Max; level++)
                        {
                            if (TryGetProfileLevel(conditionProfile.Weights, level, out var weight))
                            {
                                totalWeight += weight;
                            }
                        }

                        if (totalWeight <= 0)
                        {
                            _logger.LogError(
                                "Condition profile {ProfileName} має нульову суму доступних weights для Property {PropertyId}",
                                definition.ConditionProfile,
                                definition.Id);
                            configurationValid = false;
                        }
                    }
                }

                if (templateUsesCondition && string.IsNullOrWhiteSpace(definition.ConditionProfile))
                {
                    _logger.LogError(
                        "Property {PropertyId} використовує placeholder {ConditionPlaceholder} без conditionProfile",
                        definition.Id,
                        "{condition}");
                    configurationValid = false;
                }

                if (configurationValid)
                {
                    valid.Add(definition);
                }
            }

            return valid;
        }

        public string FormatProperty(GeneratedProperty? property, string? language)
        {
            if (property == null)
            {
                return PropertyUnavailable(language);
            }

            var definition = Properties.FirstOrDefault(item =>
                string.Equals(item.Id, property.DefinitionId, StringComparison.OrdinalIgnoreCase));
            if (definition == null)
            {
                var cached = property.GetDisplayText(language);
                return string.IsNullOrWhiteSpace(cached) ? PropertyUnavailable(language) : cached;
            }

            var normalizedLanguage = NormalizePropertyLanguage(language);
            var item = TryGetLocalized(definition.I18n?.Item, normalizedLanguage) ??
                       TryGetLocalized(definition.I18n?.Item, "uk") ??
                       definition.Item;
            var template = TryGetLocalized(definition.DisplayTemplate, normalizedLanguage) ??
                           TryGetLocalized(definition.DisplayTemplate, "uk") ??
                           "{item}";
            var display = template.Replace("{item}", item ?? "", StringComparison.Ordinal);
            foreach (var generatedValue in property.GeneratedValues ?? [])
            {
                display = display.Replace(
                    $"{{{generatedValue.Key}}}",
                    FormatPropertyInteger(generatedValue.Value, normalizedLanguage),
                    StringComparison.Ordinal);
            }

            if (display.Contains("{condition}", StringComparison.Ordinal))
            {
                display = display.Replace(
                    "{condition}",
                    ResolvePropertyCondition(property, definition, normalizedLanguage),
                    StringComparison.Ordinal);
            }

            return display;
        }

        public Dictionary<string, string> FormatPropertyAllLanguages(GeneratedProperty property) =>
            new(StringComparer.OrdinalIgnoreCase)
            {
                ["uk"] = FormatProperty(property, "uk"),
                ["en"] = FormatProperty(property, "en"),
                ["ru"] = FormatProperty(property, "ru")
            };

        public PropertyPresentationDto BuildPropertyPresentation(
            GeneratedProperty? property,
            string? language)
        {
            if (property == null)
            {
                return new(PropertyUnavailable(language), []);
            }

            var definition = Properties.FirstOrDefault(item =>
                string.Equals(item.Id, property.DefinitionId, StringComparison.OrdinalIgnoreCase));
            if (definition == null || definition.DisplayFields == null || definition.DisplayFields.Count == 0)
            {
                return new(FormatProperty(property, language), []);
            }

            var normalizedLanguage = NormalizePropertyLanguage(language);
            var title = TryGetLocalized(definition.I18n?.Item, normalizedLanguage) ??
                        TryGetLocalized(definition.I18n?.Item, "uk") ??
                        definition.Item;
            var details = new List<PropertyPresentationDetailDto>(definition.DisplayFields.Count);
            foreach (var field in definition.DisplayFields.Take(4))
            {
                if (string.IsNullOrWhiteSpace(field.Key))
                {
                    continue;
                }

                var label = TryGetLocalized(field.Label, normalizedLanguage) ??
                            TryGetLocalized(field.Label, "uk") ??
                            field.Key;
                string value;
                if (string.Equals(field.Source, "conditionProfile", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(field.Key, "condition", StringComparison.OrdinalIgnoreCase))
                {
                    value = ResolvePropertyCondition(property, definition, normalizedLanguage);
                }
                else if (property.GeneratedValues.TryGetValue(field.Key, out var generatedValue))
                {
                    var formatted = FormatPropertyInteger(generatedValue, normalizedLanguage);
                    var valueTemplate = TryGetLocalized(field.ValueTemplate, normalizedLanguage) ??
                                        TryGetLocalized(field.ValueTemplate, "uk") ??
                                        $"{{{field.Key}}}";
                    value = valueTemplate.Replace(
                        $"{{{field.Key}}}",
                        formatted,
                        StringComparison.Ordinal);
                }
                else
                {
                    value = "—";
                }

                details.Add(new(field.Key, label, value));
            }

            return new(title ?? PropertyUnavailable(normalizedLanguage), details);
        }

        public Dictionary<string, PropertyPresentationDto> BuildPropertyPresentationsAllLanguages(
            GeneratedProperty property) =>
            new(StringComparer.OrdinalIgnoreCase)
            {
                ["uk"] = BuildPropertyPresentation(property, "uk"),
                ["en"] = BuildPropertyPresentation(property, "en"),
                ["ru"] = BuildPropertyPresentation(property, "ru")
            };

        public bool TryCreateProperty(
            string? definitionId,
            IReadOnlyDictionary<string, int>? generatedValues,
            out GeneratedProperty property,
            out string errorCode)
        {
            property = null!;
            errorCode = "property_values_invalid";
            var definition = Properties.FirstOrDefault(item =>
                string.Equals(item.Id, definitionId, StringComparison.OrdinalIgnoreCase));
            if (definition == null)
            {
                errorCode = "property_definition_not_found";
                return false;
            }

            generatedValues ??= new Dictionary<string, int>();
            var requiredFields = definition.RandomProperties ?? [];
            var allowedKeys = requiredFields
                .Select(field => field.Key)
                .ToHashSet(StringComparer.Ordinal);
            if (generatedValues.Count != requiredFields.Count ||
                generatedValues.Keys.Any(key => !allowedKeys.Contains(key)))
            {
                return false;
            }

            foreach (var field in requiredFields)
            {
                if (!generatedValues.TryGetValue(field.Key, out var value) ||
                    value < field.Min ||
                    value > field.Max)
                {
                    return false;
                }

                if (string.Equals(field.Key, "conditionLevel", StringComparison.Ordinal) &&
                    (!PropertyConditionProfiles.TryGetValue(definition.ConditionProfile, out var profile) ||
                     !TryGetProfileLevel(profile.Values, value, out _)))
                {
                    errorCode = "property_condition_invalid";
                    return false;
                }
            }

            property = new GeneratedProperty
            {
                DefinitionId = definition.Id,
                GeneratedValues = new Dictionary<string, int>(generatedValues, StringComparer.Ordinal),
                Category = definition.Category,
                SizeClass = definition.SizeClass,
                ResourceTags = definition.ResourceTags?.ToList() ?? [],
                ProtectionTags = definition.ProtectionTags?.ToList() ?? [],
                ThreatUsage = definition.ThreatUsage == null
                    ? null
                    : new Dictionary<string, JsonElement>(
                        definition.ThreatUsage,
                        StringComparer.OrdinalIgnoreCase)
            };
            property.LocalizedDisplay = FormatPropertyAllLanguages(property);
            property.LocalizedPresentation = BuildPropertyPresentationsAllLanguages(property);
            errorCode = "";
            return true;
        }

        private string ResolvePropertyCondition(
            GeneratedProperty property,
            PropertyDefinition definition,
            string language)
        {
            if (!TryResolvePropertyConditionLevel(property.GeneratedValues, out var level) ||
                string.IsNullOrWhiteSpace(definition.ConditionProfile) ||
                !PropertyConditionProfiles.TryGetValue(definition.ConditionProfile, out var profile) ||
                !TryGetProfileLevel(profile.Values, level, out var localized))
            {
                return UnknownPropertyCondition(language);
            }

            return TryGetLocalized(localized, language) ??
                   TryGetLocalized(localized, "uk") ??
                   UnknownPropertyCondition(language);
        }

        public static bool TryResolvePropertyConditionLevel(
            IReadOnlyDictionary<string, int>? generatedValues,
            out int level)
        {
            level = 0;
            if (generatedValues == null)
            {
                return false;
            }

            if (generatedValues.TryGetValue("conditionLevel", out level))
            {
                return level is >= 1 and <= 6;
            }

            if (!generatedValues.TryGetValue("conditionPercent", out var percent) ||
                percent is < 0 or > 100)
            {
                return false;
            }

            level = percent switch
            {
                <= 19 => 1,
                <= 39 => 2,
                <= 59 => 3,
                <= 74 => 4,
                <= 89 => 5,
                _ => 6
            };
            return true;
        }

        private static bool TryGetProfileLevel<T>(
            IReadOnlyDictionary<string, T>? source,
            int level,
            out T value)
        {
            if (source != null)
            {
                foreach (var entry in source)
                {
                    if (int.TryParse(
                            entry.Key,
                            System.Globalization.NumberStyles.Integer,
                            System.Globalization.CultureInfo.InvariantCulture,
                            out var parsed) &&
                        parsed == level)
                    {
                        value = entry.Value;
                        return true;
                    }
                }
            }

            value = default!;
            return false;
        }

        private static string? TryGetLocalized(
            IReadOnlyDictionary<string, string>? source,
            string language) =>
            source != null &&
            source.TryGetValue(language, out var value) &&
            !string.IsNullOrWhiteSpace(value)
                ? value
                : null;

        private static string NormalizePropertyLanguage(string? language)
        {
            var normalized = string.IsNullOrWhiteSpace(language)
                ? "uk"
                : language.Trim().ToLowerInvariant();
            return normalized is "uk" or "en" or "ru" ? normalized : "uk";
        }

        private static string FormatPropertyInteger(int value, string language)
        {
            var formatted = value.ToString(
                "N0",
                System.Globalization.CultureInfo.InvariantCulture);
            return language == "en" ? formatted : formatted.Replace(",", " ", StringComparison.Ordinal);
        }

        private static string UnknownPropertyCondition(string? language) =>
            NormalizePropertyLanguage(language) switch
            {
                "en" => "Condition unknown",
                "ru" => "Состояние неизвестно",
                _ => "Стан невідомий"
            };

        private static string PropertyUnavailable(string? language) =>
            NormalizePropertyLanguage(language) switch
            {
                "en" => "Property unavailable",
                "ru" => "Имущество отсутствует",
                _ => "Майно відсутнє"
            };

        private void ValidateHealthConditions<T>(IReadOnlyList<T> conditions, string kind)
        {
            int severityTrue = 0;
            int severityFalse = 0;

            for (var i = 0; i < conditions.Count; i++)
            {
                var condition = conditions[i];
                string id = GetStringProperty(condition, "Id") ?? $"{kind}_{i + 1}";
                var hasSeverity = GetNullableBoolProperty(condition, "HasSeverity") ?? false;
                var localization = GetLocalization(condition);

                if (hasSeverity) severityTrue++;
                else severityFalse++;

                var uk = localization != null && localization.TryGetValue("uk", out var ukValue)
                    ? ukValue
                    : null;

                if (string.IsNullOrWhiteSpace(uk?.Name))
                {
                    _logger.LogWarning("{Kind} condition {ConditionId} не має localization.uk.name", kind, id);
                }

                if (hasSeverity && (uk?.Descriptions == null || uk.Descriptions.Count == 0))
                {
                    _logger.LogWarning("{Kind} condition {ConditionId} має hasSeverity=true, але не має descriptions", kind, id);
                }

                if (!hasSeverity && string.IsNullOrWhiteSpace(uk?.Description))
                {
                    _logger.LogWarning("{Kind} condition {ConditionId} має hasSeverity=false, але не має description", kind, id);
                }
            }

            _logger.LogInformation(
                "{Kind} conditions loaded: {Total}; hasSeverity=true: {WithSeverity}; hasSeverity=false: {WithoutSeverity}",
                kind,
                conditions.Count,
                severityTrue,
                severityFalse
            );
        }

        private static string? GetStringProperty<T>(T item, string propertyName)
        {
            return item?.GetType().GetProperty(propertyName)?.GetValue(item)?.ToString();
        }

        private static bool? GetNullableBoolProperty<T>(T item, string propertyName)
        {
            var value = item?.GetType().GetProperty(propertyName)?.GetValue(item);
            return value is bool result ? result : null;
        }

        private static Dictionary<string, ConditionLocalization>? GetLocalization<T>(T item)
        {
            return item?.GetType().GetProperty("Localization")?.GetValue(item) as Dictionary<string, ConditionLocalization>;
        }

        private List<MentalConditionData> LoadMentalConditions(string dataPath)
        {
            var legacyPath = Path.Combine(dataPath, "mental_conditions.json");
            if (File.Exists(legacyPath))
            {
                var legacyConditions = LoadJsonArray<MentalConditionData>(legacyPath, "mental_conditions");
                if (legacyConditions.Count > 0)
                    return legacyConditions;
            }

            var folderPath = Path.Combine(dataPath, "Mental_conditions");
            if (!Directory.Exists(folderPath))
            {
                _logger.LogWarning($"Файл не знайдено: {legacyPath}");
                return new();
            }

            var files = Directory
                .GetFiles(folderPath, "mental_conditions*.json")
                .OrderBy(GetMentalConditionFilePriority)
                .ThenBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (files.Count == 0)
            {
                _logger.LogWarning($"Файли mental_conditions*.json не знайдено: {folderPath}");
                return new();
            }

            var merged = new Dictionary<string, MentalConditionData>(StringComparer.OrdinalIgnoreCase);
            var order = new List<string>();

            foreach (var file in files)
            {
                var conditions = LoadJsonArray<MentalConditionData>(file, "mental_conditions");
                foreach (var condition in conditions)
                {
                    var id = string.IsNullOrWhiteSpace(condition.Id)
                        ? $"mental_{order.Count + 1}"
                        : condition.Id.Trim();

                    condition.Id = id;

                    if (!merged.TryGetValue(id, out var existing))
                    {
                        merged[id] = condition;
                        order.Add(id);
                        continue;
                    }

                    MergeMentalCondition(existing, condition);
                }
            }

            return order
                .Where(merged.ContainsKey)
                .Select(id => merged[id])
                .ToList();
        }

        private static int GetMentalConditionFilePriority(string path)
        {
            var fileName = Path.GetFileName(path).ToLowerInvariant();
            if (fileName.Contains(".uk")) return 0;
            if (fileName.Contains(".ru")) return 1;
            if (fileName.Contains(".en")) return 2;
            return 3;
        }

        private static void MergeMentalCondition(MentalConditionData target, MentalConditionData source)
        {
            if (string.IsNullOrWhiteSpace(target.Name)) target.Name = source.Name;
            if (string.IsNullOrWhiteSpace(target.Category)) target.Category = source.Category;
            if (target.HasSeverity == null) target.HasSeverity = source.HasSeverity;
            if (string.IsNullOrWhiteSpace(target.Tone)) target.Tone = source.Tone;
            if (string.IsNullOrWhiteSpace(target.Rarity)) target.Rarity = source.Rarity;
            if (target.Severity == 0) target.Severity = source.Severity;
            if (string.IsNullOrWhiteSpace(target.Visibility)) target.Visibility = source.Visibility;
            if (string.IsNullOrWhiteSpace(target.Description)) target.Description = source.Description;
            if (string.IsNullOrWhiteSpace(target.GameEffect)) target.GameEffect = source.GameEffect;
            if (target.SurvivalImpact == 0) target.SurvivalImpact = source.SurvivalImpact;
            if (target.SocialImpact == 0) target.SocialImpact = source.SocialImpact;
            if (target.TreatmentDifficulty == 0) target.TreatmentDifficulty = source.TreatmentDifficulty;
            if (!target.IsFictional) target.IsFictional = source.IsFictional;
            if ((target.Tags == null || target.Tags.Count == 0) && source.Tags != null) target.Tags = source.Tags;
            if (target.I18n == null && source.I18n != null) target.I18n = source.I18n;

            if (source.Localization == null || source.Localization.Count == 0)
                return;

            target.Localization ??= new Dictionary<string, ConditionLocalization>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in source.Localization)
            {
                var language = item.Key;
                var localization = item.Value;

                if (string.IsNullOrWhiteSpace(language) || localization == null)
                    continue;

                target.Localization[language] = localization;
            }
        }

        private List<PhysicalConditionData> LoadPhysicalConditions(string dataPath)
        {
            var legacyPath = Path.Combine(dataPath, "physical_conditions.json");
            if (File.Exists(legacyPath))
            {
                var legacyConditions = LoadJsonArray<PhysicalConditionData>(legacyPath, "physical_conditions");
                if (legacyConditions.Count > 0)
                    return legacyConditions;
            }

            var folderPath = Path.Combine(dataPath, "Physical_conditions");
            if (!Directory.Exists(folderPath))
            {
                _logger.LogWarning($"Файл не знайдено: {legacyPath}");
                return new();
            }

            var files = Directory
                .GetFiles(folderPath, "physical_conditions*.json")
                .OrderBy(GetPhysicalConditionFilePriority)
                .ThenBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (files.Count == 0)
            {
                _logger.LogWarning($"Файли physical_conditions*.json не знайдено: {folderPath}");
                return new();
            }

            var merged = new Dictionary<string, PhysicalConditionData>(StringComparer.OrdinalIgnoreCase);
            var order = new List<string>();

            foreach (var file in files)
            {
                var conditions = LoadJsonArray<PhysicalConditionData>(file, "physical_conditions");
                foreach (var condition in conditions)
                {
                    var id = string.IsNullOrWhiteSpace(condition.Id)
                        ? $"physical_{order.Count + 1}"
                        : condition.Id.Trim();

                    condition.Id = id;

                    if (!merged.TryGetValue(id, out var existing))
                    {
                        merged[id] = condition;
                        order.Add(id);
                        continue;
                    }

                    MergePhysicalCondition(existing, condition);
                }
            }

            return order
                .Where(merged.ContainsKey)
                .Select(id => merged[id])
                .ToList();
        }

        private static int GetPhysicalConditionFilePriority(string path)
        {
            var fileName = Path.GetFileName(path).ToLowerInvariant();
            if (fileName.Contains(".uk")) return 0;
            if (fileName.Contains(".en")) return 1;
            if (fileName.Contains(".ru")) return 2;
            return 3;
        }

        private static void MergePhysicalCondition(PhysicalConditionData target, PhysicalConditionData source)
        {
            if (string.IsNullOrWhiteSpace(target.Name)) target.Name = source.Name;
            if (string.IsNullOrWhiteSpace(target.Category)) target.Category = source.Category;
            if (target.HasSeverity == null) target.HasSeverity = source.HasSeverity;
            if (string.IsNullOrWhiteSpace(target.Tone)) target.Tone = source.Tone;
            if (string.IsNullOrWhiteSpace(target.Rarity)) target.Rarity = source.Rarity;
            if (target.Severity == 0) target.Severity = source.Severity;
            if (string.IsNullOrWhiteSpace(target.Visibility)) target.Visibility = source.Visibility;
            if (string.IsNullOrWhiteSpace(target.Description)) target.Description = source.Description;
            if (string.IsNullOrWhiteSpace(target.GameEffect)) target.GameEffect = source.GameEffect;
            if (target.SurvivalImpact == 0) target.SurvivalImpact = source.SurvivalImpact;
            if (target.SocialImpact == 0) target.SocialImpact = source.SocialImpact;
            if (target.MovementImpact == 0) target.MovementImpact = source.MovementImpact;
            if (target.PainLevel == 0) target.PainLevel = source.PainLevel;
            if (target.TreatmentDifficulty == 0) target.TreatmentDifficulty = source.TreatmentDifficulty;
            if (!target.IsFictional) target.IsFictional = source.IsFictional;
            if ((target.Tags == null || target.Tags.Count == 0) && source.Tags != null) target.Tags = source.Tags;
            if (target.I18n == null && source.I18n != null) target.I18n = source.I18n;

            if (source.Localization == null || source.Localization.Count == 0)
                return;

            target.Localization ??= new Dictionary<string, ConditionLocalization>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in source.Localization)
            {
                var language = item.Key;
                var localization = item.Value;

                if (string.IsNullOrWhiteSpace(language) || localization == null)
                    continue;

                target.Localization[language] = localization;
            }
        }

        private PropertyDataRoot LoadPropertyData(string path)
        {
            try
            {
                if (!File.Exists(path))
                {
                    _logger.LogWarning("Файл не знайдено: {PropertyPath}", path);
                    return new();
                }

                var data = JsonSerializer.Deserialize<PropertyDataRoot>(
                    File.ReadAllText(path),
                    _jsonOptions);
                if (data == null)
                {
                    _logger.LogError("property.json не містить коректного root object");
                    return new();
                }

                data.Properties ??= new();
                data.ConditionProfiles ??=
                    new Dictionary<string, PropertyConditionProfile>(StringComparer.OrdinalIgnoreCase);
                return data;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Помилка завантаження property.json з {PropertyPath}", path);
                return new();
            }
        }

        private List<T> LoadJsonArray<T>(string path, params string[] possibleKeys)
        {
            try
            {
                if (!File.Exists(path))
                {
                    _logger.LogWarning($"Файл не знайдено: {path}");
                    return new();
                }

                var json = File.ReadAllText(path);
                using var document = JsonDocument.Parse(json);
                var root = document.RootElement;

                if (root.ValueKind == JsonValueKind.Array)
                {
                    return root.Deserialize<List<T>>(_jsonOptions) ?? new();
                }

                if (root.ValueKind == JsonValueKind.Object)
                {
                    foreach (var key in possibleKeys)
                    {
                        if (root.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Array)
                        {
                            return value.Deserialize<List<T>>(_jsonOptions) ?? new();
                        }
                    }
                }

                _logger.LogWarning($"JSON не містить очікуваного масиву: {path}");
                return new();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Помилка завантаження JSON з {path}");
                return new();
            }
        }

        // Публічні властивості для доступу до даних
        public IReadOnlyList<HobbyData> Hobbies => _hobbies ?? new();
        public IReadOnlyList<ProfessionData> Professions => _professions ?? new();
        public IReadOnlyList<MentalConditionData> MentalConditions => _mentalConditions ?? new();
        public IReadOnlyList<PhysicalConditionData> PhysicalConditions => _physicalConditions ?? new();
        public IReadOnlyList<ItemData> Items => _items ?? new();
        public IReadOnlyList<CharacterTraitData> CharacterTraits => _characterTraits ?? new();
        public IReadOnlyList<PhobiaData> Phobias => _phobias ?? new();
        public IReadOnlyList<FactData> Facts => _facts ?? new();
        public IReadOnlyList<Apocalypse> Apocalypses => _apocalypses ?? new();
        public IReadOnlyList<BunkerInfo> Bunkers => _bunkers ?? new();
        public IReadOnlyList<ThreatData> Threats => _threats ?? new();
        public IReadOnlyList<SpecialCardData> SpecialCards => _specialCards ?? new();
        public IReadOnlyList<PropertyDefinition> Properties => _properties ?? new();
        public IReadOnlyDictionary<string, PropertyConditionProfile> PropertyConditionProfiles =>
            _propertyConditionProfiles ??
            new Dictionary<string, PropertyConditionProfile>(StringComparer.OrdinalIgnoreCase);
    }
}
