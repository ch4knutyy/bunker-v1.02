using Bunker.Models;

namespace Bunker.Services;

public enum AiSynergyKind
{
    ComplementarySynergy,
    OneSidedDependency,
    CostlyCooperation,
    MutualStrategicBenefit,
    ConflictOfInterests
}

public sealed record AiSynergyAssessment(
    string PlayerId,
    string PlayerName,
    AiSynergyKind Kind,
    IReadOnlyList<string> Evidence,
    string Caution);

/// <summary>
/// Produces explainable, public-evidence-only strategic observations. It never forms an
/// alliance and never changes health, inventory, votes, or any other game state.
/// </summary>
public sealed class AiSynergyEvaluator
{
    private static readonly string[] MedicalTerms = ["doctor", "medic", "physician", "лікар", "медик", "врач", "медик"];

    public IReadOnlyList<AiSynergyAssessment> Evaluate(Room room, Player self)
    {
        var selfId = RoomService.GetPlayerKey(self);
        var selfIsMedical = ContainsMedicalSkill(self.Profession?.Name);
        var selfHasHealthNeed = !string.IsNullOrWhiteSpace(self.PhysicalHealth?.Name);
        var capacity = room.ResolvedBunkerCapacity ?? room.Bunker?.Capacity ?? 0;
        var activeCount = RoomService.GetGameplayPlayersSnapshot(room).Count;
        var scarcity = capacity > 0 && activeCount > capacity;
        var results = new List<AiSynergyAssessment>();

        foreach (var player in RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value))
        {
            var playerId = RoomService.GetPlayerKey(player);
            if (string.Equals(playerId, selfId, StringComparison.OrdinalIgnoreCase)) continue;
            var publicFacts = player.Revealed?.RevealedValues ?? [];
            var hasPublicHealthNeed = publicFacts.TryGetValue("PhysicalHealth", out var health) && !string.IsNullOrWhiteSpace(health.Value);
            var hasPublicMedicalSkill = publicFacts.TryGetValue("Profession", out var profession) && ContainsMedicalSkill(profession.Value);

            if (selfIsMedical && hasPublicHealthNeed)
            {
                results.Add(new(playerId, player.Name, AiSynergyKind.OneSidedDependency,
                    ["Your profession is medical.", $"{player.Name}'s publicly revealed health condition: {health!.Value}."],
                    BuildCaution(scarcity, "Care may consume medicines, time, equipment, and does not itself make the relationship reciprocal.")));
            }
            else if (selfHasHealthNeed && hasPublicMedicalSkill)
            {
                results.Add(new(playerId, player.Name, AiSynergyKind.OneSidedDependency,
                    ["Your health condition is known to you.", $"{player.Name}'s medical profession is publicly revealed."],
                    BuildCaution(scarcity, "Their skill does not guarantee treatment, resources, consent, or a permanent alliance.")));
            }
            else if (scarcity)
            {
                results.Add(new(playerId, player.Name, AiSynergyKind.ConflictOfInterests,
                    ["Bunker seats are fewer than active participants."],
                    "You remain competitors for survival; do not infer hostility or an alliance without further public evidence."));
            }
        }

        return results;
    }

    private static bool ContainsMedicalSkill(string? value) => !string.IsNullOrWhiteSpace(value) &&
        MedicalTerms.Any(term => value.Contains(term, StringComparison.OrdinalIgnoreCase));

    private static string BuildCaution(bool scarcity, string core) => scarcity
        ? $"{core} Seats are scarce, so both characters remain competitors."
        : core;
}
