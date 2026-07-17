using System;
using System.Collections.Generic;
using System.Linq;

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
		private static readonly string[] DefaultSeverityCodes =
		{
			"light",
			"medium",
			"hard",
			"veryHard",
			"critical"
		};

		/// <summary>
		/// Старий варіант: вибір ступеня тяжкості з повної шкали.
		/// Залишений, щоб не зламати старий код.
		/// </summary>
		public static SeverityLevel GetWeightedRandomSeverity()
		{
			return GetWeightedRandomSeverity(DefaultSeverityCodes);
		}

		/// <summary>
		/// Новий варіант: вибір ступеня тяжкості тільки серед доступних рівнів із JSON.
		/// Наприклад, якщо в JSON немає critical, він не випаде.
		/// </summary>
		public static SeverityLevel GetWeightedRandomSeverity(IEnumerable<string>? availableCodes)
		{
			if (availableCodes == null)
				return SeverityLevel.None;

			var available = availableCodes
				.Where(code => !string.IsNullOrWhiteSpace(code))
				.Select(code => code.Trim())
				.Distinct(StringComparer.OrdinalIgnoreCase)
				.ToList();

			if (available.Count == 0)
				return SeverityLevel.None;

			var weights = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
			{
				["light"] = 20,
				["medium"] = 35,
				["hard"] = 25,
				["veryHard"] = 10,
				["critical"] = 5
			};

			var availableWeights = available
				.Where(code => weights.ContainsKey(code))
				.Select(code => new
				{
					Code = code,
					Weight = weights[code]
				})
				.ToList();

			if (availableWeights.Count == 0)
				return SeverityLevel.None;

			int totalWeight = availableWeights.Sum(x => x.Weight);
			int roll = Random.Shared.Next(totalWeight);

			foreach (var item in availableWeights)
			{
				if (roll < item.Weight)
					return GetSeverityLevelFromCode(item.Code);

				roll -= item.Weight;
			}

			return GetSeverityLevelFromCode(availableWeights[0].Code);
		}

		/// <summary>
		/// Перетворити enum у код для JSON.
		/// </summary>
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
		/// Перетворити JSON-код у enum.
		/// </summary>
		public static SeverityLevel GetSeverityLevelFromCode(string? code)
		{
			return code?.Trim().ToLowerInvariant() switch
			{
				"light" => SeverityLevel.Mild,
				"medium" => SeverityLevel.Moderate,
				"hard" => SeverityLevel.Severe,
				"veryhard" => SeverityLevel.VerySevere,
				"critical" => SeverityLevel.Critical,
				_ => SeverityLevel.None
			};
		}

		/// <summary>
		/// Отримати назву ступеня тяжкості для UI.
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
		/// Форматувати назву з рівнем тяжкості.
		/// </summary>
		public static string FormatNameWithSeverity(string name, SeverityLevel level, string lang = "uk")
		{
			if (level == SeverityLevel.None)
				return name;

			var severityName = GetSeverityName(level, lang);

			if (string.IsNullOrWhiteSpace(severityName))
				return name;

			return $"{name} ({severityName})";
		}
	}
}
