using Bunker.Models.GameData;

namespace Bunker.Services.Threats;

public sealed class ThreatPoolSelector
{
    private static readonly HashSet<string> ExplicitSpecialIds = new(StringComparer.OrdinalIgnoreCase)
    {
        "radiation_leak",
        "air_filter_failure"
    };

    public ThreatData Select(
        IReadOnlyCollection<ThreatData> candidates,
        Func<ThreatData, bool> isAvailableSpecial,
        Func<int, int, int> next,
        ThreatData safeFallback,
        int specialChancePercent = 1)
    {
        var valid = candidates.Where(IsValid).ToList();
        var specialPool = valid.Where(threat => ExplicitSpecialIds.Contains(threat.Id) && isAvailableSpecial(threat)).ToList();
        var textPool = valid.Where(threat => !ExplicitSpecialIds.Contains(threat.Id)).ToList();

        IReadOnlyList<ThreatData> selectedPool;
        if (specialPool.Count == 0 && textPool.Count == 0)
            return safeFallback;
        if (specialPool.Count == 0)
            selectedPool = textPool;
        else if (textPool.Count == 0)
            selectedPool = specialPool;
        else
            selectedPool = next(0, 100) < Math.Clamp(specialChancePercent, 0, 100) ? specialPool : textPool;

        return selectedPool[next(0, selectedPool.Count)];
    }

    private static bool IsValid(ThreatData threat) =>
        threat != null && !string.IsNullOrWhiteSpace(threat.Id) && !string.IsNullOrWhiteSpace(threat.Name);
}
