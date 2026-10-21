using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Bunker.Services;

public sealed record AiTrainingSplitAssignment(string SessionId, string Split, string ScenarioFamily,
	string? ApocalypseId, string? BunkerId);
public sealed record AiTrainingPreferenceCandidate(string Action, string? TargetPlayerId, string? Message);
public sealed record AiTrainingPreferenceInput(string SessionId, string DecisionId,
	AiTrainingPreferenceCandidate Preferred, AiTrainingPreferenceCandidate Rejected,
	string Criterion, double Uncertainty);
public sealed record AiTrainingPreferenceRecord(string Id, string SessionId, string DecisionId,
	string ObservationSha256, AiTrainingPreferenceCandidate Preferred, AiTrainingPreferenceCandidate Rejected,
	string Criterion, string JudgmentSource, double Uncertainty, DateTimeOffset AtUtc);
public sealed record AiTrainingOfflinePrediction(string SessionId, string DecisionId,
	AiTrainingPreferenceCandidate Candidate, string? OpponentType = null);

public sealed partial class AiTrainingDatasetStore
{
	public AiTrainingPreferenceRecord AddPreference(AiTrainingPreferenceInput input)
	{
		var row = ReadRaw(input.SessionId).FirstOrDefault(item => item.Started.DecisionId == input.DecisionId && item.Eligible)
			?? throw new InvalidOperationException("arena_preference_decision_not_eligible");
		if (input.Preferred is null || input.Rejected is null ||
			string.IsNullOrWhiteSpace(input.Criterion) || input.Criterion.Length > 80 ||
			!double.IsFinite(input.Uncertainty) || input.Uncertainty is < 0 or > 1 ||
			input.Preferred == input.Rejected ||
			!CandidateFitsObservation(row, input.Preferred) || !CandidateFitsObservation(row, input.Rejected))
			throw new InvalidOperationException("arena_preference_invalid");
		var observationHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
			row.Started.Observation.GetRawText() + row.Started.FullObservation.GetRawText()))).ToLowerInvariant();
		var record = new AiTrainingPreferenceRecord(Guid.NewGuid().ToString("N"), input.SessionId,
			input.DecisionId, observationHash, input.Preferred, input.Rejected, input.Criterion.Trim(),
			"DeveloperReview", input.Uncertainty, DateTimeOffset.UtcNow);
		Append(input.SessionId, "preferences.jsonl", record);
		return record;
	}

	private static bool CandidateFitsObservation(AiTrainingRawDecision row, AiTrainingPreferenceCandidate candidate)
	{
		if (!Enum.TryParse<AiTrainingAction>(candidate.Action, false, out var action) ||
			!row.Started.AllowedActions.Contains(action.ToString(), StringComparer.Ordinal) ||
			candidate.Message is { Length: > 500 }) return false;
		if (action is AiTrainingAction.Speak or AiTrainingAction.ProposeAlliance)
			return !string.IsNullOrWhiteSpace(candidate.Message);
		if (action == AiTrainingAction.RevealCharacteristic)
		{
			var full = row.Started.FullObservation;
			if (!full.TryGetProperty("revealedSelf", out var revealed)) return false;
			return candidate.TargetPlayerId != null && full.GetProperty("self").TryGetProperty(candidate.TargetPlayerId, out _) &&
				!revealed.EnumerateArray().Any(item => item.GetString() == candidate.TargetPlayerId);
		}
		if (action == AiTrainingAction.CastVote)
			return candidate.TargetPlayerId != null &&
				(candidate.TargetPlayerId == row.Started.AgentId || row.Started.FullObservation.GetProperty("others")
					.EnumerateArray().Any(item => item.GetProperty("id").GetString() == candidate.TargetPlayerId));
		return true;
	}

	public object EvaluateOffline(IReadOnlyList<AiTrainingOfflinePrediction> predictions, int seed = 17)
	{
		if (predictions.Count > 10_000) throw new InvalidOperationException("arena_evaluation_too_large");
		if (predictions.Any(item => item is null || item.Candidate is null || string.IsNullOrWhiteSpace(item.SessionId)))
			throw new InvalidOperationException("arena_evaluation_invalid_prediction");
		var accepted = new List<(AiTrainingRawDecision Row, AiTrainingOfflinePrediction Prediction)>();
		foreach (var group in predictions.GroupBy(item => item.SessionId, StringComparer.OrdinalIgnoreCase))
		{
			var arena = Load(group.Key);
			if (arena == null) continue;
			if (TrainingSplit(arena, seed) != "test") continue;
			var rows = ReadRaw(group.Key).Where(item => item.Eligible)
				.ToDictionary(item => item.Started.DecisionId, StringComparer.Ordinal);
			foreach (var prediction in group.DistinctBy(item => item.DecisionId))
				if (rows.TryGetValue(prediction.DecisionId, out var row)) accepted.Add((row, prediction));
		}
		return new
		{
			schemaVersion = "arena-offline-eval-v1", seed, partition = "test",
			submitted = predictions.Count, evaluated = accepted.Count,
			submittedOpponentTypes = predictions.GroupBy(item => item.OpponentType ?? "unspecified")
				.ToDictionary(group => group.Key, group => group.Count()),
			byOpponentType = accepted.GroupBy(item => item.Prediction.OpponentType ?? "unspecified")
				.Select(group => new { opponentType = group.Key, evaluated = group.Count(),
					validActionRate = Rate(group.Count(item => CandidateFitsObservation(item.Row, item.Prediction.Candidate)), group.Count()),
					actionAgreement = Rate(group.Count(item => item.Prediction.Candidate.Action == item.Row.Final?.ActualAppliedAction), group.Count()) }),
			validActionRate = Rate(accepted.Count(item => CandidateFitsObservation(item.Row, item.Prediction.Candidate)), accepted.Count),
			actionAgreement = Rate(accepted.Count(item => item.Prediction.Candidate.Action == item.Row.Final?.ActualAppliedAction), accepted.Count),
			targetAgreement = Rate(accepted.Count(item => item.Prediction.Candidate.Action == item.Row.Final?.ActualAppliedAction &&
				item.Prediction.Candidate.TargetPlayerId == item.Row.Final?.TargetPlayerId), accepted.Count),
			speechPresentRate = Rate(accepted.Count(item => !string.IsNullOrWhiteSpace(item.Prediction.Candidate.Message)), accepted.Count),
			limitations = new[] { "historical_action_agreement_is_not_game_quality", "speech_naturalness_requires_human_review",
				"opponent_robustness_requires_separate_scenarios_and_opponents" }
		};
	}
	private static double? Rate(int numerator, int denominator) => denominator == 0 ? null : (double)numerator / denominator;

	private static string[] TrainingReviewSignals(AiTrainingRawDecision row)
	{
		var signals = new List<string> { "privacy_not_semantically_verified", "relevance_not_semantically_verified",
			"naturalness_not_semantically_verified" };
		if (!row.ActionValid) signals.Add("rules_or_action_invalid");
		if (row.Attempts.Any(attempt => attempt.ErrorCode != null || attempt.Phase == "Correction"))
			signals.Add("json_syntax_or_generation_repaired");
		var speech = row.Final?.Speech?.Trim();
		if (row.Final?.ActualAppliedAction is nameof(AiTrainingAction.Speak) or nameof(AiTrainingAction.ProposeAlliance))
		{
			if (string.IsNullOrWhiteSpace(speech)) signals.Add("speech_missing");
			else if (speech.Length < 20) signals.Add("possible_low_specificity");
			if (speech != null && speech.Split(' ', StringSplitOptions.RemoveEmptyEntries).Chunk(3)
				.Any(chunk => chunk.Length == 3 && chunk.All(word => string.Equals(word, chunk[0], StringComparison.OrdinalIgnoreCase))))
				signals.Add("possible_word_repetition");
		}
		return signals.ToArray();
	}

	private static string ScenarioFamily(AiTrainingArena arena) =>
		$"{arena.Apocalypse?.Id ?? "unknown"}|{arena.Bunker?.Id ?? "unknown"}";

	private static string TrainingSplit(AiTrainingArena arena, int seed)
	{
		// Keep all sessions with the same scenario pair in one partition.
		var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{seed}|{ScenarioFamily(arena)}"));
		var bucket = BitConverter.ToUInt32(hash, 0) % 10;
		return bucket < 8 ? "train" : bucket == 8 ? "validation" : "test";
	}

	private static object TrainingManifest(IReadOnlyList<(AiTrainingArena Arena, AiTrainingRawDecision Row)> rows,
		IReadOnlyList<AiTrainingSplitAssignment> sessions, AiTrainingExportFilter filter)
	{
		static object Counts(IEnumerable<string> values) => values.GroupBy(value => value, StringComparer.OrdinalIgnoreCase)
			.OrderBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
			.ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);
		static string Value(JsonElement root, params string[] path)
		{
			foreach (var part in path)
			{
				if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(part, out var next)) return "unknown";
				root = next;
			}
			return root.ValueKind == JsonValueKind.String ? root.GetString() ?? "unknown" : "unknown";
		}
		var fingerprints = rows.Select(item => new
		{
			hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
				item.Row.Started.Observation.GetRawText() + item.Row.Started.FullObservation.GetRawText() +
				item.Row.Final?.ActualAppliedAction + item.Row.Final?.Speech))),
			split = TrainingSplit(item.Arena, filter.Seed)
		}).ToArray();
		var hashes = fingerprints.Select(item => item.hash).ToArray();
		var duplicates = hashes.Length - hashes.Distinct(StringComparer.Ordinal).Count();
		var crossSplitDuplicates = fingerprints.GroupBy(item => item.hash)
			.Count(group => group.Select(item => item.split).Distinct(StringComparer.Ordinal).Skip(1).Any());
		var decisions = rows.Select(item => item.Row).ToArray();
		var bluffs = rows.Count(item => item.Arena.Decisions.Any(decision =>
			decision.Id == item.Row.Started.DecisionId && decision.ExplicitBluffs?.Count > 0));
		var shortages = rows.Count(item =>
		{
			var bunker = item.Row.Started.FullObservation.GetProperty("world").GetProperty("bunker");
			return bunker.ValueKind == JsonValueKind.Object &&
				((bunker.TryGetProperty("suppliesMonths", out var supplies) && supplies.ValueKind == JsonValueKind.Number && supplies.TryGetInt32(out var months) && months < 6) ||
				 (bunker.TryGetProperty("waterMonths", out var water) && water.ValueKind == JsonValueKind.Number && water.TryGetInt32(out var waterMonths) && waterMonths < 6));
		});
		var crossSplitFamilies = sessions.GroupBy(item => item.ScenarioFamily)
			.Count(group => group.Select(item => item.Split).Distinct(StringComparer.Ordinal).Skip(1).Any());
		var sharedComponents = sessions.GroupBy(item => item.ApocalypseId).Count(group => group.Key != null &&
			group.Select(item => item.Split).Distinct(StringComparer.Ordinal).Skip(1).Any()) +
			sessions.GroupBy(item => item.BunkerId).Count(group => group.Key != null &&
				group.Select(item => item.Split).Distinct(StringComparer.Ordinal).Skip(1).Any());
		return new
		{
			schemaVersion = "arena-training-manifest-v1", filter, splitSeed = filter.Seed,
			splitMethod = "sha256(seed|apocalypseId|bunkerId); 80/10/10 by scenario family",
			sessions, counts = new { sessions = sessions.Count, decisions = decisions.Length,
				splits = Counts(sessions.Select(item => item.Split)),
				promptVersions = Counts(decisions.Select(item => item.Started.PromptVersion)),
				observationSchemaVersions = Counts(decisions.Select(item => item.Started.SchemaVersion)),
				apocalypses = Counts(sessions.Select(item => item.ApocalypseId ?? "unknown")),
				bunkers = Counts(sessions.Select(item => item.BunkerId ?? "unknown")),
				threats = Counts(rows.SelectMany(item => item.Row.Started.Observation.GetProperty("world")
					.GetProperty("currentThreats").EnumerateArray().Select(threat => Value(threat, "Id")))),
				actions = Counts(decisions.Select(item => item.Final?.ActualAppliedAction ?? "unknown")),
				resourceShortageObservations = shortages,
				revealActions = decisions.Count(item => item.Final?.ActualAppliedAction == nameof(AiTrainingAction.RevealCharacteristic)),
				voteActions = decisions.Count(item => item.Final?.ActualAppliedAction is nameof(AiTrainingAction.ProposeVote) or nameof(AiTrainingAction.CastVote)),
				bluffActions = bluffs,
				reviewSignals = Counts(decisions.SelectMany(TrainingReviewSignals)),
				duplicateExamples = duplicates },
			dataLeakageAudit = new { crossSplitScenarioFamilies = crossSplitFamilies,
				crossSplitDuplicateExamples = crossSplitDuplicates,
				sharedIndividualScenarioComponents = sharedComponents, scope = "selected_sessions_only" },
			unverifiedCoverage = new[] { "bluff_intent_for_legacy_records", "strong_vs_weak_cards_without_validated_rating", "semantic_quality", "opponent_diversity" }
		};
	}
}
