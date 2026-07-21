using System.Text.Json;
using System.Text.RegularExpressions;
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
        private IReadOnlyList<Apocalypse> _apocalypses = Array.Empty<Apocalypse>();
        private IReadOnlyList<ApocalypseCategoryDefinition> _apocalypseCategories = Array.Empty<ApocalypseCategoryDefinition>();
        private IReadOnlyList<ApocalypseVisualThemeDefinition> _apocalypseVisualThemes = Array.Empty<ApocalypseVisualThemeDefinition>();
        private ApocalypseInteractiveSchemaDefinition? _apocalypseInteractiveSchema;
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
            LoadApocalypseData(Path.Combine(dataPath, "apocalypses.json"));
            _bunkers = ValidateBunkers(
                LoadJsonArray<BunkerInfo>(Path.Combine(dataPath, "bunkers.json"), "bunkers"));
            _threats = LoadJsonArray<ThreatData>(Path.Combine(dataPath, "threats.json"), "threats");
            _specialCards = LoadJsonArray<SpecialCardData>(Path.Combine(dataPath, "special_cards.json"), "special_cards");
            var propertyData = LoadPropertyData(Path.Combine(dataPath, "property.json"));
            _propertyConditionProfiles = ValidatePropertyConditionProfiles(propertyData.ConditionProfiles);
            _properties = ValidatePropertyDefinitions(propertyData.Properties, _propertyConditionProfiles);

            _logger.LogInformation($"Завантажено: {_hobbies.Count} хобі, {_professions.Count} професій, " +
                                   $"{_mentalConditions.Count} ментальних станів, {_physicalConditions.Count} фізичних станів, " +
                                   $"{_items.Count} предметів, {_characterTraits.Count} рис характеру, " +
                                   $"{_phobias.Count} фобій, {_facts.Count} фактів, " +
                                   $"{_bunkers.Count} бункерів, " +
                                   $"{_threats.Count} загроз, {_specialCards.Count} спеціальних карт, " +
                                   $"{_properties.Count} варіантів майна");

            ValidateHealthConditions(_physicalConditions, "physical");
            ValidateHealthConditions(_mentalConditions, "mental");
        }

        private void LoadApocalypseData(string path)
        {
            if (!File.Exists(path))
                throw new InvalidDataException($"apocalypses.json was not found: {path}");

            ApocalypsesRoot? root;
            try
            {
                root = JsonSerializer.Deserialize<ApocalypsesRoot>(File.ReadAllText(path), _jsonOptions);
            }
            catch (JsonException ex)
            {
                throw new InvalidDataException($"apocalypses.json could not be deserialized: {ex.Message}", ex);
            }

            ValidateApocalypseData(root);

            _apocalypses = root!.Apocalypses.AsReadOnly();
            _apocalypseCategories = root.CategoryCatalog.AsReadOnly();
            _apocalypseVisualThemes = root.VisualThemeProfiles.AsReadOnly();
            _apocalypseInteractiveSchema = root.InteractiveEffectSchema;

            var interactiveCount = _apocalypses.Count(apocalypse => apocalypse.Gameplay?.Interactive == true);
            _logger.LogInformation(
                "Apocalypse data loaded: {Total} apocalypses; {Ordinary} ordinary; {Interactive} interactive; " +
                "{Categories} categories; {Themes} visual themes; interactive schema version {SchemaVersion}",
                _apocalypses.Count,
                _apocalypses.Count - interactiveCount,
                interactiveCount,
                _apocalypseCategories.Count,
                _apocalypseVisualThemes.Count,
                _apocalypseInteractiveSchema!.Version);
        }

        internal static void ValidateApocalypseData(ApocalypsesRoot? root)
        {
            if (root == null)
                throw new InvalidDataException("apocalypses.json validation failed: root is null");

            var errors = new List<string>();
            var apocalypses = root.Apocalypses ?? new();
            var categories = root.CategoryCatalog ?? new();
            var themes = root.VisualThemeProfiles ?? new();
            var schema = root.InteractiveEffectSchema;

            if (apocalypses.Count != 220) errors.Add($"expected 220 apocalypse records, found {apocalypses.Count}");
            if (categories.Count != 10) errors.Add($"expected 10 apocalypse categories, found {categories.Count}");
            if (themes.Count != 10) errors.Add($"expected 10 visual themes, found {themes.Count}");
            if (schema == null) errors.Add("interactive effect schema is required");
            else
            {
                if (schema.Version != 2) errors.Add($"interactive effect schema version must be 2, found {schema.Version}");
                if (!string.Equals(schema.RuntimeStatus, "definition_only", StringComparison.Ordinal))
                    errors.Add("interactive effect schema runtimeStatus must be 'definition_only'");
                if (schema.ActivationContract == null) errors.Add("interactive activation contract is required");
            }

            AddIdErrors(apocalypses, item => item.Id, "apocalypse", errors);
            AddIdErrors(categories, item => item.Id, "category", errors);
            AddIdErrors(themes, item => item.Id, "visual theme", errors);

            var categoryIds = categories.Where(item => !string.IsNullOrWhiteSpace(item.Id))
                .Select(item => item.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var themeById = themes.Where(item => !string.IsNullOrWhiteSpace(item.Id))
                .GroupBy(item => item.Id, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

            foreach (var category in categories)
            {
                var label = string.IsNullOrWhiteSpace(category.Id) ? "<empty>" : category.Id;
                if (string.IsNullOrWhiteSpace(category.VisualThemeId))
                    errors.Add($"category '{label}' has an empty visualThemeId");
                else if (!themeById.ContainsKey(category.VisualThemeId))
                    errors.Add($"category '{label}' references unknown visual theme '{category.VisualThemeId}'");
                if (!HasProductionLocalization(category.I18n))
                    errors.Add($"category '{label}' must contain localized name and description for uk/en/ru");
            }

            foreach (var theme in themes)
            {
                var label = string.IsNullOrWhiteSpace(theme.Id) ? "<empty>" : theme.Id;
                if (string.IsNullOrWhiteSpace(theme.CategoryId) || !categoryIds.Contains(theme.CategoryId))
                    errors.Add($"visual theme '{label}' references unknown category '{theme.CategoryId}'");
                if (string.IsNullOrWhiteSpace(theme.CssClass))
                    errors.Add($"visual theme '{label}' has an empty cssClass");
                else if (!Regex.IsMatch(theme.CssClass, "^[A-Za-z0-9_-]+$", RegexOptions.CultureInvariant))
                    errors.Add($"visual theme '{label}' has unsafe cssClass '{theme.CssClass}'");
                if (string.IsNullOrWhiteSpace(theme.BackgroundVariant)) errors.Add($"visual theme '{label}' has an empty backgroundVariant");
                if (string.IsNullOrWhiteSpace(theme.OverlayVariant)) errors.Add($"visual theme '{label}' has an empty overlayVariant");
                if (string.IsNullOrWhiteSpace(theme.FallbackThemeId))
                    errors.Add($"visual theme '{label}' has an empty fallbackThemeId");
                else if (!string.Equals(theme.FallbackThemeId, "default-dark", StringComparison.OrdinalIgnoreCase) &&
                         !themeById.ContainsKey(theme.FallbackThemeId))
                    errors.Add($"visual theme '{label}' references unknown fallback '{theme.FallbackThemeId}'");
            }

            var interactiveCount = 0;
            foreach (var apocalypse in apocalypses)
            {
                var label = string.IsNullOrWhiteSpace(apocalypse.Id) ? "<empty>" : apocalypse.Id;
                if (string.IsNullOrWhiteSpace(apocalypse.Name)) errors.Add($"apocalypse '{label}' has an empty name");
                if (string.IsNullOrWhiteSpace(apocalypse.CategoryId) || !categoryIds.Contains(apocalypse.CategoryId))
                    errors.Add($"apocalypse '{label}' references unknown category '{apocalypse.CategoryId}'");
                if (string.IsNullOrWhiteSpace(apocalypse.VisualThemeId) || !themeById.TryGetValue(apocalypse.VisualThemeId, out var theme))
                    errors.Add($"apocalypse '{label}' references unknown visual theme '{apocalypse.VisualThemeId}'");
                else if (!string.Equals(theme.CategoryId, apocalypse.CategoryId, StringComparison.OrdinalIgnoreCase) &&
                         string.IsNullOrWhiteSpace(theme.FallbackThemeId))
                    errors.Add($"apocalypse '{label}' uses a theme from another category without a fallback");

                if (apocalypse.Gameplay == null) continue;
                if (apocalypse.Gameplay.Interactive) interactiveCount++;
                ValidateGameplay(apocalypse, schema?.ActivationContract, errors);
            }

            if (interactiveCount != 20) errors.Add($"expected 20 interactive apocalypses, found {interactiveCount}");

            if (errors.Count > 0)
                throw new InvalidDataException($"apocalypses.json validation failed: {string.Join("; ", errors)}");
        }

        private static void ValidateGameplay(
            Apocalypse apocalypse,
            ApocalypseActivationContractDefinition? contract,
            List<string> errors)
        {
            var gameplay = apocalypse.Gameplay!;
            var label = string.IsNullOrWhiteSpace(apocalypse.Id) ? "<empty>" : apocalypse.Id;
            if (gameplay.SchemaVersion != 2) errors.Add($"apocalypse '{label}' gameplay schemaVersion must be 2");
            if (!string.Equals(gameplay.RuntimeStatus, "definition_only", StringComparison.Ordinal))
                errors.Add($"apocalypse '{label}' gameplay runtimeStatus must be 'definition_only'");
            if (string.IsNullOrWhiteSpace(gameplay.EffectProfileId)) errors.Add($"apocalypse '{label}' has an empty effectProfileId");
            if (gameplay.Activation == null) errors.Add($"apocalypse '{label}' gameplay activation is required");
            if (gameplay.Effects == null || gameplay.Effects.Count == 0) errors.Add($"apocalypse '{label}' gameplay effects are required");
            else if (gameplay.Effects.Any(effect => string.IsNullOrWhiteSpace(effect.Type)))
                errors.Add($"apocalypse '{label}' contains an effect with an empty type");

            if (gameplay.Activation == null || contract == null) return;
            var activation = gameplay.Activation;
            var supportedModes = contract.SupportedModes ?? Array.Empty<string>();
            var supportedTriggers = contract.SupportedTriggers ?? Array.Empty<string>();
            var contractFirstRounds = contract.AllowedFirstRounds ?? Array.Empty<int>();
            var contractIntervalRounds = contract.AllowedIntervalRounds ?? Array.Empty<int>();
            var allowedTriggers = activation.AllowedTriggers ?? Array.Empty<string>();
            var allowedFirstRounds = activation.AllowedFirstRounds ?? Array.Empty<int>();
            var allowedIntervalRounds = activation.AllowedIntervalRounds ?? Array.Empty<int>();
            if (!supportedModes.Contains(activation.Mode, StringComparer.OrdinalIgnoreCase))
                errors.Add($"apocalypse '{label}' has unsupported activation mode '{activation.Mode}'");
            if (!supportedTriggers.Contains(activation.Trigger, StringComparer.OrdinalIgnoreCase))
                errors.Add($"apocalypse '{label}' has unsupported activation trigger '{activation.Trigger}'");
            if (!contractFirstRounds.Contains(activation.FirstRound))
                errors.Add($"apocalypse '{label}' has disallowed firstRound {activation.FirstRound}");
            if (string.Equals(activation.Mode, "recurring", StringComparison.OrdinalIgnoreCase) && !activation.IntervalRounds.HasValue)
                errors.Add($"apocalypse '{label}' recurring activation requires intervalRounds");
            if (activation.IntervalRounds.HasValue && !contractIntervalRounds.Contains(activation.IntervalRounds.Value))
                errors.Add($"apocalypse '{label}' has disallowed intervalRounds {activation.IntervalRounds.Value}");
            if (activation.MaxActivations is < 1 or > 20)
                errors.Add($"apocalypse '{label}' maxActivations must be in range 1..20");
            if (allowedTriggers.Any(trigger => !supportedTriggers.Contains(trigger, StringComparer.OrdinalIgnoreCase)))
                errors.Add($"apocalypse '{label}' allowedTriggers contains an unsupported value");
            if (allowedFirstRounds.Any(round => !contractFirstRounds.Contains(round)))
                errors.Add($"apocalypse '{label}' allowedFirstRounds exceeds the root contract");
            if (allowedIntervalRounds.Any(round => !contractIntervalRounds.Contains(round)))
                errors.Add($"apocalypse '{label}' allowedIntervalRounds exceeds the root contract");
        }

        private static void AddIdErrors<T>(IEnumerable<T> items, Func<T, string> getId, string label, List<string> errors)
        {
            if (items.Any(item => string.IsNullOrWhiteSpace(getId(item)))) errors.Add($"one or more {label} IDs are empty");
            var duplicates = items.Where(item => !string.IsNullOrWhiteSpace(getId(item)))
                .GroupBy(getId, StringComparer.OrdinalIgnoreCase).Where(group => group.Count() > 1).Select(group => group.Key);
            var duplicateList = duplicates.ToList();
            if (duplicateList.Count > 0) errors.Add($"duplicate {label} IDs: {string.Join(", ", duplicateList)}");
        }

        private static bool HasProductionLocalization(Dictionary<string, JsonElement>? i18n)
        {
            if (i18n == null) return false;
            foreach (var field in new[] { "name", "description" })
            {
                if (!i18n.TryGetValue(field, out var localized) || localized.ValueKind != JsonValueKind.Object) return false;
                foreach (var language in new[] { "uk", "en", "ru" })
                {
                    if (!localized.TryGetProperty(language, out var text) || text.ValueKind != JsonValueKind.String ||
                        string.IsNullOrWhiteSpace(text.GetString())) return false;
                }
            }
            return true;
        }

        private List<BunkerInfo> ValidateBunkers(List<BunkerInfo> bunkers)
        {
            var errors = new List<string>();
            if (bunkers.Count != 205)
                errors.Add($"expected 205 bunker records, found {bunkers.Count}");
            var duplicateIds = bunkers
                .Where(bunker => !string.IsNullOrWhiteSpace(bunker.Id))
                .GroupBy(bunker => bunker.Id, StringComparer.OrdinalIgnoreCase)
                .Where(group => group.Count() > 1)
                .Select(group => group.Key)
                .ToList();

            if (bunkers.Any(bunker => string.IsNullOrWhiteSpace(bunker.Id)))
                errors.Add("one or more bunker IDs are empty");
            if (duplicateIds.Count > 0)
                errors.Add($"duplicate bunker IDs: {string.Join(", ", duplicateIds)}");
            if (bunkers.Any(bunker => bunker.SuppliesMonths is < 0 or > 120))
                errors.Add("suppliesMonths must be in range 0..120");
            if (bunkers.Any(bunker => !bunker.HasExplicitWaterMonths))
                errors.Add("waterMonths is required for every production bunker");
            if (bunkers.Any(bunker => bunker.WaterMonths is < 0 or > 120))
                errors.Add("waterMonths must be in range 0..120");

            var requiredWaterBunkerIds = new[]
            {
                "glacial_meltwater_bunker",
                "artesian_aquifer_bunker",
                "hydroelectric_dam_tunnels",
                "rainwater_harvesting_bunker",
                "desalination_plant_bunker"
            };
            var ids = bunkers.Select(bunker => bunker.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var missingRequiredIds = requiredWaterBunkerIds.Where(id => !ids.Contains(id)).ToList();
            if (missingRequiredIds.Count > 0)
                errors.Add($"required water-focused bunker IDs are missing: {string.Join(", ", missingRequiredIds)}");

            if (errors.Count > 0)
            {
                throw new InvalidDataException(
                    $"bunkers.json validation failed: {string.Join("; ", errors)}");
            }

            return bunkers;
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
        public IReadOnlyList<Apocalypse> Apocalypses => _apocalypses;
        public IReadOnlyList<ApocalypseCategoryDefinition> ApocalypseCategories => _apocalypseCategories;
        public IReadOnlyList<ApocalypseVisualThemeDefinition> ApocalypseVisualThemes => _apocalypseVisualThemes;
        public ApocalypseInteractiveSchemaDefinition? ApocalypseInteractiveSchema => _apocalypseInteractiveSchema;
        public Apocalypse? FindApocalypseById(string id) =>
            _apocalypses.FirstOrDefault(item => string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        public ApocalypseCategoryDefinition? GetApocalypseCategoryById(string id) =>
            _apocalypseCategories.FirstOrDefault(item => string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        public ApocalypseVisualThemeDefinition? GetApocalypseVisualThemeById(string id) =>
            _apocalypseVisualThemes.FirstOrDefault(item => string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        public IReadOnlyList<Apocalypse> GetInteractiveApocalypses() =>
            Array.AsReadOnly(_apocalypses.Where(item => item.Gameplay?.Interactive == true).ToArray());
        public IReadOnlyList<BunkerInfo> Bunkers => _bunkers ?? new();
        public IReadOnlyList<ThreatData> Threats => _threats ?? new();
        public IReadOnlyList<SpecialCardData> SpecialCards => _specialCards ?? new();
        public IReadOnlyList<PropertyDefinition> Properties => _properties ?? new();
        public IReadOnlyDictionary<string, PropertyConditionProfile> PropertyConditionProfiles =>
            _propertyConditionProfiles ??
            new Dictionary<string, PropertyConditionProfile>(StringComparer.OrdinalIgnoreCase);
    }
}
