using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bunker.Models;

/// <summary>
/// Compatibility payload for snapshots created before threats became narrative-only.
/// New gameplay does not create or consume this state. Unknown interactive members are
/// captured during deserialization and discarded before a snapshot is restored.
/// </summary>
public sealed class ThreatInteractionState
{
    public string CurrentThreatId { get; set; } = "";
    public string ThreatStatus { get; set; } = "revealed";
    public int? ThreatRevealedRound { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? LegacyInteractiveFields { get; set; }
}
