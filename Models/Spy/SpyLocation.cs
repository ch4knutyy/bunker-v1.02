using System.Text.Json.Serialization;

namespace Bunker.Models.Spy
{
    public class SpyLocation
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("category")]
        public string Category { get; set; } = "";

        [JsonPropertyName("localization")]
        public Dictionary<string, SpyLocationLocalization> Localization { get; set; } = new();

        public string GetName(string language = "uk")
        {
            var fallbackOrder = new[] { language, "uk", "en", "ru" };
            foreach (var lang in fallbackOrder)
            {
                if (Localization.TryGetValue(lang, out var localized) &&
                    !string.IsNullOrWhiteSpace(localized.Name))
                {
                    return localized.Name;
                }
            }

            return Localization.Values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value.Name))?.Name
                ?? Id;
        }
    }

    public class SpyLocationLocalization
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";
    }
}
