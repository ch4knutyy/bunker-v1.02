using Bunker.Models;

namespace Bunker.Services;

public sealed class ApocalypseActivationScheduler(
    ApocalypseEffectEngine engine,
    TimeProvider timeProvider)
{
    private const int HistoryLimit = 50;

    public ApocalypseActivationExecutionResult TryActivate(
        Room room,
        string trigger,
        int round,
        string occurrenceDiscriminator)
    {
        var apocalypse = room.Apocalypse;
        var policy = room.ApocalypseActivationPolicy;
        if (apocalypse?.Gameplay?.Interactive != true || policy?.Enabled != true ||
            !string.Equals(policy.Trigger, trigger, StringComparison.OrdinalIgnoreCase))
            return new(false, false, null, null);

        var occurrenceKey = BuildOccurrenceKey(policy, trigger, occurrenceDiscriminator);
        lock (room.ApocalypseEffectSyncRoot)
        {
            var runtime = room.ApocalypseEffectRuntime ??= new ApocalypseEffectRuntimeState();
            if (runtime.ProcessedOccurrenceKeys.Contains(occurrenceKey))
                return new(false, true, null, null);

            if (!IsDue(policy, runtime, round))
                return new(false, false, null, null);

            // Claim before execution. A failed occurrence is never replayed, while a
            // later canonical occurrence remains eligible for a retry.
            runtime.ProcessedOccurrenceKeys.Add(occurrenceKey);
            var execution = engine.Execute(room, apocalypse);
            var activationNumber = runtime.SuccessfulActivationCount + 1;
            var sequenceId = ++runtime.NextSequenceId;
            var activationId = $"apocalypse-activation-{sequenceId}";
            var record = new ApocalypseEffectActivationRecord
            {
                SequenceId = sequenceId,
                ActivationId = activationId,
                OccurrenceKey = occurrenceKey,
                OccurredAtUtc = timeProvider.GetUtcNow(),
                ApocalypseId = policy.ApocalypseId,
                EffectProfileId = policy.EffectProfileId,
                Trigger = trigger,
                Round = round,
                ActivationNumber = activationNumber,
                Result = execution.Success ? "success" : "failed",
                EffectTypes = execution.EffectTypes,
                AffectedPlayerCount = execution.AffectedPlayerCount,
                FailureCode = execution.FailureCode,
                PublicSummaryCode = execution.PublicSummaryCode
            };

            if (execution.Success)
            {
                runtime.SuccessfulActivationCount++;
                runtime.LastSuccessfulActivationKey = occurrenceKey;
                runtime.LastSuccessfulRound = round;
                runtime.LastSuccessfulTrigger = trigger;
            }
            else
            {
                runtime.FailedActivationCount++;
            }

            runtime.History.Add(record);
            if (runtime.History.Count > HistoryLimit)
                runtime.History.RemoveRange(0, runtime.History.Count - HistoryLimit);

            return new(true, false, record, execution);
        }
    }

    public static string BuildOccurrenceKey(
        ResolvedApocalypseActivationPolicy policy,
        string trigger,
        string occurrenceDiscriminator) =>
        $"{policy.ApocalypseId}:{policy.EffectProfileId}:{trigger}:{occurrenceDiscriminator}".ToLowerInvariant();

    private static bool IsDue(
        ResolvedApocalypseActivationPolicy policy,
        ApocalypseEffectRuntimeState runtime,
        int round)
    {
        if (round < policy.FirstRound) return false;
        if (policy.MaxActivations is int max && runtime.SuccessfulActivationCount >= max) return false;
        if (string.Equals(policy.ScheduleMode, "once", StringComparison.OrdinalIgnoreCase))
            return runtime.SuccessfulActivationCount == 0;
        if (runtime.LastSuccessfulRound is not int lastRound) return true;
        return round >= lastRound + Math.Max(1, policy.IntervalRounds ?? 1);
    }
}
