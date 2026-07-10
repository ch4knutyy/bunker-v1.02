using System.Text.Json;
using System.Text.Json.Serialization;
using Bunker.Models.Сharacteristics;

namespace Bunker.Models
{
    public class SpecialCard
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public bool IsSecret { get; set; } = true;
        public bool IsOneTimeUse { get; set; } = true;
        public string Phase { get; set; } = "beforeVoting";
        public string EffectType { get; set; } = "";
        public bool RequiresTarget { get; set; }

        public bool IsUsed { get; set; }
        public bool IsActive { get; set; }
        public int? UsedAtRound { get; set; }
        public int? ActivatedRound { get; set; }
        public string? TargetPlayerId { get; set; }
        public string? TargetPlayerName { get; set; }
        public string? ActivatedVotingId { get; set; }
        public string? EffectResult { get; set; }
        public string? PublicLog { get; set; }
        public string? PrivateResult { get; set; }
        public string UseMode { get; set; } = "";
        public bool WasUsedSilently { get; set; }
        public bool IsPubliclyRevealed { get; set; }
        public string EffectDuration { get; set; } = "instant";
        public int? EffectExpiresAtRound { get; set; }
        public int? PublicVisibilityExpiresAtRound { get; set; }
        public string? PublicDisplayName { get; set; }
        public string? PublicDescription { get; set; }
        public string? PublicResult { get; set; }
        public Profession? OriginalProfessionBeforeTemporaryCopy { get; set; }

        [JsonPropertyName("_i18n")]
        public Dictionary<string, JsonElement>? I18n { get; set; }
    }
}
