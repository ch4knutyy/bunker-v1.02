using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Models.GameData;

namespace Bunker.Services
{
    public class CharacterGeneratorService
    {
        private static readonly Random _random = new();
        private readonly GameDataService _gameData;
        private readonly ILogger<CharacterGeneratorService> _logger;
        private const string DefaultHealthLanguage = "uk";
        private const int MentalStableChancePercent = 23;
        private const int PhysicalHealthyChancePercent = 18;
        private const int MaxNormalHealthPerRoom = 2;

        private static readonly string[] Sexes = { "Чоловіча", "Жіноча" };
        
        // Категорії фізичних станів де НЕ потрібна ступінь тяжкості
        private static readonly HashSet<string> NoSeverityCategories = new()
        {
            "інвалідність",
            "травма",
            "ампутація"
        };
        
        // Назви фізичних станів де НЕ потрібна ступінь
        private static readonly HashSet<string> NoSeverityConditions = new()
        {
            "Відсутність",
            "відсутність",
            "Сліпота",
            "Глухота",
            "Ампутована",
            "Ампутована рука",
            "Ампутована нога",
            "ампутація",
            "Параліч",
            "Параліч нижніх кінцівок",
            "Відсутність пальців",
            "Відсутність ока",
            "Відсутність зубів",
            "Відсутність однієї нирки",
            "Протез",
            "протез",
            "Скляне око",
            "Слуховий апарат",
            "Без ноги",
            "Без руки",
            "Немає ока",
            "Ампутація"
        };

        private static readonly HashSet<string> GradablePhysicalCategories = new(StringComparer.OrdinalIgnoreCase)
        {
            "хронічний",
            "тривожний",
            "больовий",
            "алергічний",
            "інфекційний"
        };

        private static readonly string[] GradablePhysicalMarkers =
        {
            "астма",
            "артрит",
            "біль",
            "мігрень",
            "алергі",
            "діабет",
            "гіпертон",
            "хроніч",
            "тривож",
            "синдром"
        };

        public CharacterGeneratorService(GameDataService gameData, ILogger<CharacterGeneratorService> logger)
        {
            _gameData = gameData;
            _logger = logger;
        }

        public Player Generate(string name, IEnumerable<Player>? existingRoomPlayers = null)
        {
            var body = GenerateBody();
            var sex = GetRandom(Sexes);
            var sexOrientation = GenerateSexOrientation(sex);
            var isChildfree = _random.Next(100) < 10;


            var player = new Player
            {
                Name = name,
                Personality = new Personality
                {
					Age = GenerateRealisticAge(_random),
					Sex = sex,
                    SexOrientation = sexOrientation,
                    IsChildfree = isChildfree
                },
                Body = new Body
                {
                    Height = body.height,
                    Weight = body.weight,
                    BodyType = body.bodyType
                },
                Profession = GenerateProfession(),
                Hobby = GenerateHobby(),
                PhysicalHealth = GeneratePhysicalHealth(existingRoomPlayers),
                MentalHealth = GenerateMentalHealth(existingRoomPlayers),
                Inventory = GenerateInventory(),
                CharacterTrait = GenerateCharacterTrait(),
                Phobia = GeneratePhobia(),
				Fact = GenerateFact()
            };

            return player;
        }


        #region Age Generation

        private int GenerateRealisticAge(Random random)
        {
            int roll = random.Next(100);

            if (roll < 15)
                return random.Next(8, 18);

            if (roll < 40)
                return random.Next(18, 30);

            if (roll < 75)
                return random.Next(30, 50);

            if (roll < 95)
                return random.Next(50, 70);

            return random.Next(70, 100);

        }
		#endregion

		#region Phobia Generation

		private Phobia GeneratePhobia()
        {
            // 30% шанс не мати фобії
            if (_random.Next(100) < 30)
                return new Phobia { Name = "Немає фобій", Description = "", BunkerEffect = "" };

            if (_gameData.Phobias.Count == 0)
                return new Phobia { Name = "Немає фобій", Description = "", BunkerEffect = "" };

            var data = _gameData.Phobias[_random.Next(_gameData.Phobias.Count)];

            return new Phobia
            {
                Id = data.Id,
                Name = data.Name,
                Description = data.Description,
                BunkerEffect = data.BunkerEffect,
                I18n = data.I18n
            };
        }

        #endregion

        #region CharacterTrait Generation

        private CharacterTrait GenerateCharacterTrait()
        {
            if (_gameData.CharacterTraits.Count == 0)
                return new CharacterTrait { Name = "Невизначений", Type = "serious" };

            var data = _gameData.CharacterTraits[_random.Next(_gameData.CharacterTraits.Count)];

            return new CharacterTrait
            {
                Name = data.Trait,
                Type = data.Type,
                I18n = data.I18n
            };
        }

        #endregion

        #region Inventory Generation

        private Inventory GenerateInventory()
        {
            var inventory = new Inventory
            {
                Size = "Середній",
                Items = new List<Item>()
            };

            if (_gameData.Items.Count == 0)
                return inventory;

            // Генеруємо 1-3 випадкових предмети
            int itemCount = _random.Next(1, 4);
            var usedIndices = new HashSet<int>();

            for (int i = 0; i < itemCount && usedIndices.Count < _gameData.Items.Count; i++)
            {
                int index;
                do
                {
                    index = _random.Next(_gameData.Items.Count);
                } while (usedIndices.Contains(index));
                
                usedIndices.Add(index);
                var itemData = _gameData.Items[index];

                inventory.Items.Add(new Item
                {
                    Name = itemData.Item,
                    Description = $"Категорія: {itemData.Category}",
                    Quantity = _random.Next(1, 4),
                    Unit = "шт",
                    WeightKg = Math.Round(_random.NextDouble() * 2 + 0.1, 1),
                    IsUsefulInBunker = true,
                    Rarity = "Звичайний",
                    I18n = itemData.I18n
                });
            }

            return inventory;
        }

        #endregion

        #region Profession Generation

        private Profession GenerateProfession()
        {
            if (_gameData.Professions.Count == 0)
                return new Profession { Name = "Безробітний" };

            var data = _gameData.Professions[_random.Next(_gameData.Professions.Count)];
            
            // Вибираємо ОДИН випадковий предмет з масиву items
            string selectedItem = "";
            if (data.Items.Count > 0)
            {
                selectedItem = data.Items[_random.Next(data.Items.Count)];
            }

            // Формуємо tooltip
            var tooltip = BuildProfessionTooltip(data.Bonus, selectedItem);

            return new Profession
            {
                Name = data.Profession,
                Type = data.Type,
                ExperienceYears = _random.Next(1, 30),
                Skills = data.Skills.ToList(),
                AllItems = data.Items.ToList(),
                SelectedItem = selectedItem,
                Bonus = data.Bonus,
                Tooltip = tooltip,
                I18n = data.I18n
            };
        }

        private static string BuildProfessionTooltip(string bonus, string selectedItem)
        {
            if (string.IsNullOrEmpty(bonus) && string.IsNullOrEmpty(selectedItem))
                return "";

            var parts = new List<string>();
            
            if (!string.IsNullOrEmpty(bonus))
            {
                // Перша літера бонусу - маленька, бо починаємо з "Вміє"
                var bonusLower = char.ToLower(bonus[0]) + bonus[1..];
                parts.Add($"Вміє {bonusLower}");
            }
            
            if (!string.IsNullOrEmpty(selectedItem))
            {
                // Перша літера предмета - маленька
                var itemLower = char.ToLower(selectedItem[0]) + selectedItem[1..];
                parts.Add($"має при собі {itemLower}");
            }

            return string.Join(" та ", parts) + ".";
        }

        #endregion

        #region Hobby Generation

        private Hobby GenerateHobby()
        {
            if (_gameData.Hobbies.Count == 0)
                return new Hobby { Name = "Немає хобі" };

            var data = _gameData.Hobbies[_random.Next(_gameData.Hobbies.Count)];
            
            // Формуємо tooltip
            var tooltip = BuildHobbyTooltip(data.Bonus, data.Item);

            return new Hobby
            {
                Name = data.Hobby,
                Type = data.Type,
                Item = data.Item,
                Bonus = data.Bonus,
                Tooltip = tooltip,
                I18n = data.I18n
            };
        }

        private static string BuildHobbyTooltip(string bonus, string item)
        {
            if (string.IsNullOrEmpty(bonus) && string.IsNullOrEmpty(item))
                return "";

            var parts = new List<string>();
            
            if (!string.IsNullOrEmpty(bonus))
            {
                // Перша літера бонусу - маленька, бо починаємо з "Може"
                var bonusLower = char.ToLower(bonus[0]) + bonus[1..];
                parts.Add($"Може {bonusLower}");
            }
            
            if (!string.IsNullOrEmpty(item))
            {
                // Перша літера предмета - маленька
                var itemLower = char.ToLower(item[0]) + item[1..];
                parts.Add($"отримує бонусом: {itemLower}");
            }

            return string.Join(" та ", parts) + ".";
        }

        #endregion

        #region Mental Health Generation

        private MentalHealth GenerateMentalHealth(IEnumerable<Player>? existingRoomPlayers)
        {
            if (_gameData.MentalConditions.Count == 0)
                return CreateStableMentalHealth();

            var stableCount = existingRoomPlayers?.Count(p => p != null && IsStableMentalHealth(p.MentalHealth)) ?? 0;
            if (stableCount < MaxNormalHealthPerRoom && _random.Next(100) < MentalStableChancePercent)
                return CreateStableMentalHealth();

            var data = _gameData.MentalConditions[_random.Next(_gameData.MentalConditions.Count)];
            var hasSeverity = data.HasSeverity ?? true;
            var severityLevel = hasSeverity ? SeverityHelper.GetWeightedRandomSeverity() : SeverityLevel.None;
            var severityCode = hasSeverity ? SeverityHelper.GetSeverityCode(severityLevel) : "none";
            var severityName = hasSeverity ? SeverityHelper.GetSeverityName(severityLevel, DefaultHealthLanguage) : "";
            var localized = ResolveConditionText(data.Localization, DefaultHealthLanguage, severityCode, hasSeverity, data.Name, data.Description);
            var baseName = localized.Name;

            return new MentalHealth
            {
                Id = data.Id,
                BaseName = baseName,
                Name = hasSeverity ? SeverityHelper.FormatNameWithSeverity(baseName, severityLevel, DefaultHealthLanguage) : baseName,
                Category = data.Category,
                Tone = data.Tone,
                Rarity = data.Rarity,
                BaseSeverity = data.Severity,
                SeverityLevel = severityName,
                SeverityCode = severityCode,
                Visibility = data.Visibility,
                Description = localized.Description,
                GameEffect = "",
                SurvivalImpact = data.SurvivalImpact,
                SocialImpact = data.SocialImpact,
                TreatmentDifficulty = data.TreatmentDifficulty,
                IsFictional = data.IsFictional,
                Tags = data.Tags?.ToList() ?? new(),
                Tooltip = BuildHealthTooltip(localized.Description),
                I18n = data.I18n,
                Localization = data.Localization
            };
        }

        private static MentalHealth CreateStableMentalHealth()
        {
            return new MentalHealth
            {
                Name = "Стабільний",
                BaseName = "Стабільний",
                SeverityLevel = "",
                SeverityCode = "none",
                Tooltip = ""
            };
        }

        #endregion

        #region Physical Health Generation

        private PhysicalHealth GeneratePhysicalHealth(IEnumerable<Player>? existingRoomPlayers)
        {
            if (_gameData.PhysicalConditions.Count == 0)
                return CreateHealthyPhysicalHealth();

            var healthyCount = existingRoomPlayers?.Count(p => p != null && IsHealthyPhysicalHealth(p.PhysicalHealth)) ?? 0;
            if (healthyCount < MaxNormalHealthPerRoom && _random.Next(100) < PhysicalHealthyChancePercent)
                return CreateHealthyPhysicalHealth();

            var data = _gameData.PhysicalConditions[_random.Next(_gameData.PhysicalConditions.Count)];
            var hasSeverity = data.HasSeverity ?? DetermineIfAllowsSeverity(data);
            var severityLevel = hasSeverity ? SeverityHelper.GetWeightedRandomSeverity() : SeverityLevel.None;
            var severityCode = hasSeverity ? SeverityHelper.GetSeverityCode(severityLevel) : "none";
            var severityName = hasSeverity ? SeverityHelper.GetSeverityName(severityLevel, DefaultHealthLanguage) : "";
            var localized = ResolveConditionText(data.Localization, DefaultHealthLanguage, severityCode, hasSeverity, data.Name, data.Description);
            var baseName = localized.Name;

            return new PhysicalHealth
            {
                Id = data.Id,
                BaseName = baseName,
                Name = hasSeverity ? SeverityHelper.FormatNameWithSeverity(baseName, severityLevel, DefaultHealthLanguage) : baseName,
                Category = data.Category,
                Tone = data.Tone,
                Rarity = data.Rarity,
                BaseSeverity = data.Severity,
                SeverityLevel = hasSeverity ? severityName : null,
                SeverityCode = severityCode,
                AllowsSeverity = hasSeverity,
                Visibility = data.Visibility,
                Description = localized.Description,
                GameEffect = "",
                SurvivalImpact = data.SurvivalImpact,
                SocialImpact = data.SocialImpact,
                MovementImpact = data.MovementImpact,
                PainLevel = data.PainLevel,
                TreatmentDifficulty = data.TreatmentDifficulty,
                IsFictional = data.IsFictional,
                Tags = data.Tags?.ToList() ?? new(),
                Tooltip = BuildHealthTooltip(localized.Description),
                I18n = data.I18n,
                Localization = data.Localization
            };
        }

        private static PhysicalHealth CreateHealthyPhysicalHealth()
        {
            return new PhysicalHealth
            {
                Name = "Здоровий",
                BaseName = "Здоровий",
                SeverityCode = "none",
                AllowsSeverity = false,
                Tooltip = ""
            };
        }

        /// <summary>
        /// Визначити чи для цього фізичного стану потрібна ступінь тяжкості
        /// </summary>
        private static bool DetermineIfAllowsSeverity(PhysicalConditionData data)
        {
            // Перевіряємо категорію
            var category = data.Category ?? "";
            var name = data.Name ?? "";
            var description = data.Description ?? "";
            var tags = data.Tags ?? new();

            if (NoSeverityCategories.Contains(category.ToLowerInvariant()))
                return false;
            
            // Перевіряємо конкретні назви
            if (NoSeverityConditions.Any(c => name.Contains(c, StringComparison.OrdinalIgnoreCase)))
                return false;
            
            // Перевіряємо теги
            if (tags.Any(t => (t ?? "").ToLowerInvariant() is "ампутація" or "інвалідність" or "необоротне"))
                return false;
            
            // Для явно градуйованих станів - так
            if (GradablePhysicalCategories.Contains(category))
                return true;

            var searchable = string.Join(" ", new[]
            {
                name,
                category,
                description,
                string.Join(" ", tags.Where(t => !string.IsNullOrWhiteSpace(t)))
            }).ToLowerInvariant();

            if (GradablePhysicalMarkers.Any(marker => searchable.Contains(marker)))
                return true;
            
            // Якщо неможливо точно визначити, чи ступінь потрібен, не показуємо його.
            return false;
        }

        #endregion

        #region Body Generation

        private (int height, int weight, string bodyType) GenerateBody()
        {
            int height = _random.Next(120, 221);

            var bodyTypes = new List<WeightedItem<string>>
            {
                new() { Value = "Худий", Weight = 20 },
                new() { Value = "Нормальний", Weight = 30 },
                new() { Value = "Підкачений", Weight = 15 },
                new() { Value = "Ожиріння (слабке)", Weight = 15 },
                new() { Value = "Ожиріння (середнє)", Weight = 10 },
                new() { Value = "Ожиріння (важке)", Weight = 7 },
                new() { Value = "Ожиріння (дуже важке)", Weight = 3 }
            };

            string bodyType = GetWeightedRandom(bodyTypes);

            int normalWeight = height - 100;
            int weight = bodyType switch
            {
                "Худий" => normalWeight - _random.Next(10, 25),
                "Нормальний" => normalWeight + _random.Next(-5, 6),
                "Підкачений" => normalWeight + _random.Next(5, 15),
                "Ожиріння (слабке)" => normalWeight + _random.Next(15, 25),
                "Ожиріння (середнє)" => normalWeight + _random.Next(25, 40),
                "Ожиріння (важке)" => normalWeight + _random.Next(40, 60),
                _ => normalWeight + _random.Next(60, 100)
            };

            if (weight < 30) weight = 30;

            return (height, weight, bodyType);
        }

        #endregion

        #region Helpers

        private readonly record struct ConditionText(string Name, string Description);

        private static ConditionText ResolveConditionText(
            Dictionary<string, ConditionLocalization>? localization,
            string lang,
            string severityCode,
            bool hasSeverity,
            string fallbackName,
            string fallbackDescription)
        {
            var languageOrder = BuildLanguageFallbackOrder(localization, lang);
            var name = FirstLocalizedValue(localization, languageOrder, item => item.Name);

            string description;
            if (hasSeverity)
            {
                description = FirstLocalizedValue(localization, languageOrder, item =>
                    item.Descriptions != null && item.Descriptions.TryGetValue(severityCode, out var value) ? value : "");

                if (string.IsNullOrWhiteSpace(description))
                {
                    description = FirstLocalizedValue(localization, languageOrder, item =>
                        item.Descriptions?.Values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? "");
                }
            }
            else
            {
                description = FirstLocalizedValue(localization, languageOrder, item => item.Description);
            }

            return new ConditionText(
                string.IsNullOrWhiteSpace(name) ? fallbackName ?? "" : name,
                string.IsNullOrWhiteSpace(description) ? fallbackDescription ?? "" : description
            );
        }

        private static List<string> BuildLanguageFallbackOrder(Dictionary<string, ConditionLocalization>? localization, string lang)
        {
            var result = new List<string>();
            void Add(string? value)
            {
                if (!string.IsNullOrWhiteSpace(value) && !result.Contains(value))
                    result.Add(value);
            }

            Add(lang);
            Add("uk");

            if (localization != null)
            {
                foreach (var key in localization.Keys)
                    Add(key);
            }

            return result;
        }

        private static string FirstLocalizedValue(
            Dictionary<string, ConditionLocalization>? localization,
            IEnumerable<string> languageOrder,
            Func<ConditionLocalization, string?> selector)
        {
            if (localization == null) return "";

            foreach (var lang in languageOrder)
            {
                if (!localization.TryGetValue(lang, out var localized) || localized == null) continue;

                var value = selector(localized);
                if (!string.IsNullOrWhiteSpace(value))
                    return value;
            }

            return "";
        }

        private static string BuildHealthTooltip(string description)
        {
            var cleaned = CleanTooltipPart(description).Trim();
            if (string.IsNullOrWhiteSpace(cleaned)) return "";
            return cleaned.EndsWith('.') || cleaned.EndsWith('!') || cleaned.EndsWith('?')
                ? cleaned
                : cleaned + ".";
        }

        private static bool IsStableMentalHealth(MentalHealth? mentalHealth)
        {
            var value = $"{mentalHealth?.BaseName} {mentalHealth?.Name}".ToLowerInvariant();
            return value.Contains("стабіль") || value.Contains("стабиль") || value.Contains("stable");
        }

        private static bool IsHealthyPhysicalHealth(PhysicalHealth? physicalHealth)
        {
            var value = $"{physicalHealth?.BaseName} {physicalHealth?.Name}".ToLowerInvariant();
            return value.Contains("здоров") || value.Contains("healthy");
        }

        private static string GenerateSexOrientation(string sex)
        {
            int chance = _random.Next(100);

            if (sex == "Чоловіча")
            {
                if (chance < 50) return "Гетеро";
                if (chance < 65) return "Гей";
                if (chance < 80) return "Бі";
                if (chance < 90) return "Пансексуал";
                return "Асексуал";
            }
            else if (sex == "Жіноча")
            {
                if (chance < 50) return "Гетеро";
                if (chance < 65) return "Лесбійка";
                if (chance < 80) return "Бі";
                if (chance < 90) return "Пансексуал";
                return "Асексуал";
            }
            else
            {
                if (chance < 50) return "Гетеро";
                if (chance < 75) return "Бі";
                if (chance < 90) return "Пансексуал";
                return "Асексуал";
            }
        }

        private static string GetRandom(string[] array)
        {
            return array[_random.Next(array.Length)];
        }

        private static T GetWeightedRandom<T>(List<WeightedItem<T>> items)
        {
            int totalWeight = items.Sum(x => x.Weight);
            int randomValue = _random.Next(totalWeight);
            int currentWeight = 0;

            foreach (var item in items)
            {
                currentWeight += item.Weight;
                if (randomValue < currentWeight)
                    return item.Value;
            }

            return items.Last().Value;
        }

		#endregion

		#region Fact Generation

        private Fact GenerateFact()
        {
            if (_gameData.Facts.Count == 0)
            {
                return new Fact
                {
                    Id = "",
                    Source = "",
                    Type = "",
                    Category = "",
                    Name = "Немає факту",
                    Description = "",
                    Tooltip = ""
                };
            }

            var data = _gameData.Facts[_random.Next(_gameData.Facts.Count)];

            return new Fact
            {
                Id = data.Id,
                Source = data.Source,
                Type = data.Type,
                Category = data.Category,
                Name = data.Fact,
                Description = data.Description,
                Tooltip = BuildFactTooltip(data.Fact, data.Description),
                I18n = data.I18n
            };
        }

        private static string BuildFactTooltip(params string?[] parts)
        {
            var cleanParts = parts
                .Where(part => !string.IsNullOrWhiteSpace(part))
                .Select(part => CleanTooltipPart(part!).Trim().Trim('.').Trim())
                .Where(part => !string.IsNullOrWhiteSpace(part))
                .ToList();

            return cleanParts.Count == 0 ? "" : string.Join(". ", cleanParts) + ".";
        }

        private static string CleanTooltipPart(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return "";

            var cleaned = text.Trim();
            if (System.Text.RegularExpressions.Regex.IsMatch(
                    cleaned,
                    @"\b(Связано\s+с|Related\s+to|Тяжкість|Тяжесть|Severity|Bunker impact|Влияние\s+в\s+бункере|Вплив\s+у\s+бункері)\b",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                return "";
            }

            var labels = new[]
            {
                "Ефект у грі:",
                "Ефект в игре:",
                "Эффект в игре:",
                "Game effect:",
                "Effect in game:",
                "Bunker effect:",
                "Bunker impact:",
                "Ефект у бункері:",
                "Ефект в бункере:",
                "Эффект в бункере:"
            };

            foreach (var label in labels)
            {
                if (cleaned.StartsWith(label, StringComparison.OrdinalIgnoreCase))
                {
                    cleaned = cleaned[label.Length..].Trim();
                }
            }

            return System.Text.RegularExpressions.Regex
                .Replace(cleaned, @"\b(Тяжкість|Тяжесть|Severity)\s*:\s*\d+\s*/\s*10\b", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase)
                .Trim();
        }
		#endregion

	}

	public class WeightedItem<T>
    {
        public T Value { get; set; } = default!;
        public int Weight { get; set; }
    }
}
