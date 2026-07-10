using System.Text.Json;
using System.Text.Json.Serialization;
using Bunker.Models;

namespace Bunker.Models.GameData
{
    public class ThreatData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("description")]
        public string Description { get; set; } = "";

        [JsonPropertyName("severity")]
        public string Severity { get; set; } = "medium";

        [JsonPropertyName("round")]
        public int Round { get; set; } = 3;

        [JsonPropertyName("revealRound")]
        public int RevealRound { get; set; } = 3;

        [JsonPropertyName("category")]
        public string Category { get; set; } = "";

        [JsonPropertyName("relatedApocalypseIds")]
        public List<string> RelatedApocalypseIds { get; set; } = new();

        [JsonPropertyName("apocalypseTags")]
        public List<string> ApocalypseTags { get; set; } = new();

        [JsonPropertyName("relatedBunkerIds")]
        public List<string> RelatedBunkerIds { get; set; } = new();

        [JsonPropertyName("bunkerTags")]
        public List<string> BunkerTags { get; set; } = new();

        [JsonPropertyName("tags")]
        public List<string> Tags { get; set; } = new();

        [JsonPropertyName("isUniversalFallback")]
        public bool IsUniversalFallback { get; set; }

        [JsonPropertyName("isRevealedByDefault")]
        public bool IsRevealedByDefault { get; set; }

        [JsonPropertyName("imageUrl")]
        public string? ImageUrl { get; set; }

        [JsonPropertyName("imagePath")]
        public string? ImagePath { get; set; }

        [JsonPropertyName("uploadedImagePath")]
        public string? UploadedImagePath { get; set; }

        [JsonPropertyName("imagePrompt")]
        public string? ImagePrompt { get; set; }

        [JsonPropertyName("generatedImagePrompt")]
        public string? GeneratedImagePrompt { get; set; }

        [JsonPropertyName("requirements")]
        public List<string> Requirements { get; set; } = new();

        [JsonPropertyName("risks")]
        public List<string> Risks { get; set; } = new();

        [JsonPropertyName("consequences")]
        public List<string> Consequences { get; set; } = new();

        [JsonPropertyName("mechanics")]
        public JsonElement? Mechanics { get; set; }

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }

        public string GenerateImagePrompt(Apocalypse? apocalypse = null, BunkerInfo? bunker = null)
        {
            if (!string.IsNullOrWhiteSpace(GeneratedImagePrompt))
                return GeneratedImagePrompt;

            if (!string.IsNullOrWhiteSpace(ImagePrompt))
                return ImagePrompt;

            var threatTags = Tags.Count > 0 ? string.Join(", ", Tags.Take(6)) : "survival crisis";
            var apocalypseName = apocalypse?.Name ?? "unknown apocalypse";
            var apocalypseDescription = apocalypse?.Description ?? "a collapsing outside world";
            var bunkerName = bunker?.Name ?? "underground bunker";
            var bunkerDescription = bunker?.Description ?? "a tense survival shelter";
            var bunkerLocation = bunker?.Location ?? "unknown location";
            var bunkerCondition = bunker?.Condition ?? "unknown condition";

            return "Create a realistic cinematic illustration for a bunker survival game threat. " +
                   $"Threat: {Name}. Description: {Description}. Severity: {Severity}. Category: {Category}. Tags: {threatTags}. " +
                   $"Current apocalypse: {apocalypseName}. Apocalypse context: {apocalypseDescription}. " +
                   $"Current bunker: {bunkerName}. Bunker context: {bunkerDescription}. Location: {bunkerLocation}. Condition: {bunkerCondition}. " +
                   "Show the threat as a concrete visual situation, dark survival atmosphere, grounded realism, dramatic lighting, high detail, no text, no UI.";
        }
    }
}
