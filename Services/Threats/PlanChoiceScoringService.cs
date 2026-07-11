namespace Bunker.Services.Threats;

public sealed class PlanChoiceScoringService
{
    public PlanChoiceScoreResult Score(PlanChoiceScoreRequest request, int randomModifier)
    {
        var bestByPlayer = request.Capabilities
            .GroupBy(item => item.PlayerId, StringComparer.OrdinalIgnoreCase)
            .Select(group => group
                .Select(item => Classify(item, request.Plan))
                .Where(item => item != null)
                .OrderByDescending(item => item!.Rank)
                .ThenByDescending(item => item!.WeightedScore)
                .FirstOrDefault())
            .Where(item => item != null)
            .Cast<ClassifiedContribution>()
            .ToList();

        var countedGroups = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var strong = TakeTier(bestByPlayer, "strong", request.Limits.MaxStrongContributors, countedGroups).ToList();
        var related = TakeTier(bestByPlayer, "related", request.Limits.MaxRelatedContributors, countedGroups).ToList();
        var support = TakeTier(bestByPlayer, "support", request.Limits.MaxSupportContributors, countedGroups).ToList();
        var supportScore = Math.Min(request.Limits.SupportScoreCap, support.Sum(item => item.WeightedScore));
        var capabilityScore = strong.Sum(item => item.WeightedScore) + related.Sum(item => item.WeightedScore) + supportScore;
        var assetScore = request.AcceptedPersonalItems * request.AssetScores.AcceptedPersonalItem +
                         request.AcceptedBunkerResources * request.AssetScores.AcceptedBunkerResource +
                         request.AcceptedBunkerFacilities * request.AssetScores.AcceptedBunkerFacility +
                         request.ProtectedParticipants * request.AssetScores.ParticipantProtection;
        var preparedScore = request.Plan.BaseScore + capabilityScore + assetScore;
        var total = preparedScore + randomModifier;
        var outcome = total >= request.Thresholds.SafeSuccess ? "safe_success" :
            total >= request.Thresholds.SuccessWithConsequence ? "success_with_consequence" : "failure";
        if (strong.Count == 0 && related.Count == 0 && outcome == "safe_success")
            outcome = "success_with_consequence";
        if (preparedScore >= request.Thresholds.SuccessWithConsequence && total < request.Thresholds.SuccessWithConsequence)
            outcome = "success_with_consequence";
        if (preparedScore < request.Thresholds.SuccessWithConsequence && outcome == "safe_success")
            outcome = "success_with_consequence";
        if (request.Plan.OutcomeCeiling == "success_with_consequence" && outcome == "safe_success")
            outcome = "success_with_consequence";
        return new PlanChoiceScoreResult(outcome, total);
    }

    private static IEnumerable<ClassifiedContribution> TakeTier(
        IEnumerable<ClassifiedContribution> source, string tier, int limit, HashSet<string> countedGroups) =>
        source.Where(item => item.Tier == tier && countedGroups.Add(item.GroupKey))
            .OrderByDescending(item => item.WeightedScore)
            .Take(Math.Max(0, limit));

    private static ClassifiedContribution? Classify(PlanChoiceCapability contribution, PlanChoicePlan plan)
    {
        var tags = new HashSet<string>(contribution.Tags, StringComparer.OrdinalIgnoreCase);
        string tier;
        string group;
        int rank;
        if (plan.StrongAny.FirstOrDefault(tags.Contains) is { } strong)
            (tier, group, rank) = ("strong", $"strong:{strong}", 3);
        else if (plan.RelatedAllGroups.FirstOrDefault(candidate => candidate.Count > 0 && candidate.All(tags.Contains)) is { } related)
            (tier, group, rank) = ("related", $"related:{string.Join('|', related.Order())}", 2);
        else if (plan.SupportAny.FirstOrDefault(tags.Contains) is { } support)
            (tier, group, rank) = ("support", $"support:{support}", 1);
        else return null;
        var multiplier = contribution.SourceType == "hobby" ? 0.65 : 1.0;
        var score = tier == "strong" ? plan.TierScores.Strong : tier == "related" ? plan.TierScores.Related : plan.TierScores.Support;
        return new ClassifiedContribution(tier, group, rank, score * multiplier);
    }

    private sealed record ClassifiedContribution(string Tier, string GroupKey, int Rank, double WeightedScore);
}

public sealed record PlanChoiceScoreResult(string Outcome, double InternalScore);
public sealed record PlanChoiceCapability(string PlayerId, string SourceType, IReadOnlyList<string> Tags);
public sealed record PlanChoiceScoreRequest(
    PlanChoicePlan Plan, IReadOnlyList<PlanChoiceCapability> Capabilities, PlanChoiceLimits Limits,
    PlanChoiceAssetScores AssetScores, PlanChoiceThresholds Thresholds, int AcceptedPersonalItems,
    int AcceptedBunkerResources, int AcceptedBunkerFacilities, int ProtectedParticipants);
public sealed record PlanChoicePlan(string Id, double BaseScore, string OutcomeCeiling, IReadOnlyList<string> StrongAny,
    IReadOnlyList<IReadOnlyList<string>> RelatedAllGroups, IReadOnlyList<string> SupportAny, PlanChoiceTierScores TierScores);
public sealed record PlanChoiceTierScores(double Strong, double Related, double Support);
public sealed record PlanChoiceLimits(int MaxStrongContributors, int MaxRelatedContributors, int MaxSupportContributors, double SupportScoreCap);
public sealed record PlanChoiceAssetScores(double AcceptedPersonalItem, double AcceptedBunkerResource, double AcceptedBunkerFacility, double ParticipantProtection);
public sealed record PlanChoiceThresholds(double SafeSuccess, double SuccessWithConsequence);
