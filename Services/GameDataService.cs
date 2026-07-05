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
            _mentalConditions = LoadJsonArray<MentalConditionData>(Path.Combine(dataPath, "mental_conditions.json"), "mental_conditions");
            _physicalConditions = LoadJsonArray<PhysicalConditionData>(Path.Combine(dataPath, "physical_conditions.json"), "physical_conditions");
            _items = LoadJsonArray<ItemData>(Path.Combine(dataPath, "items.json"), "items");
            _characterTraits = LoadJsonArray<CharacterTraitData>(Path.Combine(dataPath, "character_traits.json"), "character_traits");
            _phobias = LoadJsonArray<PhobiaData>(Path.Combine(dataPath, "phobias.json"), "phobias");
            _facts = LoadJsonArray<FactData>(Path.Combine(dataPath, "facts.json"), "facts");
            _apocalypses = LoadJsonArray<Apocalypse>(Path.Combine(dataPath, "apocalypses.json"), "apocalypses");
            _bunkers = LoadJsonArray<BunkerInfo>(Path.Combine(dataPath, "bunkers.json"), "bunkers");

            _logger.LogInformation($"Завантажено: {_hobbies.Count} хобі, {_professions.Count} професій, " +
                                   $"{_mentalConditions.Count} ментальних станів, {_physicalConditions.Count} фізичних станів, " +
                                   $"{_items.Count} предметів, {_characterTraits.Count} рис характеру, " +
                                   $"{_phobias.Count} фобій, {_facts.Count} фактів, " +
                                   $"{_apocalypses.Count} апокаліпсисів, {_bunkers.Count} бункерів");
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
    }
}
