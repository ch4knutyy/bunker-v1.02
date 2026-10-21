using System.Collections.Concurrent;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Bunker.Services;

public sealed record AiTrainingRawStarted(string DecisionId, string SessionId, int Sequence, int Round, string AgentId,
	string Phase, DateTimeOffset AtUtc, JsonElement Observation, JsonElement FullObservation, IReadOnlyList<string> AllowedActions,
	string Provider, string Model, string GenerationMode,
	string PromptVersion, string SchemaVersion);
public sealed record AiTrainingRawAttempt(string Phase, int Attempt, string SystemPrompt, string UserPrompt,
	string? RawResponse, string? ErrorCode, string? ErrorDetail, int? InputTokens, int? OutputTokens,
	int? ReasoningTokens, int? CachedInputTokens, int? TotalTokens, long? DurationMilliseconds,
	string? OutputSchema, JsonElement? OutputSchemaDefinition, bool StructuredOutputRequested,
	int RequestedMaxResponseTokens, double RequestedTemperature, DateTimeOffset AtUtc);
public sealed record AiTrainingRawFinal(string Status, string? ParsedAction, string? NormalizedAction,
	string? ActualAppliedAction, string? TargetPlayerId, string? Speech, bool ServerAccepted,
	string? ValidationError, string? ProviderError, string? ProviderErrorDetail, bool WasFallback,
	bool GenerationSucceeded, int RequestAttempts, DateTimeOffset AtUtc);
public sealed record AiTrainingJournalEntry(int SchemaVersion, string SessionId, string DecisionId, int Sequence,
	string Kind, DateTimeOffset AtUtc, JsonElement Payload);
public sealed class AiTrainingRawDecision
{
	public required AiTrainingRawStarted Started { get; init; }
	public List<AiTrainingRawAttempt> Attempts { get; } = [];
	public AiTrainingRawFinal? Final { get; set; }
	public string Status => Final?.Status ?? (Attempts.Count > 0 ? "Generated" : "Started");
	public bool IsComplete => Final != null;
	public bool ActionValid => Final?.ServerAccepted == true && Final.ValidationError == null;
	public bool GenerationSucceeded => Final?.GenerationSucceeded == true;
	public bool WasFallback => Final?.WasFallback == true;
	public bool LeakSuspected => false; // New observations are materialized before generation.
	public bool RequiresReview => Final?.ProviderError != null || Final?.ValidationError != null ||
		Attempts.Any(item => item.Phase == "Correction" || item.ErrorCode != null);
	public string QualityStatus => !IsComplete || RequiresReview ? "NeedsReview" : Eligible ? "Eligible" : "Excluded";
	public bool Eligible => IsComplete && ActionValid && GenerationSucceeded && !WasFallback && !LeakSuspected && !RequiresReview;
	public string[] ExclusionReasons => new[]
	{
		!IsComplete ? "incomplete" : null,
		!ActionValid ? "invalid_action" : null,
		!GenerationSucceeded ? "generation_failed_or_deterministic" : null,
		WasFallback ? "fallback" : null,
		LeakSuspected ? "leak_suspected" : null,
		RequiresReview ? "requires_review" : null
	}.OfType<string>().ToArray();
}
public sealed record AiTrainingExportFilter(string? SessionId = null, DateTimeOffset? FromUtc = null,
	DateTimeOffset? ToUtc = null, string? SessionStatus = null, string? QualityStatus = null,
	string? Split = null, int Seed = 17, string? ReviewSignal = null, bool Curated = false);

public sealed partial class AiTrainingDatasetStore
{
	private readonly ConcurrentDictionary<string, object> _writeGates = new(StringComparer.OrdinalIgnoreCase);
	private readonly ConcurrentDictionary<string, bool> _liveSessions = new(StringComparer.OrdinalIgnoreCase);
	private object WriteGate(string id) => _writeGates.GetOrAdd(id, _ => new object());
	private string JournalPath(string id) => Path.Combine(SessionPath(id), "raw-decisions.jsonl");

	public string BeginDecision(AiTrainingArena arena, AiTrainingAgent actor, JsonElement observation, IReadOnlyList<string> allowedActions,
		DateTimeOffset atUtc)
	{
		var id = $"{arena.Id}-{arena.Step:D6}";
		if (ReadRaw(arena.Id).Any(item => item.Started.Sequence == arena.Step))
			throw new InvalidOperationException("arena_decision_sequence_duplicate");
		var fullObservation = JsonSerializer.SerializeToElement(new
		{
			self = actor.OwnCharacteristics,
			revealedSelf = actor.RevealedCharacteristics.Keys.OrderBy(key => key, StringComparer.OrdinalIgnoreCase),
			world = new
			{
				apocalypse = arena.Apocalypse == null ? null : new { arena.Apocalypse.Id, arena.Apocalypse.Name,
					arena.Apocalypse.Description, arena.Apocalypse.Severity, arena.Apocalypse.SurvivalChance,
					arena.Apocalypse.Duration, arena.Apocalypse.Threats, arena.Apocalypse.Requirements },
				bunker = arena.Bunker == null ? null : new { arena.Bunker.Id, arena.Bunker.Name,
					arena.Bunker.Description, arena.Bunker.Capacity, arena.Bunker.Location, arena.Bunker.SuppliesMonths,
					arena.Bunker.WaterMonths, arena.Bunker.Condition, arena.Bunker.Facilities,
					arena.Bunker.Resources, arena.Bunker.Problems },
				activeThreats = arena.ThreatHistory.Where(item => item.IsActive)
			},
			others = arena.Agents.Where(item => !item.IsEliminated && item.Id != actor.Id)
				.Select(item => new { item.Id, item.Name, revealed = item.RevealedCharacteristics }),
			claims = arena.Agents.SelectMany(item => item.PublicClaims),
			chat = arena.Messages.TakeLast(20),
			vote = new { arena.VoteCount, arena.Proposal, arena.OpenVotes }
		}, JsonLine);
		var phase = arena.Proposal?.IsOpen == true ? "Voting" : arena.Proposal != null ? "VoteProposal" : "Discussion";
		var started = new AiTrainingRawStarted(id, arena.Id, arena.Step, Math.Max(1, (arena.Step - 1) / Math.Max(1, arena.AgentCount) + 1),
			actor.Id, phase, atUtc, observation, fullObservation, allowedActions.ToArray(),
			arena.Provider, arena.Model, arena.GenerationMode,
			"arena-prompt-v3", "arena-raw-v1");
		AppendJournal(arena.Id, id, arena.Step, "Started", started, atUtc);
		_liveSessions[arena.Id] = true;
		return id;
	}

	public void RecordAttempt(string sessionId, string decisionId, int sequence, AiTrainingRawAttempt attempt) =>
		AppendJournal(sessionId, decisionId, sequence, "Attempt", attempt, attempt.AtUtc);

	public void CompleteDecision(string sessionId, string decisionId, int sequence, AiTrainingRawFinal result) =>
		AppendJournal(sessionId, decisionId, sequence, "Final", result, result.AtUtc);

	public int LastRawSequence(string id) => ReadJournal(id).Select(item => item.Sequence).DefaultIfEmpty(0).Max();

	public IReadOnlyList<AiTrainingRawDecision> ReadRaw(string id)
	{
		var rows = new Dictionary<string, AiTrainingRawDecision>(StringComparer.Ordinal);
		foreach (var entry in ReadJournal(id))
		{
			if (entry.Kind == "Started")
			{
				var started = entry.Payload.Deserialize<AiTrainingRawStarted>(JsonLine);
				if (started != null && !rows.ContainsKey(entry.DecisionId)) rows.Add(entry.DecisionId, new AiTrainingRawDecision { Started = started });
				continue;
			}
			if (!rows.TryGetValue(entry.DecisionId, out var row)) continue;
			if (entry.Kind == "Attempt")
			{
				var attempt = entry.Payload.Deserialize<AiTrainingRawAttempt>(JsonLine);
				if (attempt != null && !row.Attempts.Any(item => item.Phase == attempt.Phase && item.Attempt == attempt.Attempt)) row.Attempts.Add(attempt);
			}
			else if (entry.Kind == "Final" && row.Final == null)
				row.Final = entry.Payload.Deserialize<AiTrainingRawFinal>(JsonLine);
		}
		return rows.Values.OrderBy(item => item.Started.Sequence).ToList();
	}

	public object Statistics(string id)
	{
		var directory = SessionPath(id);
		if (!Directory.Exists(directory)) throw new FileNotFoundException("arena_not_found");
		var rows = ReadRaw(id);
		var legacyPath = Path.Combine(directory, "decisions.jsonl");
		var known = rows.Select(item => item.Started.DecisionId).ToHashSet(StringComparer.Ordinal);
		var legacy = File.Exists(legacyPath) ? ReadLines<AiTrainingDecision>(legacyPath).Count(item => !known.Contains(item.Id)) : 0;
		return new
		{
			sessions = Directory.Exists(directory) ? 1 : 0,
			decisions = rows.Count + legacy,
			eligible = rows.Count(item => item.Eligible),
			excluded = rows.Count(item => !item.Eligible) + legacy,
			stopped = Load(id)?.Status == AiTrainingArenaStatus.Cancelled ? 1 : 0,
			errors = rows.Count(item => item.Final?.ProviderError != null || item.Final?.ValidationError != null ||
				item.Attempts.Any(attempt => attempt.ErrorCode != null || attempt.Phase == "Correction")),
			approximateStoreBytes = Directory.Exists(directory) ? Directory.GetFiles(directory).Sum(file => new FileInfo(file).Length) : 0
		};
	}

	public byte[] ExportDataset(bool sft, AiTrainingExportFilter filter)
	{
		if (filter.Curated && !sft) throw new InvalidOperationException("arena_curated_requires_sft");
		var sessionsRoot = Path.Combine(_root, "sessions");
		if (!Directory.Exists(sessionsRoot)) throw new FileNotFoundException("arena_dataset_not_found");
		if (filter.SessionId != null && !Directory.Exists(SessionPath(filter.SessionId))) throw new FileNotFoundException("arena_not_found");
		IEnumerable<string> sessionIds = filter.SessionId == null
			? Directory.GetDirectories(sessionsRoot).Select(Path.GetFileName).OfType<string>().OrderBy(id => id, StringComparer.Ordinal)
			: new[] { filter.SessionId! };
		var lines = new List<string>();
		var included = 0;
		var excluded = 0;
		var legacy = 0;
		var selectedSessions = 0;
		var sessionLines = new List<string>();
		var eventLines = new List<string>();
		var trainingRows = new List<(AiTrainingArena Arena, AiTrainingRawDecision Row)>();
		var splitSessions = new List<AiTrainingSplitAssignment>();
		foreach (var id in sessionIds)
		{
			var arena = Load(id);
			if (arena == null || (filter.FromUtc.HasValue && arena.StartedAtUtc < filter.FromUtc.Value) ||
				(filter.ToUtc.HasValue && arena.StartedAtUtc > filter.ToUtc.Value)) continue;
			var sessionStatus = SessionStatus(arena);
			if (filter.SessionStatus != null && !string.Equals(filter.SessionStatus, sessionStatus, StringComparison.OrdinalIgnoreCase)) continue;
			var split = TrainingSplit(arena, filter.Seed);
			if (filter.Split != null && !string.Equals(filter.Split, split, StringComparison.OrdinalIgnoreCase)) continue;
			selectedSessions++;
			splitSessions.Add(new AiTrainingSplitAssignment(id, split, ScenarioFamily(arena), arena.Apocalypse?.Id, arena.Bunker?.Id));
			sessionLines.Add(JsonSerializer.Serialize(SessionRecord(arena), JsonLine));
			var eventPath = Path.Combine(SessionPath(id), "events.jsonl");
			if (File.Exists(eventPath)) eventLines.AddRange(ReadLines<AiTrainingEvent>(eventPath)
				.DistinctBy(item => item.Id).OrderBy(item => item.Step).ThenBy(item => item.AtUtc)
				.Select(item => JsonSerializer.Serialize(new { sessionId = id, @event = item }, JsonLine)));
			var raw = ReadRaw(id);
			var curated = filter.Curated ? ReadEnhancements(id).Where(item => item.Status == "Completed")
				.GroupBy(item => item.RawDecisionId, StringComparer.Ordinal)
				.ToDictionary(group => group.Key, group => group.OrderByDescending(item => item.AtUtc).First(), StringComparer.Ordinal)
				: new Dictionary<string, AiTrainingEnhancement>(StringComparer.Ordinal);
			foreach (var row in raw)
			{
				if (filter.QualityStatus != null && !string.Equals(filter.QualityStatus, row.QualityStatus, StringComparison.OrdinalIgnoreCase)) continue;
				if (filter.ReviewSignal != null && !TrainingReviewSignals(row).Contains(filter.ReviewSignal, StringComparer.OrdinalIgnoreCase)) continue;
				if (sft && !row.Eligible) { excluded++; continue; }
				curated.TryGetValue(row.Started.DecisionId, out var enhancement);
				if (filter.Curated && (enhancement == null || row.Final?.Speech == null ||
					enhancement.OriginalSha256 != OriginalSpeechHash(row.Final.Speech))) { excluded++; continue; }
				var payload = filter.Curated ? CuratedPayload(row, arena, enhancement!) : sft ? (object)new
				{
					schemaVersion = "arena-sft-v1", decisionId = row.Started.DecisionId, sessionId = id,
					row.Started.Sequence, row.Started.Round, row.Started.Phase, row.Started.AgentId,
					row.Started.PromptVersion, row.Started.SchemaVersion,
					row.Started.Provider, row.Started.Model, observation = row.Started.FullObservation,
					teacherVisibleState = row.Started.Observation,
					allowedActions = row.Started.AllowedActions,
					reviewSignals = TrainingReviewSignals(row),
					inference = InferenceExample(row, arena),
					action = new { type = row.Final!.ActualAppliedAction, targetPlayerId = row.Final.TargetPlayerId,
						speech = row.Final.Speech }
				} : new
				{
					schemaVersion = "arena-raw-v1", sessionId = id,
					status = row.Final?.Status ?? (sessionStatus == "Failed" ? "Failed" : (sessionStatus is "Interrupted" or "Stopped") ? "Interrupted" : row.Status),
					decision = row.Started, attempts = row.Attempts, result = row.Final,
					row.IsComplete, row.ActionValid, row.GenerationSucceeded, row.WasFallback,
					row.LeakSuspected, row.RequiresReview, row.QualityStatus, row.ExclusionReasons,
					reviewSignals = TrainingReviewSignals(row)
				};
				lines.Add(JsonSerializer.Serialize(payload, JsonLine)); included++;
				trainingRows.Add((arena, row));
			}
			var knownIds = raw.Select(item => item.Started.DecisionId).ToHashSet(StringComparer.Ordinal);
			var legacyPath = Path.Combine(SessionPath(id), "decisions.jsonl");
			if (sft && File.Exists(legacyPath))
			{
				var quarantined = ReadLines<AiTrainingDecision>(legacyPath).Count(item => !knownIds.Contains(item.Id));
				excluded += quarantined; legacy += quarantined;
			}
			if (!sft && File.Exists(legacyPath)) foreach (var decision in ReadLines<AiTrainingDecision>(legacyPath))
			{
				if (knownIds.Contains(decision.Id)) continue;
				if (filter.QualityStatus != null && !string.Equals(filter.QualityStatus, "Quarantined", StringComparison.OrdinalIgnoreCase)) continue;
				if (filter.ReviewSignal != null) continue;
				lines.Add(JsonSerializer.Serialize(new { schemaVersion = "arena-legacy-v1", sessionId = id,
					legacyDecision = decision, isComplete = true, actionValid = false, generationSucceeded = false,
					wasFallback = decision.FallbackWait, leakSuspected = true, requiresReview = true,
					qualityStatus = "Quarantined", exclusionReasons = new[] { "legacy_observation_unverified" } }, JsonLine));
				included++; legacy++;
			}
		}
		var data = Encoding.UTF8.GetBytes(string.Join("\n", lines) + (lines.Count == 0 ? "" : "\n"));
		if (data.Length > 100_000_000) throw new InvalidOperationException("arena_export_too_large_filter_sessions");
		var exportedDecisions = trainingRows.Select(item => item.Row.Started.DecisionId).ToHashSet(StringComparer.Ordinal);
		var preferenceLines = (sft && !filter.Curated ? splitSessions.Where(session => session.Split != "test") : Enumerable.Empty<AiTrainingSplitAssignment>())
			.SelectMany(session =>
		{
			var path = Path.Combine(SessionPath(session.SessionId), "preferences.jsonl");
			return File.Exists(path) ? ReadLines<AiTrainingPreferenceRecord>(path)
				.Where(item => exportedDecisions.Contains(item.DecisionId)).Select(item => JsonSerializer.Serialize(item, JsonLine))
				.ToArray() : Array.Empty<string>();
		}).ToArray();
		var preferenceData = Encoding.UTF8.GetBytes(string.Join("\n", preferenceLines) + (preferenceLines.Length == 0 ? "" : "\n"));
		var sessionsData = Encoding.UTF8.GetBytes(string.Join("\n", sessionLines) + (sessionLines.Count == 0 ? "" : "\n"));
		var eventsData = Encoding.UTF8.GetBytes(string.Join("\n", eventLines) + (eventLines.Count == 0 ? "" : "\n"));
		var manifest = JsonSerializer.SerializeToUtf8Bytes(new
		{
			schemaVersion = "arena-export-v1", format = filter.Curated ? "curated" : sft ? "sft" : "raw", filter,
			sessions = selectedSessions, events = eventLines.Count, preferences = preferenceLines.Length,
			included, excluded, legacyQuarantined = legacy,
			sha256 = Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant(),
			sessionsSha256 = Convert.ToHexString(SHA256.HashData(sessionsData)).ToLowerInvariant(),
			eventsSha256 = Convert.ToHexString(SHA256.HashData(eventsData)).ToLowerInvariant()
		}, Json);
		using var stream = new MemoryStream();
		using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, true))
		{
			WriteZipEntry(zip, filter.Curated ? "curated.jsonl" : sft ? "sft.jsonl" : "raw.jsonl", data);
			WriteZipEntry(zip, "sessions.jsonl", sessionsData);
			if (!sft) WriteZipEntry(zip, "events.jsonl", eventsData);
			if (sft && !filter.Curated) WriteZipEntry(zip, "preferences.jsonl", preferenceData);
			WriteZipEntry(zip, "training-manifest.json", JsonSerializer.SerializeToUtf8Bytes(
				TrainingManifest(trainingRows, splitSessions, filter), Json));
			WriteZipEntry(zip, "manifest.json", manifest);
		}
		return stream.ToArray();
	}

	private static object CuratedPayload(AiTrainingRawDecision row, AiTrainingArena arena, AiTrainingEnhancement enhancement) => new
	{
		schemaVersion = "arena-curated-v1", decisionId = row.Started.DecisionId, sessionId = arena.Id,
		row.Started.Sequence, row.Started.Round, row.Started.Phase, row.Started.AgentId,
		row.Started.PromptVersion, row.Started.SchemaVersion,
		row.Started.Provider, row.Started.Model, observation = row.Started.FullObservation,
		teacherVisibleState = row.Started.Observation, allowedActions = row.Started.AllowedActions,
		inference = InferenceExample(row, arena, enhancement.RewrittenSpeech),
		action = new { type = row.Final!.ActualAppliedAction, targetPlayerId = row.Final.TargetPlayerId,
			speech = enhancement.RewrittenSpeech },
		enhancement = new { enhancement.EditorVersion, enhancement.OriginalSha256, enhancement.Provider,
			enhancement.Model, enhancement.PromptVersion, enhancement.SchemaVersion,
			enhancement.LanguageScore, enhancement.StrategicScore, enhancement.Status }
	};

	private static object InferenceExample(AiTrainingRawDecision row, AiTrainingArena arena, string? speechOverride = null)
	{
		var full = row.Started.FullObservation;
		var visible = row.Started.Observation;
		return new
		{
			formatVersion = "arena-inference-v1",
			task = "Choose one allowed action. Return JSON with action, targetPlayerId and message (Ukrainian speech).",
			input = BuildInferenceInput(arena.Agents.FirstOrDefault(agent => agent.Id == row.Started.AgentId)?.Name,
				row.Started.Phase, visible.GetProperty("world"), full.GetProperty("self"),
				full.TryGetProperty("revealedSelf", out var revealedSelf) ? (object)revealedSelf : null,
				full.GetProperty("others"), visible.GetProperty("claims"), visible.GetProperty("vote"), row.Started.AllowedActions),
			output = new
			{
				action = row.Final!.ActualAppliedAction,
				targetPlayerId = row.Final.TargetPlayerId,
				message = speechOverride ?? row.Final.Speech
			}
		};
	}

	internal static object BuildInferenceInput(string? name, string phase, JsonElement world, object ownCard,
		object? revealedOwn, object publicFacts, object claims, object vote, IReadOnlyList<string> allowedActions) => new
	{
		name, phase,
		apocalypse = world.GetProperty("apocalypse"),
		bunker = world.GetProperty("bunker"),
		currentThreats = world.GetProperty("currentThreats"),
		ownCard, revealedOwn, publicFacts, claims, vote, allowedActions
	};

	private static string SessionStatus(AiTrainingArena arena) => arena.Status switch
	{
		AiTrainingArenaStatus.Finished when arena.LastIntervention == null => "Completed",
		AiTrainingArenaStatus.Finished => "Stopped",
		AiTrainingArenaStatus.Cancelled => "Stopped",
		AiTrainingArenaStatus.Faulted => "Failed",
		AiTrainingArenaStatus.Paused when arena.LastIntervention == "interrupted_restart" => "Interrupted",
		_ => "Active"
	};
	private object SessionRecord(AiTrainingArena arena) => new
	{
		schemaVersion = "arena-raw-v1", sessionId = arena.Id, status = SessionStatus(arena),
		createdAtUtc = arena.StartedAtUtc,
		updatedAtUtc = Directory.GetFiles(SessionPath(arena.Id)).Max(file => File.GetLastWriteTimeUtc(file)),
		endedAtUtc = arena.EndedAtUtc, reason = arena.LastIntervention,
		outcome = arena.Status == AiTrainingArenaStatus.Finished && arena.LastIntervention == null
			? arena.Agents.Where(agent => !agent.IsEliminated).Select(agent => agent.Id).ToArray() : null,
		ruleVersion = "ai-training-arena-v2",
		config = new { arena.Provider, arena.Model, arena.GenerationMode, arena.SpeedPreset, arena.AgentCount,
			enabledCharacteristics = arena.EnabledCharacteristics.OrderBy(item => item, StringComparer.Ordinal),
			apocalypseId = arena.Apocalypse?.Id, bunkerId = arena.Bunker?.Id }
	};
	private void AppendJournal<T>(string sessionId, string decisionId, int sequence, string kind, T payload, DateTimeOffset atUtc) =>
		Append(sessionId, "raw-decisions.jsonl", new AiTrainingJournalEntry(1, sessionId, decisionId, sequence, kind, atUtc,
			JsonSerializer.SerializeToElement(payload, JsonLine)));
	private IEnumerable<AiTrainingJournalEntry> ReadJournal(string id) => File.Exists(JournalPath(id))
		? ReadLines<AiTrainingJournalEntry>(JournalPath(id)) : Enumerable.Empty<AiTrainingJournalEntry>();
	private static IEnumerable<T> ReadLines<T>(string path)
	{
		var lines = File.ReadAllLines(path, Encoding.UTF8);
		using var tail = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
		var endsWithNewline = tail.Length == 0;
		if (tail.Length > 0) { tail.Position = tail.Length - 1; endsWithNewline = tail.ReadByte() == '\n'; }
		for (var index = 0; index < lines.Length; index++)
		{
			if (string.IsNullOrWhiteSpace(lines[index])) continue;
			T? value;
			var tornTail = false;
			try { value = JsonSerializer.Deserialize<T>(lines[index], JsonLine); }
			catch (JsonException) when (index == lines.Length - 1 && !endsWithNewline) { value = default; tornTail = true; }
			catch (JsonException exception) { throw new InvalidDataException($"Corrupt dataset journal at {path}:{index + 1}", exception); }
			if (tornTail) yield break;
			if (value is not null) yield return value;
		}
	}
	private static void WriteZipEntry(ZipArchive zip, string name, byte[] contents)
	{
		var entry = zip.CreateEntry(name, CompressionLevel.Fastest);
		using var output = entry.Open();
		output.Write(contents);
	}
}
