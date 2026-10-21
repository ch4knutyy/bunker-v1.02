using System.Collections.Concurrent;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Bunker.Hubs;
using Bunker.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;

namespace Bunker.Services;

public sealed class AiTrainingArenaOptions
{
	public const string SectionName = "AiTrainingArena";
	public bool Enabled { get; set; } = true;
	public bool UseLiveProvider { get; set; }
	public int MaxConcurrentArenas { get; set; } = 1;
	public int MaxSteps { get; set; } = 180;
	public int MaxMessages { get; set; } = 120;
	public int AutoStepDelayMilliseconds { get; set; } = 1400;
	public int MaxLiveRequests { get; set; } = 120;
	public int LiveProviderAttempts { get; set; } = 2;
	public int VoteApprovalPercent { get; set; } = 51;
	public string Provider { get; set; } = "Gemini";
	public string Model { get; set; } = "";
	public string BaseUrl { get; set; } = "http://127.0.0.1:1234/v1";
	public string GenerationMode { get; set; } = "Direct";
	public int MaxConcurrentRequests { get; set; } = 1;
	public int LocalTimeoutSeconds { get; set; } = 60;
	public int MaxResponseTokens { get; set; } = 240;
	public string DatasetDirectory { get; set; } = "AiTrainingData";
}

public enum AiTrainingArenaStatus { Created, Running, Paused, Finished, Cancelled, Faulted }
public enum AiTrainingAction { Speak, RevealCharacteristic, ProposeAlliance, ProposeVote, AcceptVoteProposal, RejectVoteProposal, CastVote, Wait }

public sealed class AiTrainingArena
{
	public string Id { get; init; } = Guid.NewGuid().ToString("N");
	public DateTimeOffset StartedAtUtc { get; init; }
	public DateTimeOffset? EndedAtUtc { get; set; }
	public AiTrainingArenaStatus Status { get; set; } = AiTrainingArenaStatus.Created;
	public int Step { get; set; }
	public int Cursor { get; set; }
	public int VoteCount { get; set; }
	public string? LastIntervention { get; set; }
	public string Provider { get; set; } = "Deterministic";
	public string Model { get; set; } = "deterministic";
	public string GenerationMode { get; set; } = "Direct";
	public bool UseLiveProvider { get; set; }
	public List<AiTrainingAgent> Agents { get; set; } = [];
	public List<AiTrainingMessage> Messages { get; set; } = [];
	public List<AiTrainingEvent> Events { get; set; } = [];
	public List<AiTrainingDecision> Decisions { get; set; } = [];
	public AiTrainingVoteProposal? Proposal { get; set; }
	public Dictionary<string, string> OpenVotes { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class AiTrainingAgent
{
	public string Id { get; init; } = "";
	public string Name { get; init; } = "";
	public int Seat { get; init; }
	public string Persona { get; init; } = "Обережний, прагматичний учасник.";
	public bool IsEliminated { get; set; }
	public Dictionary<string, string> OwnCharacteristics { get; init; } = new(StringComparer.OrdinalIgnoreCase);
	public Dictionary<string, string> RevealedCharacteristics { get; set; } = new(StringComparer.OrdinalIgnoreCase);
	public Dictionary<string, string> PublicKnowledge { get; set; } = new(StringComparer.OrdinalIgnoreCase);
	public List<string> Memory { get; set; } = [];
	public List<AiTrainingStatement> PublicClaims { get; set; } = [];
	public List<AiTrainingStatement> ExplicitBluffs { get; set; } = [];
	public string? LastStrategy { get; set; }
	public string? LastDecision { get; set; }
	public string? LastError { get; set; }
}

public sealed record AiTrainingMessage(string Id, int Step, string AgentId, string AgentName, string Text, DateTimeOffset AtUtc);
public sealed record AiTrainingEvent(string Id, int Step, string Type, string? AgentId, object Data, DateTimeOffset AtUtc);
public sealed record AiTrainingStatement(string Classification, string Text, string AgentId, int Step);
public sealed record AiTrainingDecision(string Id, int Step, string AgentId, object VisibleState, IReadOnlyList<string> AllowedActions,
	AiTrainingAction Action, string? TargetPlayerId, string? Message, string? Strategy, double? Confidence, bool Accepted, string? ValidationError,
	string Provider, string Model, int? InputTokens, int? OutputTokens, DateTimeOffset AtUtc,
	string GenerationMode = "Direct", string? PrivateStrategicPlan = null, IReadOnlyList<AiTrainingStatement>? PublicClaims = null,
	IReadOnlyList<AiTrainingStatement>? ExplicitBluffs = null, string? ProviderError = null);
public sealed record AiTrainingVoteProposal(string Id, string ProposerId, HashSet<string> AcceptedBy, HashSet<string> RejectedBy, DateTimeOffset AtUtc, bool IsOpen = false);
public sealed record AiTrainingArenaRequest(string? Provider, string? GenerationMode);

public sealed class AiTrainingDatasetStore
{
	private readonly string _root;
	private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

	public AiTrainingDatasetStore(IHostEnvironment environment, IOptions<AiTrainingArenaOptions> options)
	{
		_root = Path.GetFullPath(Path.Combine(environment.ContentRootPath, options.Value.DatasetDirectory));
	}

	public string SessionPath(string id) => Path.Combine(_root, "sessions", id);
	public void Create(AiTrainingArena arena, AiTrainingArenaOptions options)
	{
		Directory.CreateDirectory(SessionPath(arena.Id));
		WriteJson(arena.Id, "metadata.json", new
		{
			schemaVersion = 1,
			sessionId = arena.Id,
			startedAtUtc = arena.StartedAtUtc,
			ruleVersion = "ai-training-arena-v1",
			playerCount = arena.Agents.Count,
			provider = arena.Provider,
			model = arena.Model,
			generationMode = arena.GenerationMode,
			useLiveProvider = arena.UseLiveProvider,
			voteApprovalPercent = options.VoteApprovalPercent
		});
		Save(arena);
	}
	public void AppendEvent(AiTrainingArena arena, AiTrainingEvent value) => Append(arena.Id, "events.jsonl", value);
	public void AppendDecision(AiTrainingArena arena, AiTrainingDecision value) => Append(arena.Id, "decisions.jsonl", value);
	public void Save(AiTrainingArena arena)
	{
		WriteJson(arena.Id, "snapshot.json", arena);
		if (arena.Status is AiTrainingArenaStatus.Finished or AiTrainingArenaStatus.Cancelled or AiTrainingArenaStatus.Faulted)
			WriteJson(arena.Id, "results.json", new
			{
				sessionId = arena.Id,
				status = arena.Status,
				completedAtUtc = arena.EndedAtUtc,
				winners = arena.Agents.Where(agent => !agent.IsEliminated).Select(agent => agent.Id),
				eliminated = arena.Agents.Where(agent => agent.IsEliminated).Select(agent => agent.Id),
				steps = arena.Step,
				votes = arena.VoteCount,
				intervention = arena.LastIntervention,
				correctlyCompleted = arena.Status == AiTrainingArenaStatus.Finished
			});
	}
	public AiTrainingArena? Load(string id)
	{
		var path = Path.Combine(SessionPath(id), "snapshot.json");
		return File.Exists(path) ? JsonSerializer.Deserialize<AiTrainingArena>(File.ReadAllText(path), Json) : null;
	}
	public IReadOnlyList<object> List()
	{
		var root = Path.Combine(_root, "sessions");
		if (!Directory.Exists(root)) return [];
		return Directory.GetDirectories(root).Select(directory =>
		{
			var arena = Load(Path.GetFileName(directory));
			return (object)new { id = arena?.Id ?? Path.GetFileName(directory), status = arena?.Status.ToString(), startedAtUtc = arena?.StartedAtUtc, endedAtUtc = arena?.EndedAtUtc, steps = arena?.Step };
		}).OrderByDescending(item => item.ToString()).ToList();
	}
	public byte[] ExportZip(string id)
	{
		var directory = SessionPath(id);
		if (!Directory.Exists(directory)) throw new FileNotFoundException("arena_not_found");
		using var stream = new MemoryStream();
		using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, true))
			foreach (var file in Directory.GetFiles(directory)) zip.CreateEntryFromFile(file, Path.GetFileName(file), CompressionLevel.Fastest);
		return stream.ToArray();
	}
	private void Append<T>(string id, string name, T value)
	{
		Directory.CreateDirectory(SessionPath(id));
		File.AppendAllText(Path.Combine(SessionPath(id), name), JsonSerializer.Serialize(value, Json) + Environment.NewLine, Encoding.UTF8);
	}
	private void WriteJson<T>(string id, string name, T value)
	{
		Directory.CreateDirectory(SessionPath(id));
		var path = Path.Combine(SessionPath(id), name); var temporary = path + ".tmp";
		File.WriteAllText(temporary, JsonSerializer.Serialize(value, Json), Encoding.UTF8);
		File.Move(temporary, path, true);
	}
}

public sealed class AiTrainingArenaService
{
	private static readonly string[] Names = ["Марія", "Олексій", "Ірина", "Данило", "Софія", "Максим"];
	private static readonly string[] Personas = [
		"Спокійна медикиня: емпатична, але уважно перевіряє ризики.",
		"Прагматичний інженер: стисло мислить ресурсами та надійністю.",
		"Соціальна психологиня: будує союзи й помічає суперечності у словах.",
		"Прямолінійний рятувальник: цінує дію, чесність і чітке голосування.",
		"Обережна дослідниця: ставить уточнювальні питання й не поспішає з висновками.",
		"Іронічний стратег: шукає важелі впливу, але не розкриває зайвого."
	];
	private static readonly string[] CharacteristicKeys = ["profession", "health", "hobby", "trait", "phobia", "fact"];
	private readonly ConcurrentDictionary<string, AiTrainingArena> _arenas = new(StringComparer.OrdinalIgnoreCase);
	private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.OrdinalIgnoreCase);
	private readonly CharacterGeneratorService _characters;
	private readonly IAiProvider _provider;
	private readonly ILocalMamayLmProvider _localProvider;
	private readonly AiTrainingDatasetStore _dataset;
	private readonly AiTrainingArenaOptions _options;
	private readonly IHubContext<AiTrainingArenaHub> _hub;
	private readonly TimeProvider _clock;
	private readonly ILogger<AiTrainingArenaService> _logger;

	public AiTrainingArenaService(CharacterGeneratorService characters, IAiProvider provider, ILocalMamayLmProvider localProvider, AiTrainingDatasetStore dataset,
		IOptions<AiTrainingArenaOptions> options, IHubContext<AiTrainingArenaHub> hub, TimeProvider clock, ILogger<AiTrainingArenaService> logger)
	{ _characters = characters; _provider = provider; _localProvider = localProvider; _dataset = dataset; _options = options.Value; _hub = hub; _clock = clock; _logger = logger; }

	public Task<AiTrainingArena> CreateAsync(CancellationToken token) => CreateAsync(null, token);

	public async Task<AiTrainingArena> CreateAsync(AiTrainingArenaRequest? request, CancellationToken token)
	{
		if (!_options.Enabled) throw new InvalidOperationException("ai_training_arena_disabled");
		if (_arenas.Values.Count(arena => arena.Status is AiTrainingArenaStatus.Running or AiTrainingArenaStatus.Paused) >= Math.Max(1, _options.MaxConcurrentArenas)) throw new InvalidOperationException("arena_concurrency_limit");
		var configuration = ResolveConfiguration(request);
		var arena = new AiTrainingArena
		{
			StartedAtUtc = _clock.GetUtcNow(),
			Provider = configuration.Provider,
			Model = configuration.Model,
			GenerationMode = configuration.GenerationMode,
			UseLiveProvider = configuration.UseLiveProvider
		};
		for (var index = 0; index < 6; index++)
		{
			var player = _characters.Generate(Names[index]);
			arena.Agents.Add(new AiTrainingAgent
			{
				Id = $"ai-{index + 1}",
				Name = Names[index],
				Seat = index + 1,
				Persona = Personas[index],
				OwnCharacteristics = BuildCharacteristics(player)
			});
		}
		_arenas[arena.Id] = arena; _dataset.Create(arena, _options); AddEvent(arena, "arena_created", null, new { playerCount = 6 }); _dataset.Save(arena);
		await PublishAsync(arena, token); return arena;
	}

	public AiTrainingArena Get(string id) => _arenas.TryGetValue(id, out var arena) ? arena : _arenas.GetOrAdd(id, key => _dataset.Load(key) ?? throw new KeyNotFoundException("arena_not_found"));
	public IReadOnlyList<object> List() => _dataset.List();
	public byte[] Export(string id) => _dataset.ExportZip(id);
	public object View(string id, string? selectedAgentId) { var arena = Get(id); return BuildView(arena, selectedAgentId); }
	public object Configuration() => new
	{
		provider = NormalizeProvider(_options.Provider),
		model = _options.Model,
		generationMode = NormalizeGenerationMode(_options.GenerationMode),
		useLiveProvider = _options.UseLiveProvider,
		baseUrl = _options.BaseUrl,
		maxConcurrentRequests = 1,
		localStatus = _localProvider.LastStatus
	};
	public async Task<object> CheckProviderAsync(CancellationToken token)
	{
		var provider = NormalizeProvider(_options.Provider);
		var status = provider == "Local" ? await _localProvider.ProbeAsync(token) : new AiTrainingProviderStatus(provider, _options.UseLiveProvider ? "configured" : "disabled", _options.Model);
		return new { configuration = Configuration(), status };
	}

	public async Task<object> StartAsync(string id, CancellationToken token)
	{
		var arena = Get(id); await MutateAsync(arena, _ => { if (arena.Status is AiTrainingArenaStatus.Created or AiTrainingArenaStatus.Paused) { arena.Status = AiTrainingArenaStatus.Running; AddEvent(arena, "arena_started", null, new { }); _ = RunAsync(arena.Id); } }, token); return BuildView(arena, null);
	}
	public async Task<object> PauseAsync(string id, CancellationToken token) { var arena = Get(id); await MutateAsync(arena, _ => { if (arena.Status == AiTrainingArenaStatus.Running) { arena.Status = AiTrainingArenaStatus.Paused; AddEvent(arena, "arena_paused", null, new { }); } }, token); return BuildView(arena, null); }
	public async Task<object> ResumeAsync(string id, CancellationToken token) { var arena = Get(id); await MutateAsync(arena, _ => { if (arena.Status == AiTrainingArenaStatus.Paused) { arena.Status = AiTrainingArenaStatus.Running; AddEvent(arena, "arena_resumed", null, new { }); _ = RunAsync(arena.Id); } }, token); return BuildView(arena, null); }
	public async Task<object> CancelAsync(string id, CancellationToken token) { var arena = Get(id); await MutateAsync(arena, _ => Finish(arena, AiTrainingArenaStatus.Cancelled, "developer_cancelled"), token); return BuildView(arena, null); }
	public async Task<object> StepAsync(string id, CancellationToken token) { var arena = Get(id); await MutateAsync(arena, _ => ExecuteStepAsync(arena, token).GetAwaiter().GetResult(), token); return BuildView(arena, null); }

	private async Task RunAsync(string id)
	{
		try
		{
			while (true)
			{
				var arena = Get(id); if (arena.Status != AiTrainingArenaStatus.Running) return;
				await StepAsync(id, CancellationToken.None);
				await Task.Delay(Math.Clamp(_options.AutoStepDelayMilliseconds, 150, 10_000));
			}
		}
		catch (Exception exception) { _logger.LogError(exception, "AI training arena {ArenaId} stopped unexpectedly", id); var arena = Get(id); Finish(arena, AiTrainingArenaStatus.Faulted, "simulator_fault"); _dataset.Save(arena); await PublishAsync(arena, CancellationToken.None); }
	}

	private async Task MutateAsync(AiTrainingArena arena, Action<object?> action, CancellationToken token)
	{
		var gate = _locks.GetOrAdd(arena.Id, _ => new SemaphoreSlim(1, 1)); await gate.WaitAsync(token);
		try { action(null); _dataset.Save(arena); await PublishAsync(arena, token); } finally { gate.Release(); }
	}

	private async Task ExecuteStepAsync(AiTrainingArena arena, CancellationToken token)
	{
		if (arena.Status is AiTrainingArenaStatus.Finished or AiTrainingArenaStatus.Cancelled or AiTrainingArenaStatus.Faulted) return;
		if (arena.Step >= Math.Max(10, _options.MaxSteps) || arena.Messages.Count >= Math.Max(10, _options.MaxMessages)) { Finish(arena, AiTrainingArenaStatus.Finished, "simulator_limit_reached"); return; }
		var active = arena.Agents.Where(agent => !agent.IsEliminated).OrderBy(agent => agent.Seat).ToList();
		if (active.Count <= 3) { Finish(arena, AiTrainingArenaStatus.Finished, null); return; }
		var actor = active[arena.Cursor % active.Count]; arena.Cursor++; arena.Step++;
		var visible = VisibleState(arena, actor);
		var result = await DecideAsync(arena, actor, visible, token);
		var accepted = ApplyDecision(arena, actor, result, out var validation);
		var decision = new AiTrainingDecision(Guid.NewGuid().ToString("N"), arena.Step, actor.Id, visible, AllowedActions(arena, actor), result.Action, result.TargetPlayerId, result.Message, result.Strategy, result.Confidence, accepted, validation, arena.Provider, arena.Model, result.InputTokens, result.OutputTokens, _clock.GetUtcNow(),
			arena.GenerationMode, result.PrivateStrategicPlan, result.PublicClaims, result.ExplicitBluffs, result.ProviderError);
		arena.Decisions.Add(decision); _dataset.AppendDecision(arena, decision);
		actor.LastDecision = result.Action.ToString(); actor.LastStrategy = result.Strategy; actor.LastError = result.ProviderError ?? validation;
		if (accepted) RecordPublicStatements(arena, actor, result);
		if (!string.IsNullOrWhiteSpace(result.ProviderError)) AddEvent(arena, "provider_error", actor.Id, new { error = result.ProviderError, provider = arena.Provider });
		if (!accepted) { AddEvent(arena, "decision_rejected", actor.Id, new { validation }); ApplyDecision(arena, actor, new Decision(AiTrainingAction.Wait, null, null, "safe fallback", null), out _); }
	}

	private async Task<Decision> DecideAsync(AiTrainingArena arena, AiTrainingAgent actor, object visible, CancellationToken token)
	{
		var fallback = DeterministicDecision(arena, actor);
		if (!arena.UseLiveProvider) return fallback;
		if (arena.Decisions.Count >= Math.Max(1, _options.MaxLiveRequests)) return ProviderFailure("ai_live_request_limit");
		var systemPrompt = $"""
Ти — {actor.Name}, повноправний учасник гри «Бункер», а не ведучий чи помічник. Твій характер: {actor.Persona}
Твоя мета — залишитися серед тих, хто потрапить у бункер. Ти бачиш власні характеристики, свої спогади й лише публічні дані про інших.

ПОВЕДІНКА:
- Самостійно захищай свою кандидатуру, шукай союзників і оцінюй ризик виключення.
- Переконуй тих, хто ще не визначився. Не повторюй аргумент, якщо його вже відкинули, без нових підстав.
- Можеш сперечатися, ставити незручні запитання, жартувати, виявляти недовіру й свідомо блефувати.
- Дотримуйся свого характеру: не будь завжди ввічливим, дипломатичним чи поступливим.
- Не вигадуй нових СПРАВЖНІХ характеристик, здібностей, предметів або подій минулого.
- Свідомо неправдиву публічну заяву можна зробити як BLUFF, але вона не змінює реальні характеристики. Не плутай її з FACT.
- Не приписуй собі конкретного минулого досвіду тільки тому, що він правдоподібний для твого хобі. Якщо це неправда — це блеф.
- Не вважай заяви конкурентів доведеними фактами. Не використовуй прихованих характеристик інших учасників.

РОЗМЕЖУВАННЯ ІНФОРМАЦІЇ:
FACT — підтверджена характеристика, розкрита за правилами.
CLAIM — публічна заява, справжність якої не перевірена.
BLUFF — твоя власна навмисно неправдива заява; інші гравці не повинні знати, що це блеф.
UNKNOWN — відомостей немає.

МОВЛЕННЯ:
- Українська жива, розмовна, природна. Зазвичай 1–4 речення на публічну репліку.
- Не пиши як нейтральний асистент, не закінчуй шаблонними висновками про те, що «кожен важливий».
- Публічна репліка містить лише слова персонажа. Не розкривай приватний план, приховані дані чи службові позначки FACT/CLAIM/BLUFF/UNKNOWN.
- Якщо потрібно обрати дію замість репліки, дотримуйся дозволених ігрових дій.
""";
		string? privatePlan = null;
		if (string.Equals(arena.GenerationMode, "Strategic", StringComparison.OrdinalIgnoreCase))
		{
			var planReply = await GenerateAsync(arena, actor, systemPrompt, $$"""
Склади короткий приватний тактичний план без прихованого ланцюжка міркувань. Врахуй ризик вибуття, союзників, голосування й користь/ризик блефу. Поверни ТІЛЬКИ JSON: {"strategy":"...","plan":"..."}.
Видимий стан: {{JsonSerializer.Serialize(visible)}}
""", token);
			if (string.IsNullOrWhiteSpace(planReply.Text)) return ProviderFailure(planReply.ErrorCode ?? "ai_provider_failed");
			privatePlan = ReadJsonString(planReply.Text, "plan") ?? ReadJsonString(planReply.Text, "strategy");
			if (string.IsNullOrWhiteSpace(privatePlan)) return ProviderFailure("ai_malformed_response");
		}

		var prompt = $$"""
Зроби один дозволений хід. Поверни ТІЛЬКИ JSON такого вигляду:
{"action":"Speak|RevealCharacteristic|ProposeAlliance|ProposeVote|AcceptVoteProposal|RejectVoteProposal|CastVote|Wait","targetPlayerId":"ai-... або назва характеристики або null","message":"публічна відповідь українською або null","strategy":"коротка стратегія","confidence":0.0,"claims":["непідтверджена публічна заява"],"bluffs":["явно позначений навмисний блеф"]}
Не позначай як FACT нічого, крім вже підтвердженого розкриття. claims і bluffs є лише публічними твердженнями, не змінюють реальних характеристик. Дозволені дії: {{string.Join(',', AllowedActions(arena, actor))}}.
Видимий стан: {{JsonSerializer.Serialize(visible)}}
Приватний тактичний план: {{privatePlan ?? "немає; обери прямий обережний хід"}}
""";
		AiProviderReply? reply = null;
		for (var attempt = 0; attempt < Math.Clamp(_options.LiveProviderAttempts, 1, 3); attempt++)
		{
			try { reply = await GenerateAsync(arena, actor, systemPrompt, prompt, token); }
			catch (Exception exception) when (exception is not OperationCanceledException || !token.IsCancellationRequested)
			{
				_logger.LogWarning(exception, "AI training generation failed for {ArenaId}, agent {AgentId}, attempt {Attempt}", arena.Id, actor.Id, attempt + 1);
			}
			if (!string.IsNullOrWhiteSpace(reply?.Text)) break;
			if (attempt + 1 < Math.Clamp(_options.LiveProviderAttempts, 1, 3)) await Task.Delay(200, token);
		}
		if (string.IsNullOrWhiteSpace(reply?.Text)) return ProviderFailure(reply?.ErrorCode ?? "ai_provider_failed", privatePlan);
		try
		{
			using var document = JsonDocument.Parse(ExtractJson(reply.Text)); var root = document.RootElement;
			if (!root.TryGetProperty("action", out var actionValue) || !Enum.TryParse<AiTrainingAction>(actionValue.GetString(), true, out var action)) return ProviderFailure("ai_malformed_response", privatePlan);
			return new Decision(action, root.TryGetProperty("targetPlayerId", out var target) ? target.GetString() : null,
				root.TryGetProperty("message", out var message) ? message.GetString() : null, root.TryGetProperty("strategy", out var strategy) ? strategy.GetString() : null,
				root.TryGetProperty("confidence", out var confidence) && confidence.TryGetDouble(out var parsed) ? Math.Clamp(parsed, 0, 1) : null,
				reply.Usage?.InputTokens, reply.Usage?.OutputTokens, privatePlan,
				ReadStatements(root, "claims", "CLAIM", actor, arena.Step), ReadStatements(root, "bluffs", "BLUFF", actor, arena.Step));
		}
		catch (JsonException) { return ProviderFailure("ai_malformed_response", privatePlan); }
	}

	private Task<AiProviderReply> GenerateAsync(AiTrainingArena arena, AiTrainingAgent actor, string systemPrompt, string userPrompt, CancellationToken token)
	{
		if (string.Equals(arena.Provider, "Local", StringComparison.OrdinalIgnoreCase))
			return _localProvider.GenerateAsync(new AiTrainingModelRequest(arena.Model, systemPrompt, userPrompt, _options.MaxResponseTokens), token);
		var companion = new AiChatCompanion { Id = actor.Id, PlayerStableId = actor.Id, Name = actor.Name, Provider = arena.Provider, Model = arena.Model };
		return _provider.GenerateReplyAsync(companion, systemPrompt + "\n\n" + userPrompt, token);
	}

	private static Decision ProviderFailure(string error, string? privatePlan = null) => new(AiTrainingAction.Wait, null, null, "provider failure", null,
		PrivateStrategicPlan: privatePlan, ProviderError: error);

	private static string ExtractJson(string text)
	{
		var trimmed = text.Trim();
		if (!trimmed.StartsWith("```", StringComparison.Ordinal)) return trimmed;
		var firstLine = trimmed.IndexOf('\n');
		var lastFence = trimmed.LastIndexOf("```", StringComparison.Ordinal);
		return firstLine >= 0 && lastFence > firstLine ? trimmed[(firstLine + 1)..lastFence].Trim() : trimmed;
	}

	private static string? ReadJsonString(string text, string property)
	{
		try
		{
			using var document = JsonDocument.Parse(ExtractJson(text));
			return document.RootElement.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()?.Trim() : null;
		}
		catch (JsonException) { return null; }
	}

	private static IReadOnlyList<AiTrainingStatement> ReadStatements(JsonElement root, string property, string classification, AiTrainingAgent actor, int step)
	{
		if (!root.TryGetProperty(property, out var values) || values.ValueKind != JsonValueKind.Array) return [];
		return values.EnumerateArray().Where(value => value.ValueKind == JsonValueKind.String)
			.Select(value => value.GetString()?.Trim()).Where(value => !string.IsNullOrWhiteSpace(value)).Take(3)
			.Select(value => new AiTrainingStatement(classification, value![..Math.Min(value.Length, 300)], actor.Id, step)).ToList();
	}

	private void RecordPublicStatements(AiTrainingArena arena, AiTrainingAgent actor, Decision decision)
	{
		foreach (var claim in decision.PublicClaims ?? [])
		{
			actor.PublicClaims.Add(claim);
			foreach (var agent in arena.Agents) agent.Memory.Add($"CLAIM {actor.Name}: {claim.Text}");
			AddEvent(arena, "public_claim", actor.Id, new { classification = claim.Classification, text = claim.Text });
		}
		foreach (var bluff in decision.ExplicitBluffs ?? [])
		{
			// Тільки автор знає, що заява неправдива. Інші бачать звичайну неперевірену CLAIM.
			actor.ExplicitBluffs.Add(bluff);
			actor.Memory.Add($"MY BLUFF {actor.Name}: {bluff.Text}");
			var publicClaim = bluff with { Classification = "CLAIM" };
			actor.PublicClaims.Add(publicClaim);
			foreach (var agent in arena.Agents)
				if (agent.Id != actor.Id) agent.Memory.Add($"CLAIM {actor.Name}: {bluff.Text}");
			AddEvent(arena, "public_claim", actor.Id, new { classification = "CLAIM", text = bluff.Text });
		}
	}

	private Decision DeterministicDecision(AiTrainingArena arena, AiTrainingAgent actor)
	{
		var hidden = actor.OwnCharacteristics.Keys.FirstOrDefault(key => !actor.RevealedCharacteristics.ContainsKey(key));
		if (RevealsReady(arena) && arena.Proposal == null && arena.OpenVotes.Count == 0) return new(AiTrainingAction.ProposeVote, null, null, "Open a vote when public disclosures are sufficient", .7);
		if (arena.Proposal != null && !arena.Proposal.AcceptedBy.Contains(actor.Id) && !arena.Proposal.RejectedBy.Contains(actor.Id)) return new(AiTrainingAction.AcceptVoteProposal, null, null, "Support a timely decision", .6);
		if (arena.Proposal?.IsOpen == true && !arena.OpenVotes.ContainsKey(actor.Id)) return new(AiTrainingAction.CastVote, PickTarget(arena, actor).Id, null, "Vote against a competing survivor", .55);
		if (!string.IsNullOrWhiteSpace(hidden) && actor.RevealedCharacteristics.Count < 3) return new(AiTrainingAction.RevealCharacteristic, hidden, null, "Meet the disclosure threshold", .9);
		return new(AiTrainingAction.Speak, null, $"Я оцінюю відкриті факти та шукаю надійних союзників.", "Build a public coalition", .5);
	}

	private bool ApplyDecision(AiTrainingArena arena, AiTrainingAgent actor, Decision decision, out string? error)
	{
		error = null; if (actor.IsEliminated) { error = "eliminated_agent"; return false; }
		if (!AllowedActions(arena, actor).Contains(decision.Action.ToString())) { error = "action_not_allowed"; return false; }
		switch (decision.Action)
		{
			case AiTrainingAction.Speak:
			case AiTrainingAction.ProposeAlliance:
				var text = string.IsNullOrWhiteSpace(decision.Message) ? "Я аналізую відкриті факти." : decision.Message.Trim()[..Math.Min(500, decision.Message.Trim().Length)];
				var message = new AiTrainingMessage(Guid.NewGuid().ToString("N"), arena.Step, actor.Id, actor.Name, text, _clock.GetUtcNow()); arena.Messages.Add(message); AddEvent(arena, "message", actor.Id, new { text }); actor.Memory.Add($"Said: {text}"); break;
			case AiTrainingAction.RevealCharacteristic:
				if (string.IsNullOrWhiteSpace(decision.TargetPlayerId) || !actor.OwnCharacteristics.TryGetValue(decision.TargetPlayerId, out var value) || actor.RevealedCharacteristics.ContainsKey(decision.TargetPlayerId)) { error = "invalid_reveal"; return false; }
				actor.RevealedCharacteristics[decision.TargetPlayerId] = value;
				foreach (var agent in arena.Agents) agent.PublicKnowledge[$"{actor.Id}:{decision.TargetPlayerId}"] = value;
				foreach (var agent in arena.Agents) agent.Memory.Add($"FACT {actor.Name}: {decision.TargetPlayerId} = {value}");
				AddEvent(arena, "characteristic_revealed", actor.Id, new { characteristic = decision.TargetPlayerId, value }); break;
			case AiTrainingAction.ProposeVote:
				if (!RevealsReady(arena) && arena.VoteCount == 0) { error = "first_vote_requires_three_reveals"; return false; }
				if (arena.Proposal != null || arena.OpenVotes.Count > 0) { error = "vote_already_pending"; return false; }
				arena.Proposal = new(Guid.NewGuid().ToString("N"), actor.Id, [actor.Id], [], _clock.GetUtcNow()); AddEvent(arena, "vote_proposed", actor.Id, new { proposalId = arena.Proposal.Id }); break;
			case AiTrainingAction.AcceptVoteProposal:
				if (arena.Proposal == null) { error = "vote_proposal_missing"; return false; }
				arena.Proposal.AcceptedBy.Add(actor.Id); AddEvent(arena, "vote_proposal_accepted", actor.Id, new { proposalId = arena.Proposal.Id });
				if (arena.Proposal.AcceptedBy.Count * 100 >= ActiveCount(arena) * Math.Clamp(_options.VoteApprovalPercent, 1, 100)) { arena.Proposal = arena.Proposal with { IsOpen = true }; AddEvent(arena, "vote_opened", null, new { proposalId = arena.Proposal.Id }); }
				break;
			case AiTrainingAction.RejectVoteProposal:
				if (arena.Proposal == null) { error = "vote_proposal_missing"; return false; }
				arena.Proposal.RejectedBy.Add(actor.Id); AddEvent(arena, "vote_proposal_rejected", actor.Id, new { proposalId = arena.Proposal.Id }); break;
			case AiTrainingAction.CastVote:
				if (arena.Proposal?.IsOpen != true || string.IsNullOrWhiteSpace(decision.TargetPlayerId) || !arena.Agents.Any(agent => agent.Id == decision.TargetPlayerId && !agent.IsEliminated) || decision.TargetPlayerId == actor.Id) { error = "invalid_vote"; return false; }
				if (!arena.OpenVotes.TryAdd(actor.Id, decision.TargetPlayerId)) { error = "duplicate_vote"; return false; }
				AddEvent(arena, "vote_cast", actor.Id, new { targetPlayerId = decision.TargetPlayerId });
				if (arena.OpenVotes.Count == ActiveCount(arena)) ResolveVote(arena); break;
			case AiTrainingAction.Wait: AddEvent(arena, "agent_waited", actor.Id, new { }); break;
		}
		return true;
	}

	private void ResolveVote(AiTrainingArena arena)
	{
		var target = arena.OpenVotes.GroupBy(item => item.Value).OrderByDescending(group => group.Count()).ThenBy(group => arena.Agents.Single(agent => agent.Id == group.Key).Seat).First().Key;
		var eliminated = arena.Agents.Single(agent => agent.Id == target); eliminated.IsEliminated = true; arena.VoteCount++; arena.Proposal = null; arena.OpenVotes.Clear();
		AddEvent(arena, "player_eliminated", target, new { reason = "arena_vote", voteNumber = arena.VoteCount });
		foreach (var agent in arena.Agents.Where(agent => !agent.IsEliminated)) agent.Memory.Add($"{eliminated.Name} was eliminated by vote.");
		if (ActiveCount(arena) <= 3) Finish(arena, AiTrainingArenaStatus.Finished, null);
	}

	private static bool RevealsReady(AiTrainingArena arena) => arena.Agents.Where(agent => !agent.IsEliminated).All(agent => agent.RevealedCharacteristics.Count >= 3);
	private static int ActiveCount(AiTrainingArena arena) => arena.Agents.Count(agent => !agent.IsEliminated);
	private static AiTrainingAgent PickTarget(AiTrainingArena arena, AiTrainingAgent actor) => arena.Agents.Where(agent => !agent.IsEliminated && agent.Id != actor.Id).OrderBy(agent => agent.Seat).First();
	private static IReadOnlyList<string> AllowedActions(AiTrainingArena arena, AiTrainingAgent actor) => actor.IsEliminated ? [AiTrainingAction.Wait.ToString()] : [.. Enum.GetNames<AiTrainingAction>()];
	private static Dictionary<string, string> BuildCharacteristics(Player player) => new(StringComparer.OrdinalIgnoreCase)
	{ ["profession"] = player.Profession?.Name ?? "Unknown", ["health"] = player.PhysicalHealth?.Name ?? "Unknown", ["hobby"] = player.Hobby?.Name ?? "Unknown", ["trait"] = player.CharacterTrait?.Name ?? "Unknown", ["phobia"] = player.Phobia?.Name ?? "Unknown", ["fact"] = player.Fact?.Name ?? "Unknown" };
	private object VisibleState(AiTrainingArena arena, AiTrainingAgent actor) => new { step = arena.Step, ownCharacteristics = actor.OwnCharacteristics, ownRevealed = actor.RevealedCharacteristics, publicFacts = actor.PublicKnowledge, publicClaims = arena.Agents.SelectMany(agent => agent.PublicClaims), ownBluffs = actor.ExplicitBluffs, memory = actor.Memory.TakeLast(20), messages = arena.Messages.TakeLast(12), activePlayers = arena.Agents.Where(agent => !agent.IsEliminated).Select(agent => new { agent.Id, agent.Name, agent.Seat, revealed = agent.RevealedCharacteristics }), proposal = arena.Proposal == null ? null : new { arena.Proposal.Id, arena.Proposal.ProposerId, accepted = arena.Proposal.AcceptedBy.Count } };
	private object BuildView(AiTrainingArena arena, string? selected)
	{
		var agent = arena.Agents.FirstOrDefault(item => item.Id == selected) ?? arena.Agents.FirstOrDefault();
		var lastDecision = agent == null ? null : arena.Decisions.LastOrDefault(item => item.AgentId == agent.Id);
		var safeDecision = lastDecision == null ? null : new
		{
			lastDecision.Action,
			lastDecision.TargetPlayerId,
			lastDecision.Message,
			lastDecision.Strategy,
			lastDecision.Confidence,
			lastDecision.Accepted,
			lastDecision.ValidationError,
			lastDecision.Provider,
			lastDecision.Model,
			lastDecision.GenerationMode,
			lastDecision.PublicClaims,
			lastDecision.ExplicitBluffs,
			lastDecision.ProviderError,
			lastDecision.AtUtc
		};
		return new
		{
			arena.Id,
			status = arena.Status.ToString(),
			arena.Step,
			arena.VoteCount,
			arena.LastIntervention,
			arena.Provider,
			arena.Model,
			arena.GenerationMode,
			agents = arena.Agents.Select(item => new { item.Id, item.Name, item.Seat, item.IsEliminated, revealed = item.RevealedCharacteristics }),
			messages = arena.Messages.TakeLast(100),
			events = arena.Events.TakeLast(100),
			selectedAgent = agent == null ? null : new { agent.Id, agent.Name, objective = "Remain among the final bunker survivors.", ownCharacteristics = agent.OwnCharacteristics, publicKnowledge = agent.PublicKnowledge, memory = agent.Memory.TakeLast(30), agent.LastStrategy, agent.LastDecision, agent.LastError, LastDecisionMetadata = safeDecision },
			proposal = arena.Proposal,
			openVotes = arena.OpenVotes.Count,
			datasetExportUrl = $"/ai-arena/export/{arena.Id}"
		};
	}
	private void AddEvent(AiTrainingArena arena, string type, string? agentId, object data) { var item = new AiTrainingEvent(Guid.NewGuid().ToString("N"), arena.Step, type, agentId, data, _clock.GetUtcNow()); arena.Events.Add(item); _dataset.AppendEvent(arena, item); }
	private void Finish(AiTrainingArena arena, AiTrainingArenaStatus status, string? intervention) { arena.Status = status; arena.EndedAtUtc = _clock.GetUtcNow(); arena.LastIntervention = intervention; if (intervention != null) AddEvent(arena, "simulator_intervention", null, new { intervention }); else AddEvent(arena, "arena_finished", null, new { winners = arena.Agents.Where(agent => !agent.IsEliminated).Select(agent => agent.Id) }); }
	private Task PublishAsync(AiTrainingArena arena, CancellationToken token) => _hub.Clients.Group(arena.Id).SendAsync("AiArenaStateUpdated", BuildView(arena, null), token);
	private ArenaConfiguration ResolveConfiguration(AiTrainingArenaRequest? request)
	{
		var provider = NormalizeProvider(request?.Provider ?? _options.Provider);
		var mode = NormalizeGenerationMode(request?.GenerationMode ?? _options.GenerationMode);
		return provider == "Deterministic"
			? new(provider, "deterministic", mode, false)
			: new(provider, _options.Model, mode, _options.UseLiveProvider);
	}

	private static string NormalizeProvider(string? provider) => provider?.Trim().ToLowerInvariant() switch
	{
		"local" => "Local",
		"gemini" => "Gemini",
		"groq" => "Groq",
		"openrouter" => "OpenRouter",
		"deterministic" => "Deterministic",
		_ => "Deterministic"
	};
	private static string NormalizeGenerationMode(string? mode) => string.Equals(mode, "Strategic", StringComparison.OrdinalIgnoreCase) ? "Strategic" : "Direct";
	private sealed record ArenaConfiguration(string Provider, string Model, string GenerationMode, bool UseLiveProvider);
	private sealed record Decision(AiTrainingAction Action, string? TargetPlayerId, string? Message, string? Strategy, double? Confidence,
		int? InputTokens = null, int? OutputTokens = null, string? PrivateStrategicPlan = null,
		IReadOnlyList<AiTrainingStatement>? PublicClaims = null, IReadOnlyList<AiTrainingStatement>? ExplicitBluffs = null, string? ProviderError = null);
}
