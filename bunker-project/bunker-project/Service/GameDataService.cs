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
        private List<TraitData>? _traits;
        private List<SecretData>? _secrets;
        private List<ItemData>? _items;
        private List<CharacterTraitData>? _characterTraits;
        private List<PhobiaData>? _phobias;
        private List<SecretGoalData>? _secretGoals;
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
            
            _hobbies = LoadJson<HobbiesRoot>(Path.Combine(dataPath, "hobbies.json"))?.Hobbies ?? new();
            _professions = LoadJson<ProfessionsRoot>(Path.Combine(dataPath, "professions.json"))?.Professions ?? new();
            _mentalConditions = LoadJson<MentalConditionsRoot>(Path.Combine(dataPath, "mental_conditions.json"))?.MentalConditions ?? new();
            _physicalConditions = LoadJson<PhysicalConditionsRoot>(Path.Combine(dataPath, "physical_conditions.json"))?.PhysicalConditions ?? new();
            _traits = LoadJson<TraitsRoot>(Path.Combine(dataPath, "traits.json"))?.Traits ?? new();
            _secrets = LoadJson<SecretsRoot>(Path.Combine(dataPath, "secrets.json"))?.Secrets ?? new();
            _items = LoadJson<ItemsRoot>(Path.Combine(dataPath, "items.json"))?.Items ?? new();
            _characterTraits = LoadJson<CharacterTraitsRoot>(Path.Combine(dataPath, "character_traits.json"))?.CharacterTraits ?? new();
            _phobias = LoadJson<PhobiasRoot>(Path.Combine(dataPath, "phobias.json"))?.Phobias ?? new();
            _secretGoals = LoadJson<SecretGoalsRoot>(Path.Combine(dataPath, "secret_goals.json"))?.SecretGoals ?? new();
            _apocalypses = LoadJson<ApocalypsesRoot>(Path.Combine(dataPath, "apocalypses.json"))?.Apocalypses ?? new();
            _bunkers = LoadJson<BunkersRoot>(Path.Combine(dataPath, "bunkers.json"))?.Bunkers ?? new();

            _logger.LogInformation($"Завантажено: {_hobbies.Count} хобі, {_professions.Count} професій, " +
                                   $"{_mentalConditions.Count} ментальних станів, {_physicalConditions.Count} фізичних станів, " +
                                   $"{_traits.Count} особливостей, {_secrets.Count} секретів, {_items.Count} предметів, " +
                                   $"{_characterTraits.Count} рис характеру, {_phobias.Count} фобій, {_secretGoals.Count} таємних цілей, " +
                                   $"{_apocalypses.Count} апокаліпсисів, {_bunkers.Count} бункерів");
        }

        private T? LoadJson<T>(string path) where T : class
        {
            try
            {
                if (!File.Exists(path))
                {
                    _logger.LogWarning($"Файл не знайдено: {path}");
                    return null;
                }

                var json = File.ReadAllText(path);
                return JsonSerializer.Deserialize<T>(json, _jsonOptions);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Помилка завантаження JSON з {path}");
                return null;
            }
        }

        // Публічні властивості для доступу до даних
        public IReadOnlyList<HobbyData> Hobbies => _hobbies ?? new();
        public IReadOnlyList<ProfessionData> Professions => _professions ?? new();
        public IReadOnlyList<MentalConditionData> MentalConditions => _mentalConditions ?? new();
        public IReadOnlyList<PhysicalConditionData> PhysicalConditions => _physicalConditions ?? new();
        public IReadOnlyList<TraitData> Traits => _traits ?? new();
        public IReadOnlyList<SecretData> Secrets => _secrets ?? new();
        public IReadOnlyList<ItemData> Items => _items ?? new();
        public IReadOnlyList<CharacterTraitData> CharacterTraits => _characterTraits ?? new();
        public IReadOnlyList<PhobiaData> Phobias => _phobias ?? new();
        public IReadOnlyList<SecretGoalData> SecretGoals => _secretGoals ?? new();
        public IReadOnlyList<Apocalypse> Apocalypses => _apocalypses ?? new();
        public IReadOnlyList<BunkerInfo> Bunkers => _bunkers ?? new();
    }
}
