using System.Text.Json.Serialization;
namespace Bunker.Models
{


	/// <summary>
	/// Стан спеціальної карти
	/// </summary>
	public enum CardState
    {
        Available,   // Доступна для використання
        Pending,     // Очікує підтвердження хоста
        Approved,    // Підтверджена, можна активувати
        Used,        // Використана
        Rejected     // Відхилена хостом
    }

    /// <summary>
    /// Тип ефекту карти
    /// </summary>
    public enum CardEffectType
    {
        RevealOther,        // Розкрити чужу характеристику
        HideOwn,            // Приховати свою характеристику
        SwapCharacteristic, // Обміняти характеристику з іншим
        RegenerateOwn,      // Регенерувати свою характеристику
        ProtectFromVote,    // Захист від голосування
        ExtraVote,          // Додатковий голос
        SkipTurn,           // Пропустити хід іншого
        StealItem,          // Вкрасти предмет
        ViewSecret,         // Подивитися секрет іншого
        Custom              // Кастомний ефект
    }

    /// <summary>
    /// Спеціальна карта гравця
    /// </summary>
    public class SpecialCard
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public CardEffectType EffectType { get; set; } = CardEffectType.Custom;
        public string EffectValue { get; set; } = ""; // Додаткові параметри ефекту
        public CardState State { get; set; } = CardState.Available;
        public string? TargetPlayerId { get; set; } // ID гравця-цілі (якщо потрібно)
        public string? TargetCharacteristic { get; set; } // Характеристика-ціль
        public string OwnerConnectionId { get; set; } = "";
        public DateTime? RequestedAt { get; set; }
        public DateTime? ResolvedAt { get; set; }
        
        /// <summary>
        /// Чи потребує карта підтвердження хоста
        /// </summary>
        public bool RequiresApproval { get; set; } = true;
        
        /// <summary>
        /// Рідкість карти
        /// </summary>
        public string Rarity { get; set; } = "common"; // common, rare, epic, legendary

        public object ToClientInfo()
        {
            return new
            {
                id = Id,
                name = Name,
                description = Description,
                effectType = EffectType.ToString(),
                state = State.ToString(),
                rarity = Rarity,
                requiresApproval = RequiresApproval,
                targetPlayerId = TargetPlayerId,
                targetCharacteristic = TargetCharacteristic
            };
        }
	}

    /// <summary>
    /// Шаблон карти для генерації
    /// </summary>



public class CardTemplate
	{
		[JsonPropertyName("id")]
		public int Id { get; set; }

		[JsonPropertyName("name")]
		public string Name { get; set; } = "";

		[JsonPropertyName("description")]
		public string Description { get; set; } = "";

		[JsonPropertyName("effectType")]
		public string EffectType { get; set; } = "Custom";

		[JsonPropertyName("rarity")]
		public string Rarity { get; set; } = "common";

		[JsonPropertyName("category")]
		public string Category { get; set; } = "";

		[JsonPropertyName("target")]
		public string Target { get; set; } = "";

		[JsonPropertyName("value")]
		public int Value { get; set; }

		// 👉 додай це
		public string EffectValue { get; set; } = "";

		[JsonPropertyName("isTemporary")]
		public bool IsTemporary { get; set; }

		// залишаємо для сумісності з існуючим кодом
		public bool RequiresApproval { get; set; } = true;
		public bool RequiresTarget { get; set; } = false;
		public bool RequiresCharacteristic { get; set; } = false;
	}

	/// <summary>
	/// Кореневий об'єкт для JSON
	/// </summary>


public class CardsRoot
	{
		[JsonPropertyName("special_cards")]
		public List<CardTemplate> Cards { get; set; } = new();
	}
}



