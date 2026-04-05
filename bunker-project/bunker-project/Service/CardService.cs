using Bunker.Models;
using System.Text.Json;

namespace Bunker.Services
{
    /// <summary>
    /// Сервіс для управління спеціальними картами
    /// </summary>
    public class CardService
    {
        private readonly ILogger<CardService> _logger;
        private readonly IWebHostEnvironment _env;
        private List<CardTemplate> _cardTemplates = new();
        private readonly Random _random = new();

        public CardService(ILogger<CardService> logger, IWebHostEnvironment env)
        {
            _logger = logger;
            _env = env;
            LoadCardTemplates();
        }

        private void LoadCardTemplates()
        {
            try
            {
                var filePath = Path.Combine(_env.WebRootPath, "data", "special_cards.json");
                if (File.Exists(filePath))
                {
                    var json = File.ReadAllText(filePath);
                    var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    var root = JsonSerializer.Deserialize<CardsRoot>(json, options);
                    _cardTemplates = root?.Cards ?? new();
                    _logger.LogInformation($"Завантажено {_cardTemplates.Count} шаблонів карт");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Помилка завантаження шаблонів карт");
            }
        }

        /// <summary>
        /// Згенерувати випадкові карти для гравця
        /// </summary>
        public List<SpecialCard> GenerateCardsForPlayer(string connectionId, int count = 2)
        {
            var cards = new List<SpecialCard>();
            var availableTemplates = _cardTemplates.ToList();
            
            // Зважений вибір по рідкості
            for (int i = 0; i < count && availableTemplates.Count > 0; i++)
            {
                var template = SelectWeightedTemplate(availableTemplates);
                if (template != null)
                {
                    var card = CreateCardFromTemplate(template, connectionId);
                    cards.Add(card);
                    // Можна видалити шаблон щоб не було дублікатів
                    // availableTemplates.Remove(template);
                }
            }
            
            return cards;
        }

        private CardTemplate? SelectWeightedTemplate(List<CardTemplate> templates)
        {
            if (templates.Count == 0) return null;
            
            // Ваги по рідкості: common=50, rare=30, epic=15, legendary=5
            var weighted = new List<(CardTemplate template, int weight)>();
            foreach (var t in templates)
            {
                int weight = t.Rarity switch
                {
                    "common" => 50,
                    "rare" => 30,
                    "epic" => 15,
                    "legendary" => 5,
                    _ => 25
                };
                weighted.Add((t, weight));
            }
            
            int totalWeight = weighted.Sum(w => w.weight);
            int roll = _random.Next(totalWeight);
            
            int cumulative = 0;
            foreach (var (template, weight) in weighted)
            {
                cumulative += weight;
                if (roll < cumulative)
                    return template;
            }
            
            return templates[0];
        }

        private SpecialCard CreateCardFromTemplate(CardTemplate template, string ownerConnectionId)
        {
            if (!Enum.TryParse<CardEffectType>(template.EffectType, out var effectType))
            {
                effectType = CardEffectType.Custom;
            }

            return new SpecialCard
            {
                Id = Guid.NewGuid().ToString("N")[..8],
                Name = template.Name,
                Description = template.Description,
                EffectType = effectType,
                EffectValue = template.EffectValue,
                RequiresApproval = template.RequiresApproval,
                Rarity = template.Rarity,
                State = CardState.Available,
                OwnerConnectionId = ownerConnectionId
            };
        }

        /// <summary>
        /// Отримати шаблон карти за ID
        /// </summary>
        public CardTemplate? GetTemplate(string templateId)
        {
            return _cardTemplates.FirstOrDefault(t => t.Id == templateId);
        }

        /// <summary>
        /// Отримати всі шаблони карт
        /// </summary>
        public IReadOnlyList<CardTemplate> GetAllTemplates() => _cardTemplates.AsReadOnly();

        /// <summary>
        /// Створити карту з шаблону
        /// </summary>
        public SpecialCard? CreateCardFromTemplateId(string templateId, string ownerConnectionId)
        {
            var template = GetTemplate(templateId);
            if (template == null) return null;
            return CreateCardFromTemplate(template, ownerConnectionId);
        }
    }
}
