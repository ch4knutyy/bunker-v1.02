using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Microsoft.Extensions.Options;

namespace Bunker.Services;

public sealed class AiTrainingLlmEditorOptions
{
	public const string SectionName = "AiTrainingLlmEditor";
	public bool Enabled { get; set; }
	public string Provider { get; set; } = "OpenAICompatible";
	public string Endpoint { get; set; } = "";
	public string Model { get; set; } = "";
	public string ApiKey { get; set; } = ""; // Set only through secrets or server environment.
	public string EditorVersion { get; set; } = "v1";
	public int TimeoutSeconds { get; set; } = 45;
	public int MaxOutputTokens { get; set; } = 800;
	public double Temperature { get; set; } = .45;
	public int BatchSize { get; set; } = 4;
	public int MaxConcurrency { get; set; } = 1;
	public int QueueCapacity { get; set; } = 8;
	public int MaxRetries { get; set; } = 1;
	public long MaxTotalTokensPerProcess { get; set; } = 100_000;
}

public sealed class AiTrainingLlmEditorService : BackgroundService
{
	private const string PromptVersion = "arena-editor-v1";
	private const string SchemaVersion = "arena-enhancement-v1";
	private readonly AiTrainingDatasetStore _store;
	private readonly IHttpClientFactory _clients;
	private readonly ILogger<AiTrainingLlmEditorService> _logger;
	private readonly AiTrainingLlmEditorOptions _options;
	private readonly Channel<EditorJob> _queue;
	private readonly ConcurrentDictionary<string, byte> _queued = new(StringComparer.Ordinal);
	private readonly object _enqueueGate = new();
	private long _reservedTokens;
	private sealed record EditorJob(string SessionId, int Round, string Key);
	private sealed record EditorItem(AiTrainingRawDecision Raw, string Name);

	public AiTrainingLlmEditorService(AiTrainingDatasetStore store, IHttpClientFactory clients,
		IOptions<AiTrainingLlmEditorOptions> options, ILogger<AiTrainingLlmEditorService> logger)
	{
		_store = store; _clients = clients; _options = options.Value; _logger = logger;
		_queue = Channel.CreateBounded<EditorJob>(new BoundedChannelOptions(Math.Clamp(_options.QueueCapacity, 1, 32))
		{ FullMode = BoundedChannelFullMode.Wait, SingleReader = false, SingleWriter = false });
	}

	public bool Enabled => _options.Enabled;
	public void TryEnqueue(string sessionId, int round)
	{
		if (!Enabled || round < 1) return;
		var key = $"{sessionId}:{round}:{_options.EditorVersion}";
		if (!_queued.TryAdd(key, 0)) return;
		var queued = false;
		try
		{
			lock (_enqueueGate)
			{
				if (_store.HasEditorBatch(sessionId, key)) return;
				var job = new EditorJob(sessionId, round, key);
				_store.AppendEditorBatch(new(key, sessionId, round, _options.EditorVersion,
					"Pending", 0, 0, 0, 0, null, DateTimeOffset.UtcNow));
				queued = _queue.Writer.TryWrite(job);
				if (!queued) _store.AppendEditorBatch(new(key, sessionId, round, _options.EditorVersion,
					"Skipped", 0, 0, 0, 0, "editor_queue_full", DateTimeOffset.UtcNow));
			}
		}
		catch (Exception exception) { _logger.LogWarning("Arena editor enqueue failed for session {SessionId}: {ErrorType}", sessionId, exception.GetType().Name); }
		finally { if (!queued) _queued.TryRemove(key, out _); }
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken)
	{
		try { _store.RecoverEditorBatches(); }
		catch (Exception exception) { _logger.LogWarning("Arena editor restart recovery failed: {ErrorType}", exception.GetType().Name); }
		if (!Enabled) return;
		var workers = Enumerable.Range(0, Math.Clamp(_options.MaxConcurrency, 1, 2))
			.Select(_ => ConsumeAsync(stoppingToken));
		await Task.WhenAll(workers);
	}

	private async Task ConsumeAsync(CancellationToken token)
	{
		await foreach (var job in _queue.Reader.ReadAllAsync(token))
		{
			try
			{
				lock (_enqueueGate) { } // Pending is durable before processing starts.
				await ProcessAsync(job, token);
			}
			catch (OperationCanceledException) when (token.IsCancellationRequested) { return; }
			catch (Exception exception)
			{
				_logger.LogWarning("Arena editor batch failed for session {SessionId}, round {Round}: {ErrorType}", job.SessionId, job.Round, exception.GetType().Name);
				try
				{
					var last = _store.ReadEditorBatches(job.SessionId).LastOrDefault(item => item.Key == job.Key);
					_store.AppendEditorBatch((last ?? new(job.Key, job.SessionId, job.Round, _options.EditorVersion,
						"Processing", 0, 0, 0, 0, null, DateTimeOffset.UtcNow)) with
					{ Status = "Failed", ErrorCode = "editor_batch_failed", AtUtc = DateTimeOffset.UtcNow });
				}
				catch (Exception storageException)
				{ _logger.LogWarning("Arena editor failure status could not be stored: {ErrorType}", storageException.GetType().Name); }
			}
			finally { _queued.TryRemove(job.Key, out _); }
		}
	}

	private async Task ProcessAsync(EditorJob job, CancellationToken token)
	{
		var arena = _store.Load(job.SessionId);
		if (arena == null) { RecordBatch(job, "Failed", 0, 0, 0, 0, "arena_not_found"); return; }
		var items = _store.ReadRaw(job.SessionId)
			.Where(row => row.Started.Round == job.Round && row.Eligible &&
				(row.Final?.ActualAppliedAction is nameof(AiTrainingAction.Speak) or nameof(AiTrainingAction.ProposeAlliance)) &&
				!string.IsNullOrWhiteSpace(row.Final?.Speech))
			.Where(row => !_store.ReadEnhancements(job.SessionId).Any(item => item.RawDecisionId == row.Started.DecisionId &&
				item.EditorVersion == _options.EditorVersion))
			.Select(row => new EditorItem(row, arena.Agents.FirstOrDefault(agent => agent.Id == row.Started.AgentId)?.Name ?? row.Started.AgentId))
			.ToArray();
		if (items.Length == 0) { RecordBatch(job, "Skipped", 0, 0, 0, 0, "no_eligible_speech"); return; }
		RecordBatch(job, "Processing", items.Length, 0, 0, 0, null);
		var processed = 0; var failed = 0; var inputTokens = 0; var outputTokens = 0;
		foreach (var batch in items.Chunk(Math.Clamp(_options.BatchSize, 1, 8)))
		{
			var result = await RewriteAsync(batch, token);
			inputTokens += result.InputTokens; outputTokens += result.OutputTokens;
			foreach (var item in batch)
			{
				var enhancement = Validate(item, arena, result.Rows.GetValueOrDefault(item.Raw.Started.DecisionId), result.ErrorCode);
				_store.AppendEnhancement(enhancement);
				if (enhancement.Status == "Failed") failed++;
				processed++;
			}
			RecordBatch(job, "Processing", items.Length, processed, inputTokens, outputTokens, result.ErrorCode);
		}
		RecordBatch(job, failed == items.Length ? "Failed" : "Completed", items.Length, processed,
			inputTokens, outputTokens, failed == items.Length ? "editor_no_valid_response" : null);
	}

	private void RecordBatch(EditorJob job, string status, int selected, int processed, int inputTokens, int outputTokens, string? error) =>
		_store.AppendEditorBatch(new(job.Key, job.SessionId, job.Round, _options.EditorVersion,
			status, selected, processed, inputTokens, outputTokens, error, DateTimeOffset.UtcNow));

	private sealed record RewriteRow(string Id, string Action, string? TargetPlayerId, string Speech,
		double? LanguageScore, double? StrategicScore);
	private sealed record RewriteResult(Dictionary<string, RewriteRow> Rows, int InputTokens, int OutputTokens, string? ErrorCode);
	private async Task<RewriteResult> RewriteAsync(EditorItem[] batch, CancellationToken token)
	{
		var empty = new Dictionary<string, RewriteRow>(StringComparer.Ordinal);
		if (!Uri.TryCreate(_options.Endpoint.TrimEnd('/') + "/chat/completions", UriKind.Absolute, out var endpoint) ||
			endpoint.Scheme is not ("https" or "http") ||
			(endpoint.Scheme == "http" && !endpoint.IsLoopback) || string.IsNullOrWhiteSpace(_options.Model))
			return new(empty, 0, 0, "editor_not_configured");
		var payload = new
		{
			model = _options.Model, temperature = Math.Clamp(_options.Temperature, 0, 1),
			max_tokens = Math.Clamp(_options.MaxOutputTokens, 128, 2000),
			response_format = new { type = "json_object" },
			messages = new object[]
			{
				new { role = "system", content = "Edit Ukrainian game dialogue naturally, preserving position, addressee, uncertainty, bluff, facts, names, action and target. Add no facts or secrets. Return JSON: {\"items\":[{\"id\":\"...\",\"action\":\"...\",\"targetPlayerId\":null,\"speech\":\"...\",\"languageScore\":0.0,\"strategicScore\":0.0}]}. Scores are suggestions, not factual validation." },
				new { role = "user", content = JsonSerializer.Serialize(new { items = batch.Select(item => new
				{
					id = item.Raw.Started.DecisionId, name = item.Name,
					action = item.Raw.Final!.ActualAppliedAction, targetPlayerId = item.Raw.Final.TargetPlayerId,
					originalSpeech = item.Raw.Final.Speech, observation = EditorObservation(item.Raw.Started.Observation)
				}) }) }
			}
		};
		var estimated = (JsonSerializer.Serialize(payload).Length + 3) / 4 + Math.Clamp(_options.MaxOutputTokens, 128, 2000);
		if (Interlocked.Add(ref _reservedTokens, estimated) > Math.Max(0, _options.MaxTotalTokensPerProcess))
		{
			Interlocked.Add(ref _reservedTokens, -estimated);
			return new(empty, 0, 0, "editor_budget_exceeded");
		}
		for (var attempt = 0; attempt <= Math.Clamp(_options.MaxRetries, 0, 2); attempt++)
		{
			try
			{
				using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
				timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(_options.TimeoutSeconds, 5, 120)));
				using var request = new HttpRequestMessage(HttpMethod.Post, endpoint) { Content = JsonContent.Create(payload) };
				if (!string.IsNullOrWhiteSpace(_options.ApiKey))
					request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);
				using var response = await _clients.CreateClient(nameof(AiTrainingLlmEditorService)).SendAsync(request, timeout.Token);
				if (!response.IsSuccessStatusCode) return new(empty, 0, 0, $"editor_http_{(int)response.StatusCode}");
				using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
				var root = document.RootElement;
				var usage = root.TryGetProperty("usage", out var usageValue) ? usageValue : default;
				var input = Usage(usage, "prompt_tokens"); var output = Usage(usage, "completion_tokens");
				var choice = root.GetProperty("choices")[0];
				if (choice.TryGetProperty("finish_reason", out var finish) && finish.GetString() == "length")
					return new(empty, input, output, "editor_response_truncated");
				var content = choice.GetProperty("message").GetProperty("content").GetString() ?? "";
				content = content.Trim();
				if (content.StartsWith("```")) content = Regex.Replace(content, "^```(?:json)?\\s*|\\s*```$", "", RegexOptions.IgnoreCase);
				try
				{
					using var result = JsonDocument.Parse(content);
					var rows = ParseRows(result.RootElement, batch, out var parseError);
					return new(rows, input, output, parseError ?? (rows.Count == 0 ? "editor_empty_response" : null));
				}
				catch (JsonException) { return new(empty, input, output, "editor_invalid_json"); }
			}
			catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
			catch (JsonException) { return new(empty, 0, 0, "editor_invalid_json"); }
			catch (Exception exception) when (exception is KeyNotFoundException or InvalidOperationException or IndexOutOfRangeException)
			{ return new(empty, 0, 0, "editor_invalid_response"); }
			catch (HttpRequestException)
			{
				if (attempt == Math.Clamp(_options.MaxRetries, 0, 2)) return new(empty, 0, 0, "editor_unavailable");
			}
			catch (OperationCanceledException)
			{
				if (attempt == Math.Clamp(_options.MaxRetries, 0, 2)) return new(empty, 0, 0, "editor_timeout");
			}
		}
		return new(empty, 0, 0, "editor_request_failed");
	}

	private static int Usage(JsonElement usage, string name) => usage.ValueKind == JsonValueKind.Object &&
		usage.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var count) ? count : 0;
	private static object EditorObservation(JsonElement observation) => new
	{
		self = observation.GetProperty("self"), world = observation.GetProperty("world"),
		others = observation.GetProperty("others"), claims = observation.GetProperty("claims"),
		vote = observation.GetProperty("vote"), chat = observation.GetProperty("chat")
	};
	private static Dictionary<string, RewriteRow> ParseRows(JsonElement root, EditorItem[] batch, out string? error)
	{
		error = null;
		var allowed = batch.Select(item => item.Raw.Started.DecisionId).ToHashSet(StringComparer.Ordinal);
		var rows = new Dictionary<string, RewriteRow>(StringComparer.Ordinal);
		var duplicates = new HashSet<string>(StringComparer.Ordinal);
		if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("items", out var items) ||
			items.ValueKind != JsonValueKind.Array || items.GetArrayLength() > batch.Length)
		{ error = "editor_cardinality_invalid"; return rows; }
		foreach (var item in items.EnumerateArray())
		{
			if (item.ValueKind != JsonValueKind.Object) continue;
			if (!item.TryGetProperty("id", out var idValue) || idValue.ValueKind != JsonValueKind.String) continue;
			var id = idValue.GetString()!;
			if (!allowed.Contains(id)) { error = "editor_unknown_id"; return new Dictionary<string, RewriteRow>(StringComparer.Ordinal); }
			if (duplicates.Contains(id)) continue;
			if (rows.ContainsKey(id)) { rows.Remove(id); duplicates.Add(id); error = "editor_duplicate_id"; continue; }
			if (!item.TryGetProperty("action", out var action) || action.ValueKind != JsonValueKind.String ||
				!item.TryGetProperty("speech", out var speech) || speech.ValueKind != JsonValueKind.String) continue;
			var target = item.TryGetProperty("targetPlayerId", out var targetValue) && targetValue.ValueKind == JsonValueKind.String ? targetValue.GetString() : null;
			rows[id] = new(id, action.GetString()!, target, speech.GetString() ?? "",
				Score(item, "languageScore"), Score(item, "strategicScore"));
		}
		return rows;
	}
	private static double? Score(JsonElement item, string name) => item.TryGetProperty(name, out var value) &&
		value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var score) && score is >= 0 and <= 1 ? score : null;

	private AiTrainingEnhancement Validate(EditorItem item, AiTrainingArena arena, RewriteRow? rewrite, string? error)
	{
		var raw = item.Raw; var original = raw.Final!.Speech!;
		var status = "Completed"; string? reason = null;
		if (rewrite == null) { status = error == null ? "Skipped" : "Failed"; reason = error ?? "editor_missing_id"; }
		else if (rewrite.Action != raw.Final.ActualAppliedAction || rewrite.TargetPlayerId != raw.Final.TargetPlayerId)
		{ status = "Rejected"; reason = "editor_action_or_target_changed"; }
		else if (string.IsNullOrWhiteSpace(rewrite.Speech) || rewrite.Speech.Length > 500)
		{ status = "Rejected"; reason = "editor_speech_invalid"; }
		else if (rewrite.Speech.Trim() == original.Trim())
		{ status = "Skipped"; reason = "editor_unchanged"; }
		else if (MentionsHiddenOther(rewrite.Speech, raw, arena))
		{ status = "Rejected"; reason = "editor_hidden_fact_suspected"; }
		else if (!SameNumbers(original, rewrite.Speech) || !PreservesNames(original, rewrite.Speech, item.Name, raw.Started.FullObservation) ||
			!PreservesPublicFacts(original, rewrite.Speech, raw.Started.FullObservation))
		{ status = "RequiresReview"; reason = "editor_protected_detail_changed"; }
		return new(raw.Started.DecisionId, raw.Started.SessionId, _options.EditorVersion,
			AiTrainingDatasetStore.OriginalSpeechHash(original), _options.Provider, _options.Model,
			PromptVersion, SchemaVersion, status is "Completed" or "RequiresReview" ? rewrite?.Speech : null,
			rewrite?.LanguageScore, rewrite?.StrategicScore,
			status, reason, DateTimeOffset.UtcNow);
	}
	private static bool SameNumbers(string original, string rewritten) =>
		Regex.Matches(original, @"\d+").Select(match => match.Value).Order().SequenceEqual(
			Regex.Matches(rewritten, @"\d+").Select(match => match.Value).Order());
	private static bool PreservesNames(string original, string rewritten, string ownName, JsonElement full)
	{
		var names = new[] { ownName }.Concat(full.GetProperty("others").EnumerateArray()
			.Select(item => item.GetProperty("name").GetString()).OfType<string>());
		return names.All(name => original.Contains(name, StringComparison.OrdinalIgnoreCase) ==
			rewritten.Contains(name, StringComparison.OrdinalIgnoreCase));
	}
	private static bool PreservesPublicFacts(string original, string rewritten, JsonElement full)
	{
		var facts = full.GetProperty("self").EnumerateObject().Select(item => item.Value.GetString())
			.Concat(full.GetProperty("others").EnumerateArray().SelectMany(item => item.GetProperty("revealed")
				.EnumerateObject().Select(fact => fact.Value.GetString()))).OfType<string>()
			.Where(value => value.Length is >= 5 and <= 100);
		return facts.All(value => original.Contains(value, StringComparison.OrdinalIgnoreCase) ==
			rewritten.Contains(value, StringComparison.OrdinalIgnoreCase));
	}
	private static bool MentionsHiddenOther(string speech, AiTrainingRawDecision raw, AiTrainingArena arena)
	{
		var publicFacts = raw.Started.FullObservation.GetProperty("others").EnumerateArray()
			.ToDictionary(item => item.GetProperty("id").GetString()!, item => item.GetProperty("revealed"));
		foreach (var agent in arena.Agents.Where(agent => agent.Id != raw.Started.AgentId))
		{
			if (!publicFacts.TryGetValue(agent.Id, out var revealed)) continue;
			foreach (var characteristic in agent.OwnCharacteristics)
				if (characteristic.Value.Length >= 8 &&
					(!revealed.TryGetProperty(characteristic.Key, out var publicValue) || publicValue.GetString() != characteristic.Value) &&
					speech.Contains(characteristic.Value, StringComparison.OrdinalIgnoreCase)) return true;
		}
		return false;
	}
}
