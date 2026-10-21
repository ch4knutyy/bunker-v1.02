using System.Collections.Concurrent;
using System.Diagnostics;
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
	public int MaxResponseTokens { get; set; } = 320;
	public int MaxPromptCharacters { get; set; } = 4800;
	public int DirectContextTokenBudget { get; set; } = 1800;
	public int StrategicContextTokenBudget { get; set; } = 1200;
	public int StrategicPlanResponseTokens { get; set; } = 160;
	public int JsonCorrectionResponseTokens { get; set; } = 256;
	public int MaxConsecutiveProviderFailures { get; set; } = 3;
	public bool UseJsonResponseFormat { get; set; }
	// Keep the arena on the canonical classic threat schedule unless a developer changes it explicitly.
	public int FirstThreatRound { get; set; } = 3;
	public ThreatFrequencyMode ThreatFrequency { get; set; } = ThreatFrequencyMode.OncePerGame;
	public int? MaxThreatsPerGame { get; set; } = 1;
	public bool AvoidRepeatedThreats { get; set; } = true;
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
	public string SpeedPreset { get; set; } = "Balanced";
	public int AgentCount { get; set; } = 6;
	public int SurvivorTarget { get; set; } = 3;
	public int RequiredRevealsPerAgent { get; set; } = 3;
	public HashSet<string> EnabledCharacteristics { get; set; } = new(StringComparer.OrdinalIgnoreCase);
	public bool UseLiveProvider { get; set; }
	public int ModelRequestCount { get; set; }
	public int ConsecutiveProviderFailures { get; set; }
	public Apocalypse? Apocalypse { get; set; }
	public BunkerInfo? Bunker { get; set; }
	public List<AiTrainingArenaThreat> ThreatHistory { get; set; } = [];
	public List<int> ThreatRoundsEvaluated { get; set; } = [];
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
	public string? LastStrategicPlan { get; set; }
	public int LastStrategicPlanStep { get; set; }
	public string? LastDecision { get; set; }
	public string? LastError { get; set; }
}

public sealed record AiTrainingMessage(string Id, int Step, string AgentId, string AgentName, string Text, DateTimeOffset AtUtc);
public sealed record AiTrainingEvent(string Id, int Step, string Type, string? AgentId, object Data, DateTimeOffset AtUtc);
public sealed record AiTrainingStatement(string Classification, string Text, string AgentId, int Step);
public sealed class AiTrainingArenaThreat
{
	public string Id { get; init; } = "";
	public string Name { get; init; } = "";
	public string Description { get; init; } = "";
	public string Severity { get; init; } = "medium";
	public string Category { get; init; } = "";
	public List<string> Requirements { get; init; } = [];
	public List<string> Risks { get; init; } = [];
	public List<string> Consequences { get; init; } = [];
	public int ActivatedAtRound { get; init; }
	public int VoteCountAtActivation { get; init; }
	public int ActivatedAtStep { get; init; }
	public bool IsActive { get; set; }
}
public sealed record AiTrainingDecision(string Id, int Step, string AgentId, object VisibleState, IReadOnlyList<string> AllowedActions,
	AiTrainingAction Action, string? TargetPlayerId, string? Message, string? Strategy, double? Confidence, bool Accepted, string? ValidationError,
	string Provider, string Model, int? InputTokens, int? OutputTokens, DateTimeOffset AtUtc,
	string GenerationMode = "Direct", string? PrivateStrategicPlan = null, IReadOnlyList<AiTrainingStatement>? PublicClaims = null,
	IReadOnlyList<AiTrainingStatement>? ExplicitBluffs = null, string? ProviderError = null, string? ProviderErrorDetail = null,
	int RequestAttempts = 1, long? RequestDurationMilliseconds = null, long? PromptBuildMilliseconds = null,
	long? GenerationMilliseconds = null, long? StepDurationMilliseconds = null, int? PromptCharacters = null,
	int? EstimatedPromptTokens = null, long? PlanGenerationMilliseconds = null, bool FallbackWait = false,
	bool StrategicPlanRefreshed = false);
public sealed record AiTrainingVoteProposal(string Id, string ProposerId, HashSet<string> AcceptedBy, HashSet<string> RejectedBy, DateTimeOffset AtUtc, bool IsOpen = false);
public sealed record AiTrainingArenaRequest(string? Provider, string? GenerationMode, int? AgentCount = null,
	string? SpeedPreset = null, List<string>? EnabledCharacteristics = null);

public sealed class AiTrainingDatasetStore
{
	private readonly string _root;
	private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
	private static readonly JsonSerializerOptions JsonLine = new(JsonSerializerDefaults.Web);

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
			schemaVersion = 2,
			sessionId = arena.Id,
			startedAtUtc = arena.StartedAtUtc,
			ruleVersion = "ai-training-arena-v2",
			playerCount = arena.Agents.Count,
			provider = arena.Provider,
			model = arena.Model,
			generationMode = arena.GenerationMode,
			useLiveProvider = arena.UseLiveProvider,
			voteApprovalPercent = options.VoteApprovalPercent,
			scenario = new
			{
				apocalypse = arena.Apocalypse,
				bunker = arena.Bunker,
				threatSchedule = new { options.FirstThreatRound, frequency = options.ThreatFrequency.ToString(), options.MaxThreatsPerGame }
			},
			initialCharacters = arena.Agents.Select(agent => new { agent.Id, agent.Name, agent.Seat, characteristics = agent.OwnCharacteristics })
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
				apocalypseId = arena.Apocalypse?.Id,
				bunkerId = arena.Bunker?.Id,
				threats = arena.ThreatHistory,
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
		File.AppendAllText(Path.Combine(SessionPath(id), name), JsonSerializer.Serialize(value, JsonLine) + Environment.NewLine, Encoding.UTF8);
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
	private static readonly string[] Names = ["Марія", "Олексій", "Ірина", "Данило", "Софія", "Максим", "Олена", "Тарас", "Вікторія", "Андрій", "Наталія", "Роман"];
	private static readonly string[] Personas = [
		"Емпатична й обережна: перевіряє ризики перед довірою.",
		"Прагматичний: мислить ресурсами, надійністю та доказами.",
		"Соціальна психологиня: будує союзи й помічає суперечності у словах.",
		"Прямолінійний: цінує дію, чесність і чітке голосування.",
		"Обережна дослідниця: ставить уточнювальні питання й не поспішає з висновками.",
		"Іронічний стратег: шукає важелі впливу, але не розкриває зайвого.",
		"Спостережлива: запам’ятовує обіцянки й перевіряє факти.",
		"Рішучий перемовник: швидко формує коаліції, але не довіряє без доказів.",
		"Врівноважена: зважує користь команди та особистий ризик.",
		"Скептичний аналітик: ставить точні запитання й шукає нестикування.",
		"Дипломатична: знижує конфлікти та домовляється про взаємні вигоди.",
		"Незалежний: обережно блефує і змінює курс лише за новими фактами."
	];
	private static readonly string[] CharacteristicCategories = ["personality", "body", "profession", "physicalHealth", "mentalHealth", "hobby", "characterTrait", "phobia", "inventory", "property", "fact", "specialCard"];
	private static readonly AiTrainingStructuredOutput StrategicPlanSchema = new("bunker_private_plan", new
	{
		type = "object",
		additionalProperties = false,
		properties = new { strategy = new { type = "string", maxLength = 280 } },
		required = new[] { "strategy" }
	});
	private static readonly AiTrainingStructuredOutput DecisionSchema = new("bunker_turn", new
	{
		type = "object",
		additionalProperties = false,
		properties = new
		{
			action = new { type = "string", @enum = Enum.GetNames<AiTrainingAction>() },
			targetPlayerId = new { type = new[] { "string", "null" } },
			message = new { type = new[] { "string", "null" }, maxLength = 500 },
			strategy = new { type = new[] { "string", "null" }, maxLength = 280 },
			confidence = new { type = new[] { "number", "null" }, minimum = 0, maximum = 1 },
			claims = new { type = "array", items = new { type = "string", maxLength = 300 }, maxItems = 3 },
			bluffs = new { type = "array", items = new { type = "string", maxLength = 300 }, maxItems = 3 }
		},
		required = new[] { "action", "targetPlayerId", "message", "strategy", "confidence", "claims", "bluffs" }
	});
	private readonly ConcurrentDictionary<string, AiTrainingArena> _arenas = new(StringComparer.OrdinalIgnoreCase);
	private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.OrdinalIgnoreCase);
	private readonly CharacterGeneratorService _characters;
	private readonly GameDataService _gameData;
	private readonly IAiProvider _provider;
	private readonly ILocalMamayLmProvider _localProvider;
	private readonly AiTrainingDatasetStore _dataset;
	private readonly AiTrainingArenaOptions _options;
	private readonly IHubContext<AiTrainingArenaHub> _hub;
	private readonly TimeProvider _clock;
	private readonly ILogger<AiTrainingArenaService> _logger;

	public AiTrainingArenaService(CharacterGeneratorService characters, GameDataService gameData, IAiProvider provider, ILocalMamayLmProvider localProvider, AiTrainingDatasetStore dataset,
		IOptions<AiTrainingArenaOptions> options, IHubContext<AiTrainingArenaHub> hub, TimeProvider clock, ILogger<AiTrainingArenaService> logger)
	{ _characters = characters; _gameData = gameData; _provider = provider; _localProvider = localProvider; _dataset = dataset; _options = options.Value; _hub = hub; _clock = clock; _logger = logger; }

	public Task<AiTrainingArena> CreateAsync(CancellationToken token) => CreateAsync(null, token);

	public async Task<AiTrainingArena> CreateAsync(AiTrainingArenaRequest? request, CancellationToken token)
	{
		if (!_options.Enabled) throw new InvalidOperationException("ai_training_arena_disabled");
		if (_arenas.Values.Count(arena => arena.Status is AiTrainingArenaStatus.Running or AiTrainingArenaStatus.Paused) >= Math.Max(1, _options.MaxConcurrentArenas)) throw new InvalidOperationException("arena_concurrency_limit");
		var configuration = ResolveConfiguration(request);
		var enabledCharacteristics = NormalizeCharacteristicCategories(request?.EnabledCharacteristics);
		if (enabledCharacteristics.Count == 0) throw new InvalidOperationException("arena_characteristics_required");
		var agentCount = Math.Clamp(request?.AgentCount ?? 6, 3, Names.Length);
		var arena = new AiTrainingArena
		{
			StartedAtUtc = _clock.GetUtcNow(),
			Provider = configuration.Provider,
			Model = configuration.Model,
			GenerationMode = configuration.GenerationMode,
			SpeedPreset = NormalizeSpeedPreset(request?.SpeedPreset),
			AgentCount = agentCount,
			SurvivorTarget = SurvivorTargetFor(agentCount),
			RequiredRevealsPerAgent = Math.Min(3, enabledCharacteristics.Count),
			EnabledCharacteristics = enabledCharacteristics,
			UseLiveProvider = configuration.UseLiveProvider,
			Apocalypse = SelectApocalypse(),
			Bunker = SelectBunker()
		};
		var generatedPlayers = new List<Player>();
		for (var index = 0; index < agentCount; index++)
		{
			var player = _characters.Generate(Names[index], generatedPlayers);
			generatedPlayers.Add(player);
			arena.Agents.Add(new AiTrainingAgent
			{
				Id = $"ai-{index + 1}",
				Name = Names[index],
				Seat = index + 1,
				Persona = Personas[index],
				OwnCharacteristics = BuildCharacteristics(player).Where(item => enabledCharacteristics.Contains(item.Key))
					.ToDictionary(item => item.Key, item => item.Value, StringComparer.OrdinalIgnoreCase)
			});
		}
		_arenas[arena.Id] = arena; _dataset.Create(arena, _options); AddEvent(arena, "arena_created", null, new { playerCount = agentCount, apocalypseId = arena.Apocalypse?.Id, bunkerId = arena.Bunker?.Id, arena.SpeedPreset, characteristics = enabledCharacteristics }); _dataset.Save(arena);
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
		agentCount = 6,
		speedPreset = "Balanced",
		characteristicCategories = CharacteristicCategories,
		defaultEnabledCharacteristics = CharacteristicCategories,
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
	public async Task<object> ResumeAsync(string id, CancellationToken token) { var arena = Get(id); await MutateAsync(arena, _ => { if (arena.Status == AiTrainingArenaStatus.Paused) { arena.Status = AiTrainingArenaStatus.Running; arena.ConsecutiveProviderFailures = 0; AddEvent(arena, "arena_resumed", null, new { }); _ = RunAsync(arena.Id); } }, token); return BuildView(arena, null); }
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
		var stepStopwatch = Stopwatch.StartNew();
		if (arena.Status is AiTrainingArenaStatus.Finished or AiTrainingArenaStatus.Cancelled or AiTrainingArenaStatus.Faulted) return;
		if (arena.Step >= Math.Max(10, _options.MaxSteps) || arena.Messages.Count >= Math.Max(10, _options.MaxMessages)) { Finish(arena, AiTrainingArenaStatus.Finished, "simulator_limit_reached"); return; }
		var active = arena.Agents.Where(agent => !agent.IsEliminated).OrderBy(agent => agent.Seat).ToList();
		if (active.Count <= EffectiveSurvivorTarget(arena)) { Finish(arena, AiTrainingArenaStatus.Finished, null); return; }
		var actor = active[arena.Cursor % active.Count]; arena.Cursor++; arena.Step++;
		ActivateThreatsForCurrentRound(arena);
		var contextStopwatch = Stopwatch.StartNew();
		var visible = VisibleState(arena, actor);
		var result = await DecideAsync(arena, actor, visible, contextStopwatch.ElapsedMilliseconds, token);
		var accepted = ApplyDecision(arena, actor, result, out var validation);
		var fallbackWait = !string.IsNullOrWhiteSpace(result.ProviderError) || !accepted;
		var decision = new AiTrainingDecision(Guid.NewGuid().ToString("N"), arena.Step, actor.Id, visible, AllowedActions(arena, actor), result.Action, result.TargetPlayerId, result.Message, result.Strategy, result.Confidence, accepted, validation, arena.Provider, arena.Model, result.InputTokens, result.OutputTokens, _clock.GetUtcNow(),
			arena.GenerationMode, result.PrivateStrategicPlan, result.PublicClaims, result.ExplicitBluffs, result.ProviderError, result.ProviderErrorDetail, result.RequestAttempts, result.RequestDurationMilliseconds,
			result.PromptBuildMilliseconds, result.GenerationMilliseconds, stepStopwatch.ElapsedMilliseconds, result.PromptCharacters, result.EstimatedPromptTokens,
			result.PlanGenerationMilliseconds, fallbackWait, result.StrategicPlanRefreshed);
		arena.Decisions.Add(decision); _dataset.AppendDecision(arena, decision);
		if (result.StrategicPlanRefreshed && !string.IsNullOrWhiteSpace(result.PrivateStrategicPlan)) { actor.LastStrategicPlan = result.PrivateStrategicPlan; actor.LastStrategicPlanStep = arena.Step; }
		actor.LastDecision = result.Action.ToString(); actor.LastStrategy = result.Strategy; actor.LastError = result.ProviderError ?? validation;
		if (accepted) RecordPublicStatements(arena, actor, result);
		if (!string.IsNullOrWhiteSpace(result.ProviderError))
		{
			arena.ConsecutiveProviderFailures++;
			AddEvent(arena, "provider_error", actor.Id, new { error = result.ProviderError, detail = result.ProviderErrorDetail, provider = arena.Provider, attempts = result.RequestAttempts, durationMs = result.RequestDurationMilliseconds });
			if (arena.ConsecutiveProviderFailures >= Math.Clamp(_options.MaxConsecutiveProviderFailures, 1, 10))
			{
				arena.Status = AiTrainingArenaStatus.Paused;
				arena.LastIntervention = $"ai_generation_paused:{result.ProviderError}";
				AddEvent(arena, "arena_paused_provider_error", actor.Id, new { error = result.ProviderError, detail = result.ProviderErrorDetail });
			}
		}
		else arena.ConsecutiveProviderFailures = 0;
		if (!accepted) { AddEvent(arena, "decision_rejected", actor.Id, new { validation }); ApplyDecision(arena, actor, new Decision(AiTrainingAction.Wait, null, null, "safe fallback", null), out _); }
	}

	private async Task<Decision> DecideAsync(AiTrainingArena arena, AiTrainingAgent actor, object visible, long visibleStateMilliseconds, CancellationToken token)
	{
		var fallback = DeterministicDecision(arena, actor);
		if (!arena.UseLiveProvider) return fallback with { PromptBuildMilliseconds = visibleStateMilliseconds };

		var promptBuildMilliseconds = visibleStateMilliseconds;
		long generationMilliseconds = 0;
		long planGenerationMilliseconds = 0;
		var strategicPlanRefreshed = false;
		var promptCharacters = 0;
		var contextStopwatch = Stopwatch.StartNew();
		var systemPrompt = BuildSystemPrompt(actor);
		var context = JsonSerializer.Serialize(visible);
		promptBuildMilliseconds += contextStopwatch.ElapsedMilliseconds;
		var strategic = string.Equals(arena.GenerationMode, "Strategic", StringComparison.OrdinalIgnoreCase);

		Decision WithMetrics(Decision decision)
		{
			var estimatedTokens = promptCharacters == 0 ? (int?)null : (int)Math.Ceiling(promptCharacters / 3.0);
			return decision with
			{
				PromptBuildMilliseconds = promptBuildMilliseconds,
				GenerationMilliseconds = generationMilliseconds == 0 ? null : generationMilliseconds,
				PlanGenerationMilliseconds = planGenerationMilliseconds == 0 ? null : planGenerationMilliseconds,
				StrategicPlanRefreshed = strategicPlanRefreshed,
				RequestDurationMilliseconds = generationMilliseconds == 0 ? decision.RequestDurationMilliseconds : generationMilliseconds,
				PromptCharacters = promptCharacters == 0 ? null : promptCharacters,
				EstimatedPromptTokens = estimatedTokens
			};
		}

		string? privatePlan = null;
		if (strategic && ShouldRefreshStrategicPlan(arena, actor))
		{
			contextStopwatch.Restart();
			var planPrompt = $$"""Приватний план: поверни JSON лише з полем strategy (1–2 короткі речення): що розкрити, кому довіряти/не довіряти, коли голосувати. CTX={{context}}""";
			promptBuildMilliseconds += contextStopwatch.ElapsedMilliseconds;
			promptCharacters += systemPrompt.Length + planPrompt.Length;
			var planReply = await GenerateWithRetryAsync(arena, actor, systemPrompt, planPrompt, _options.StrategicPlanResponseTokens, StrategicPlanSchema, .45, token);
			generationMilliseconds += planReply.DurationMilliseconds ?? 0;
			planGenerationMilliseconds += planReply.DurationMilliseconds ?? 0;
			if (!TryReadStrategicPlan(planReply, out privatePlan, out var planError))
			{
				_logger.LogWarning("AI training strategic plan unavailable for {ArenaId}, agent {AgentId}: {Reason}", arena.Id, actor.Id, planError);
				privatePlan = FallbackPrivatePlan(actor);
			}
			else strategicPlanRefreshed = true;
		}
		else if (strategic) privatePlan = FallbackPrivatePlan(actor);

		contextStopwatch.Restart();
		var prompt = $$"""Хід. Тільки JSON: {"action":"Speak|RevealCharacteristic|ProposeAlliance|ProposeVote|AcceptVoteProposal|RejectVoteProposal|CastVote|Wait","targetPlayerId":"ai-id|characteristic|null","message":"українська репліка|null","strategy":"коротко","confidence":0.0,"claims":[],"bluffs":[]}. FACT лише з CTX; CLAIM неперевірений; BLUFF — лише твоя навмисна неправда. Дії: {{string.Join(',', AllowedActions(arena, actor))}}. CTX={{context}}{{(privatePlan == null ? string.Empty : $" PLAN={privatePlan}")}}""";
		promptBuildMilliseconds += contextStopwatch.ElapsedMilliseconds;
		promptCharacters += systemPrompt.Length + prompt.Length;
		var reply = await GenerateWithRetryAsync(arena, actor, systemPrompt, prompt, _options.MaxResponseTokens, DecisionSchema, .5, token);
		generationMilliseconds += reply.DurationMilliseconds ?? 0;
		if (string.IsNullOrWhiteSpace(reply.Text)) return WithMetrics(ProviderFailure(reply.ErrorCode ?? "ai_provider_failed", privatePlan, reply.ErrorDetail, reply.Attempts, reply.DurationMilliseconds));
		if (TryParseDecision(arena, actor, reply, privatePlan, out var decision, out var parseError)) return WithMetrics(decision);

		contextStopwatch.Restart();
		var correctionPrompt = $"""JSON only. Fields: action,targetPlayerId,message,strategy,confidence,claims,bluffs. Allowed action: {string.Join(',', AllowedActions(arena, actor))}. Fix without new facts: {TrimForPrompt(reply.Text, 700)}""";
		promptBuildMilliseconds += contextStopwatch.ElapsedMilliseconds;
		promptCharacters += correctionPrompt.Length + 120;
		var corrected = await GenerateWithRetryAsync(arena, actor, "Поверни лише валідний JSON ходу без нових фактів.", correctionPrompt, _options.JsonCorrectionResponseTokens, DecisionSchema, .45, token);
		generationMilliseconds += corrected.DurationMilliseconds ?? 0;
		if (string.IsNullOrWhiteSpace(corrected.Text)) return WithMetrics(ProviderFailure(corrected.ErrorCode ?? "ai_provider_failed", privatePlan, corrected.ErrorDetail, corrected.Attempts, corrected.DurationMilliseconds));
		if (TryParseDecision(arena, actor, corrected, privatePlan, out decision, out parseError)) return WithMetrics(decision);
		return WithMetrics(ProviderFailure("ai_malformed_response", privatePlan, parseError, corrected.Attempts, corrected.DurationMilliseconds));
	}

	private static string BuildSystemPrompt(AiTrainingAgent actor) =>
		$"Ти {actor.Name}, гравець «Бункер». Характер: {actor.Persona}. Мета: вижити. SELF — твої справжні дані; FACT — лише розкриті дані інших; CLAIM — неперевірена заява; BLUFF — тільки твій приватно позначений блеф. Не вигадуй фактів, не розкривай приховане інших, план чи службові позначки. Говори, відкривай лише свій ключ і голосуй лише за доступної дії. Пиши природною українською, 1–3 речення.";

	private async Task<AiProviderReply> GenerateWithRetryAsync(AiTrainingArena arena, AiTrainingAgent actor, string systemPrompt, string userPrompt,
		int maxResponseTokens, AiTrainingStructuredOutput structuredOutput, double temperature, CancellationToken token)
	{
		AiProviderReply reply = new(null, "ai_provider_failed");
		var attempts = 0;
		long totalDurationMilliseconds = 0;
		var contextReduced = false;
		var limit = Math.Clamp(_options.LiveProviderAttempts, 1, 3);
		while (attempts < limit)
		{
			if (arena.ModelRequestCount >= Math.Max(1, _options.MaxLiveRequests))
				return new(null, "ai_live_request_limit", Attempts: attempts);
			attempts++;
			arena.ModelRequestCount++;
			try { reply = await GenerateAsync(arena, actor, systemPrompt, userPrompt, maxResponseTokens, structuredOutput, temperature, token); }
			catch (Exception exception) when (exception is not OperationCanceledException || !token.IsCancellationRequested)
			{
				_logger.LogWarning(exception, "AI training generation failed for {ArenaId}, agent {AgentId}, attempt {Attempt}", arena.Id, actor.Id, attempts);
				reply = new(null, "ai_provider_unavailable", ErrorDetail: "local_generation_exception");
			}
			totalDurationMilliseconds += reply.DurationMilliseconds ?? 0;
			if (reply.ErrorCode == "ai_context_overflow" && !contextReduced && attempts < limit)
			{
				contextReduced = true;
				userPrompt = TrimForPrompt(userPrompt, Math.Max(2000, _options.MaxPromptCharacters / 2));
				continue;
			}
			if (!string.IsNullOrWhiteSpace(reply.Text) || !IsRetryable(reply.ErrorCode) || attempts >= limit)
				return reply with { Attempts = attempts, DurationMilliseconds = totalDurationMilliseconds == 0 ? reply.DurationMilliseconds : totalDurationMilliseconds };
			await Task.Delay(200, token);
		}
		return reply with { Attempts = attempts, DurationMilliseconds = totalDurationMilliseconds == 0 ? reply.DurationMilliseconds : totalDurationMilliseconds };
	}

	private static bool IsRetryable(string? error) => error is "ai_timeout" or "ai_local_unavailable" or "ai_provider_unavailable" or "ai_rate_limited" or "ai_response_truncated";

	private bool TryParseDecision(AiTrainingArena arena, AiTrainingAgent actor, AiProviderReply reply, string? privatePlan, out Decision decision, out string error)
	{
		decision = ProviderFailure("ai_malformed_response", privatePlan);
		error = reply.ErrorCode == "ai_response_truncated" ? "response_truncated" : "invalid_json";
		if (reply.ErrorCode == "ai_response_truncated") return false;
		try
		{
			using var document = JsonDocument.Parse(ExtractJson(reply.Text ?? string.Empty));
			var root = document.RootElement;
			if (root.ValueKind != JsonValueKind.Object) { error = "json_root_not_object"; return false; }
			if (!root.TryGetProperty("action", out var actionValue) || actionValue.ValueKind != JsonValueKind.String ||
				!Enum.TryParse<AiTrainingAction>(actionValue.GetString(), true, out var action)) { error = "action_missing_or_invalid"; return false; }
			var target = root.TryGetProperty("targetPlayerId", out var targetValue) && targetValue.ValueKind == JsonValueKind.String ? targetValue.GetString() : null;
			if (!CanApplyAction(arena, actor, action, target)) { error = "action_not_available"; return false; }
			var message = root.TryGetProperty("message", out var messageValue) && messageValue.ValueKind == JsonValueKind.String ? messageValue.GetString() : null;
			if ((action is AiTrainingAction.Speak or AiTrainingAction.ProposeAlliance) && string.IsNullOrWhiteSpace(message)) { error = "message_required"; return false; }
			var strategy = root.TryGetProperty("strategy", out var strategyValue) && strategyValue.ValueKind == JsonValueKind.String ? strategyValue.GetString() : null;
			double? confidence = root.TryGetProperty("confidence", out var confidenceValue)
	&& confidenceValue.TryGetDouble(out var parsed)
		? Math.Clamp(parsed, 0, 1)
		: null;
			decision = new Decision(action, target, message, strategy, confidence, reply.Usage?.InputTokens, reply.Usage?.OutputTokens, privatePlan,
				ReadStatements(root, "claims", "CLAIM", actor, arena.Step), ReadStatements(root, "bluffs", "BLUFF", actor, arena.Step), null, null, reply.Attempts, reply.DurationMilliseconds);
			error = string.Empty;
			return true;
		}
		catch (JsonException) { error = "invalid_or_incomplete_json"; return false; }
	}

	private Task<AiProviderReply> GenerateAsync(AiTrainingArena arena, AiTrainingAgent actor, string systemPrompt, string userPrompt,
		int maxResponseTokens, AiTrainingStructuredOutput structuredOutput, double temperature, CancellationToken token)
	{
		if (string.Equals(arena.Provider, "Local", StringComparison.OrdinalIgnoreCase))
			return _localProvider.GenerateAsync(new AiTrainingModelRequest(arena.Model, systemPrompt, TrimForPrompt(userPrompt, _options.MaxPromptCharacters), maxResponseTokens,
				_options.UseJsonResponseFormat, structuredOutput, temperature), token);
		var companion = new AiChatCompanion { Id = actor.Id, PlayerStableId = actor.Id, Name = actor.Name, Provider = arena.Provider, Model = arena.Model };
		return _provider.GenerateReplyAsync(companion, systemPrompt + "\n\n" + userPrompt, token);
	}

	private static Decision ProviderFailure(string error, string? privatePlan = null, string? detail = null, int attempts = 1, long? durationMilliseconds = null) => new(AiTrainingAction.Wait, null, null, "provider failure", null,
		PrivateStrategicPlan: privatePlan, ProviderError: error, ProviderErrorDetail: detail, RequestAttempts: attempts, RequestDurationMilliseconds: durationMilliseconds);

	private static string TrimForPrompt(string value, int maximumCharacters)
	{
		var limit = Math.Clamp(maximumCharacters, 48, 20_000);
		if (value.Length <= limit) return value;
		var first = (int)(limit * .65);
		return value[..first] + "\n[…старі деталі контексту скорочено…]\n" + value[^Math.Max(1, limit - first)..];
	}

	private static bool TryReadStrategicPlan(AiProviderReply reply, out string? plan, out string error)
	{
		plan = null;
		error = reply.ErrorCode ?? "strategic_plan_json";
		if (reply.ErrorCode == "ai_response_truncated") { error = "strategic_plan_truncated"; return false; }
		try
		{
			using var document = JsonDocument.Parse(ExtractJson(reply.Text ?? string.Empty));
			if (document.RootElement.ValueKind != JsonValueKind.Object ||
				!document.RootElement.TryGetProperty("strategy", out var value) || value.ValueKind != JsonValueKind.String ||
				string.IsNullOrWhiteSpace(value.GetString()))
			{
				error = "strategic_plan_json";
				return false;
			}
			plan = TrimForPrompt(value.GetString()!.Trim(), 320);
			error = string.Empty;
			return true;
		}
		catch (JsonException) { error = "strategic_plan_invalid_or_incomplete_json"; return false; }
	}

	private static string FallbackPrivatePlan(AiTrainingAgent actor) => string.IsNullOrWhiteSpace(actor.LastStrategicPlan)
		? "Збирати FACT, обережно розкривати корисне та голосувати лише за достатніх відкритих даних."
		: TrimForPrompt(actor.LastStrategicPlan, 320);

	private static bool ShouldRefreshStrategicPlan(AiTrainingArena arena, AiTrainingAgent actor)
	{
		if (string.IsNullOrWhiteSpace(actor.LastStrategicPlan)) return true;
		if (arena.ThreatHistory.Any(threat => threat.IsActive && threat.ActivatedAtStep > actor.LastStrategicPlanStep)) return true;
		if (arena.Proposal?.IsOpen == true || arena.OpenVotes.Count > 0) return true;
		var active = Math.Max(1, ActiveCount(arena));
		var interval = NormalizeSpeedPreset(arena.SpeedPreset) switch { "Fast" => active * 3, "Deep" => active, _ => active * 2 };
		return arena.Step - actor.LastStrategicPlanStep >= interval;
	}

	private static string ExtractJson(string text)
	{
		var trimmed = text.Trim();
		var fence = trimmed.IndexOf("```", StringComparison.Ordinal);
		if (fence >= 0)
		{
			var firstLine = trimmed.IndexOf('\n', fence);
			var closingFence = firstLine >= 0 ? trimmed.IndexOf("```", firstLine, StringComparison.Ordinal) : -1;
			if (closingFence > firstLine) trimmed = trimmed[(firstLine + 1)..closingFence].Trim();
		}
		var objectStart = trimmed.IndexOf('{');
		var objectEnd = trimmed.LastIndexOf('}');
		return objectStart >= 0 && objectEnd >= objectStart ? trimmed[objectStart..(objectEnd + 1)] : trimmed;
	}

	private static IReadOnlyList<AiTrainingStatement> ReadStatements(JsonElement root, string property, string classification, AiTrainingAgent actor, int step)
	{
		if (!root.TryGetProperty(property, out var values) || values.ValueKind != JsonValueKind.Array) return [];
		return values.EnumerateArray().Where(value => value.ValueKind == JsonValueKind.String)
			.Select(value => value.GetString()).OfType<string>().Select(value => value.Trim()).Where(value => value.Length > 0).Take(3)
			.Select(value => new AiTrainingStatement(classification, value[..Math.Min(value.Length, 300)], actor.Id, step)).ToList();
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
		if (!string.IsNullOrWhiteSpace(hidden) && actor.RevealedCharacteristics.Count < EffectiveRequiredReveals(arena)) return new(AiTrainingAction.RevealCharacteristic, hidden, null, "Meet the disclosure threshold", .9);
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
		if (ActiveCount(arena) <= EffectiveSurvivorTarget(arena)) Finish(arena, AiTrainingArenaStatus.Finished, null);
	}

	private void ActivateThreatsForCurrentRound(AiTrainingArena arena)
	{
		var round = CurrentRound(arena);
		var maxThreats = _options.MaxThreatsPerGame is { } configured ? Math.Max(0, configured) : int.MaxValue;
		if (round < Math.Clamp(_options.FirstThreatRound, 2, 5) ||
			arena.ThreatHistory.Count >= maxThreats ||
			arena.ThreatHistory.Any(item => item.ActivatedAtRound == round) ||
			arena.ThreatRoundsEvaluated.Contains(round)) return;
		arena.ThreatRoundsEvaluated.Add(round);
		if (!ShouldTriggerThreat(round, arena.ThreatHistory.Count)) return;

		var triggered = arena.ThreatHistory.Select(item => item.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
		var source = _gameData.SelectThreatForRound(round, triggered, _options.AvoidRepeatedThreats, Random.Shared.Next);
		if (source == null) return;

		foreach (var previous in arena.ThreatHistory) previous.IsActive = false;
		var threat = new AiTrainingArenaThreat
		{
			Id = source.Id,
			Name = source.Name,
			Description = source.Description,
			Severity = source.Severity,
			Category = source.Category,
			Requirements = source.Requirements.Where(NotBlank).Take(6).ToList(),
			Risks = source.Risks.Where(NotBlank).Take(6).ToList(),
			Consequences = source.Consequences.Where(NotBlank).Take(6).ToList(),
			ActivatedAtRound = round,
			VoteCountAtActivation = arena.VoteCount,
			ActivatedAtStep = arena.Step,
			IsActive = true
		};
		arena.ThreatHistory.Add(threat);
		foreach (var agent in arena.Agents.Where(agent => !agent.IsEliminated))
			agent.Memory.Add($"FACT ACTIVE THREAT: {threat.Name}. {TrimForPrompt(threat.Description, 180)}");
		AddEvent(arena, "threat_activated", null, new
		{
			threat.Id,
			threat.Name,
			threat.Description,
			threat.Severity,
			threat.Requirements,
			threat.Risks,
			threat.Consequences,
			threat.ActivatedAtRound,
			threat.VoteCountAtActivation
		});
	}

	private bool ShouldTriggerThreat(int completedRound, int triggeredCount) => _options.ThreatFrequency switch
	{
		ThreatFrequencyMode.OncePerGame => triggeredCount == 0,
		ThreatFrequencyMode.EveryRound => true,
		ThreatFrequencyMode.EveryOtherRound => (completedRound - Math.Clamp(_options.FirstThreatRound, 2, 5)) % 2 == 0,
		ThreatFrequencyMode.RandomEligibleRounds => Random.Shared.Next(0, 2) == 0,
		_ => false
	};

	private static bool RevealsReady(AiTrainingArena arena) => arena.Agents.Where(agent => !agent.IsEliminated).All(agent => agent.RevealedCharacteristics.Count >= EffectiveRequiredReveals(arena));
	private static int CurrentRound(AiTrainingArena arena) => Math.Max(1, (arena.Step - 1) / Math.Max(1, arena.AgentCount == 0 ? arena.Agents.Count : arena.AgentCount) + 1);
	private static int ActiveCount(AiTrainingArena arena) => arena.Agents.Count(agent => !agent.IsEliminated);
	private static int EffectiveSurvivorTarget(AiTrainingArena arena) => arena.SurvivorTarget > 0 ? arena.SurvivorTarget : SurvivorTargetFor(Math.Max(3, arena.Agents.Count));
	private static int EffectiveRequiredReveals(AiTrainingArena arena) => arena.RequiredRevealsPerAgent > 0 ? arena.RequiredRevealsPerAgent : 3;
	private static int SurvivorTargetFor(int agentCount) => Math.Clamp((int)Math.Ceiling(agentCount / 2d), 2, Math.Max(2, agentCount - 1));
	private static AiTrainingAgent PickTarget(AiTrainingArena arena, AiTrainingAgent actor) => arena.Agents.Where(agent => !agent.IsEliminated && agent.Id != actor.Id).OrderBy(agent => agent.Seat).First();
	private static IReadOnlyList<string> AllowedActions(AiTrainingArena arena, AiTrainingAgent actor)
	{
		if (actor.IsEliminated) return [AiTrainingAction.Wait.ToString()];
		var actions = new List<string> { AiTrainingAction.Speak.ToString(), AiTrainingAction.ProposeAlliance.ToString(), AiTrainingAction.Wait.ToString() };
		if (actor.OwnCharacteristics.Keys.Any(key => !actor.RevealedCharacteristics.ContainsKey(key))) actions.Add(AiTrainingAction.RevealCharacteristic.ToString());
		if (arena.Proposal == null && arena.OpenVotes.Count == 0 && (RevealsReady(arena) || arena.VoteCount > 0)) actions.Add(AiTrainingAction.ProposeVote.ToString());
		if (arena.Proposal != null && !arena.Proposal.AcceptedBy.Contains(actor.Id) && !arena.Proposal.RejectedBy.Contains(actor.Id))
		{
			actions.Add(AiTrainingAction.AcceptVoteProposal.ToString());
			actions.Add(AiTrainingAction.RejectVoteProposal.ToString());
		}
		if (arena.Proposal?.IsOpen == true && !arena.OpenVotes.ContainsKey(actor.Id)) actions.Add(AiTrainingAction.CastVote.ToString());
		return actions;
	}

	private static bool CanApplyAction(AiTrainingArena arena, AiTrainingAgent actor, AiTrainingAction action, string? target) => action switch
	{
		AiTrainingAction.RevealCharacteristic => !string.IsNullOrWhiteSpace(target) && actor.OwnCharacteristics.ContainsKey(target) && !actor.RevealedCharacteristics.ContainsKey(target),
		AiTrainingAction.CastVote => arena.Proposal?.IsOpen == true && !arena.OpenVotes.ContainsKey(actor.Id) && !string.IsNullOrWhiteSpace(target) && target != actor.Id && arena.Agents.Any(agent => agent.Id == target && !agent.IsEliminated),
		_ => AllowedActions(arena, actor).Contains(action.ToString())
	};
	private static Dictionary<string, string> BuildCharacteristics(Player player) => new(StringComparer.OrdinalIgnoreCase)
	{
		["personality"] = $"Вік: {player.Personality?.Age}; стать: {Display(player.Personality?.Sex, "невідомо")}; орієнтація: {Display(player.Personality?.SexOrientation, "невідомо")}{(player.Personality?.IsChildfree == true ? "; чайлдфрі" : "")}",
		["body"] = $"Зріст: {player.Body?.Height} см; вага: {player.Body?.Weight} кг; тип тіла: {Display(player.Body?.BodyType, "невідомо")}",
		["profession"] = JoinDetails(
			Display(player.Profession?.Name, "Безробітний"),
			player.Profession?.ExperienceYears > 0 ? $"{player.Profession.ExperienceYears} р. досвіду" : null,
			player.Profession?.ProfessionalLevel,
			player.Profession?.SelectedItem is { Length: > 0 } item ? $"предмет: {item}" : null,
			player.Profession?.Skills.Count > 0 ? $"навички: {string.Join(", ", player.Profession.Skills.Take(4))}" : null,
			player.Profession?.Bonus),
		["physicalHealth"] = JoinDetails(Display(player.PhysicalHealth?.Name, "Здоровий"), player.PhysicalHealth?.Description, player.PhysicalHealth?.GameEffect),
		["mentalHealth"] = JoinDetails(Display(player.MentalHealth?.Name, "Стабільний"), player.MentalHealth?.Description, player.MentalHealth?.GameEffect),
		["hobby"] = JoinDetails(
	Display(player.Hobby?.Name, "Немає хобі"),
	player.Hobby?.Item is { Length: > 0 } hobbyItem
		? $"предмет: {hobbyItem}"
		: null,
	player.Hobby?.Bonus),
		["characterTrait"] = JoinDetails(Display(player.CharacterTrait?.Name, "Невизначена"), player.CharacterTrait?.Type),
		["phobia"] = JoinDetails(Display(player.Phobia?.Name, "Немає фобій"), player.Phobia?.Description, player.Phobia?.BunkerEffect),
		["inventory"] = player.Inventory?.Items.Count > 0 ? string.Join(", ", player.Inventory.Items.Take(4).Select(item => JoinDetails(item.Name, item.Description))) : "Порожній",
		["property"] = player.Property == null ? "Немає майна" : Display(player.Property.GetDisplayText("uk"), player.Property.DefinitionId),
		["fact"] = JoinDetails(Display(player.Fact?.Name, "Немає факту"), player.Fact?.Description),
		["specialCard"] = JoinDetails(Display(player.SpecialCard?.Name, "Немає спеціальної карти"), player.SpecialCard?.Description, player.SpecialCard?.Phase)
	};

	private static string Display(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
	private static string JoinDetails(params string?[] values) => string.Join("; ", values.Where(NotBlank).Select(value => value!.Trim())).Trim();
	private static bool NotBlank(string? value) => !string.IsNullOrWhiteSpace(value);
	private object VisibleState(AiTrainingArena arena, AiTrainingAgent actor)
	{
		var limits = GetContextLimits(arena);
		return new
		{
			r = CurrentRound(arena),
			s = arena.Step,
			self = actor.OwnCharacteristics.ToDictionary(item => item.Key, item => TrimForPrompt(item.Value, limits.OwnCharacteristicCharacters), StringComparer.OrdinalIgnoreCase),
			world = BuildVisibleScenario(arena, limits),
			others = arena.Agents.Where(agent => !agent.IsEliminated && agent.Id != actor.Id).Select(agent => new
			{
				id = agent.Id,
				n = agent.Name,
				f = agent.RevealedCharacteristics.ToDictionary(item => item.Key, item => TrimForPrompt(item.Value, limits.OtherCharacteristicCharacters), StringComparer.OrdinalIgnoreCase)
			}),
			vote = new
			{
				n = arena.VoteCount,
				proposal = arena.Proposal?.IsOpen == true,
				proposer = arena.Proposal?.ProposerId,
				yes = arena.Proposal?.AcceptedBy.OrderBy(id => id),
				no = arena.Proposal?.RejectedBy.OrderBy(id => id),
				choices = arena.OpenVotes.OrderBy(item => item.Key).Select(item => new { by = item.Key, target = item.Value })
			},
			claims = arena.Agents.SelectMany(agent => agent.PublicClaims).TakeLast(limits.PublicClaims).Select(item => new { by = item.AgentId, t = TrimForPrompt(item.Text, limits.StatementCharacters) }),
			bluffs = actor.ExplicitBluffs.TakeLast(limits.OwnBluffs).Select(item => TrimForPrompt(item.Text, limits.StatementCharacters)),
			memory = actor.Memory.TakeLast(limits.MemoryItems).Select(item => TrimForPrompt(item, limits.MemoryCharacters)),
			chat = arena.Messages.TakeLast(limits.Messages).Select(message => new { by = message.AgentId, t = TrimForPrompt(message.Text, limits.MessageCharacters) })
		};
	}

	private PromptContextLimits GetContextLimits(AiTrainingArena arena)
	{
		var strategic = string.Equals(arena.GenerationMode, "Strategic", StringComparison.OrdinalIgnoreCase);
		var budget = Math.Clamp(strategic ? _options.StrategicContextTokenBudget : _options.DirectContextTokenBudget, 700, 3000);
		var scale = budget >= 1600 ? 1.15 : budget <= 1200 ? .82 : 1d;
		return new(
			OwnCharacteristicCharacters: (int)(180 * scale),
			OtherCharacteristicCharacters: (int)(80 * scale),
			ScenarioDescriptionCharacters: (int)(110 * scale),
			ScenarioListCharacters: (int)(60 * scale),
			StatementCharacters: (int)(120 * scale),
			MemoryCharacters: (int)(120 * scale),
			MessageCharacters: (int)(120 * scale),
			PublicClaims: strategic ? 3 : 4,
			OwnBluffs: strategic ? 2 : 3,
			MemoryItems: strategic ? 2 : 3,
			Messages: strategic ? 2 : 3);
	}

	private static object BuildVisibleScenario(AiTrainingArena arena, PromptContextLimits limits) => new
	{
		apocalypse = arena.Apocalypse == null ? null : new
		{
			arena.Apocalypse.Id,
			arena.Apocalypse.Name,
			description = TrimForPrompt(arena.Apocalypse.Description, limits.ScenarioDescriptionCharacters),
			arena.Apocalypse.Severity,
			requirements = arena.Apocalypse.Requirements.Where(NotBlank).Take(2).Select(item => TrimForPrompt(item, limits.ScenarioListCharacters))
		},
		bunker = arena.Bunker == null ? null : new
		{
			arena.Bunker.Id,
			arena.Bunker.Name,
			description = TrimForPrompt(arena.Bunker.Description, limits.ScenarioDescriptionCharacters),
			arena.Bunker.Capacity,
			arena.Bunker.SuppliesMonths,
			arena.Bunker.Condition,
			facilities = arena.Bunker.Facilities.Where(NotBlank).Take(2).Select(item => TrimForPrompt(item, limits.ScenarioListCharacters)),
			resources = arena.Bunker.Resources.Where(NotBlank).Take(2).Select(item => TrimForPrompt(item, limits.ScenarioListCharacters)),
			problems = arena.Bunker.Problems.Where(NotBlank).Take(2).Select(item => TrimForPrompt(item, limits.ScenarioListCharacters))
		},
		currentThreats = arena.ThreatHistory.Where(item => item.IsActive).Select(item => new
		{
			item.Id,
			item.Name,
			description = TrimForPrompt(item.Description, limits.ScenarioDescriptionCharacters),
			item.Severity,
			requirements = item.Requirements.Take(2).Select(value => TrimForPrompt(value, limits.ScenarioListCharacters)),
			risks = item.Risks.Take(2).Select(value => TrimForPrompt(value, limits.ScenarioListCharacters)),
			consequences = item.Consequences.Take(2).Select(value => TrimForPrompt(value, limits.ScenarioListCharacters))
		})
	};
	private sealed record PromptContextLimits(int OwnCharacteristicCharacters, int OtherCharacteristicCharacters,
		int ScenarioDescriptionCharacters, int ScenarioListCharacters, int StatementCharacters, int MemoryCharacters,
		int MessageCharacters, int PublicClaims, int OwnBluffs, int MemoryItems, int Messages);
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
			lastDecision.PrivateStrategicPlan,
			lastDecision.PublicClaims,
			lastDecision.ExplicitBluffs,
			lastDecision.ProviderError,
			lastDecision.ProviderErrorDetail,
			lastDecision.RequestAttempts,
			lastDecision.RequestDurationMilliseconds,
			lastDecision.PromptBuildMilliseconds,
			lastDecision.GenerationMilliseconds,
			lastDecision.StepDurationMilliseconds,
			lastDecision.PromptCharacters,
			lastDecision.EstimatedPromptTokens,
			lastDecision.AtUtc
		};
		var diagnostics = arena.Decisions.TakeLast(30)
			.Select(item => new { item.Step, item.AgentId, item.Accepted, item.ProviderError, item.ProviderErrorDetail, item.ValidationError, item.RequestAttempts, item.RequestDurationMilliseconds, item.PromptBuildMilliseconds, item.GenerationMilliseconds, item.StepDurationMilliseconds, item.PromptCharacters, item.EstimatedPromptTokens, item.InputTokens, item.OutputTokens, item.AtUtc });
		return new
		{
			arena.Id,
			status = arena.Status.ToString(),
			arena.Step,
			currentRound = CurrentRound(arena),
			arena.VoteCount,
			arena.LastIntervention,
			arena.Provider,
			arena.Model,
			arena.GenerationMode,
			scenario = BuildDeveloperScenario(arena),
			agents = arena.Agents.Select(item => new { item.Id, item.Name, item.Seat, item.IsEliminated, revealed = item.RevealedCharacteristics, revealedCount = item.RevealedCharacteristics.Count, item.LastDecision, item.LastError }),
			messages = arena.Messages.TakeLast(100),
			events = arena.Events.TakeLast(100),
			selectedAgent = agent == null ? null : new { agent.Id, agent.Name, objective = "Remain among the final bunker survivors.", ownCharacteristics = agent.OwnCharacteristics, revealedCharacteristics = agent.RevealedCharacteristics, publicKnowledge = agent.PublicKnowledge, memory = agent.Memory.TakeLast(30), publicClaims = agent.PublicClaims.TakeLast(20), explicitBluffs = agent.ExplicitBluffs.TakeLast(20), agent.LastStrategy, agent.LastDecision, agent.LastError, LastDecisionMetadata = safeDecision },
			proposal = arena.Proposal,
			openVotes = arena.OpenVotes.Count,
			diagnostics,
			datasetExportUrl = $"/ai-arena/export/{arena.Id}"
		};
	}
	private static object BuildDeveloperScenario(AiTrainingArena arena) => new
	{
		apocalypse = arena.Apocalypse == null ? null : new
		{
			arena.Apocalypse.Id, arena.Apocalypse.Name, arena.Apocalypse.Description, arena.Apocalypse.Severity,
			arena.Apocalypse.SurvivalChance, arena.Apocalypse.Duration, arena.Apocalypse.Threats, arena.Apocalypse.Requirements, arena.Apocalypse.Tags
		},
		bunker = arena.Bunker == null ? null : new
		{
			arena.Bunker.Id, arena.Bunker.Name, arena.Bunker.Description, arena.Bunker.Capacity, arena.Bunker.Location,
			arena.Bunker.SuppliesMonths, waterMonths = arena.Bunker.WaterMonths, arena.Bunker.Condition,
			arena.Bunker.Facilities, arena.Bunker.Resources, arena.Bunker.Problems, arena.Bunker.BunkerTags
		},
		currentThreats = arena.ThreatHistory.Where(item => item.IsActive),
		previousThreats = arena.ThreatHistory.Where(item => !item.IsActive)
	};
	private Apocalypse? SelectApocalypse() => _gameData.Apocalypses.Count == 0
		? null
		: CloneScenario(_gameData.Apocalypses[Random.Shared.Next(_gameData.Apocalypses.Count)]);
	private BunkerInfo? SelectBunker() => _gameData.Bunkers.Count == 0
		? null
		: CloneScenario(_gameData.Bunkers[Random.Shared.Next(_gameData.Bunkers.Count)]);
	private static T CloneScenario<T>(T source) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(source))
		?? throw new InvalidOperationException("scenario_clone_failed");
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
	private static string NormalizeSpeedPreset(string? preset) => preset?.Trim().ToLowerInvariant() switch { "fast" => "Fast", "deep" => "Deep", _ => "Balanced" };
	private static HashSet<string> NormalizeCharacteristicCategories(IEnumerable<string>? categories)
	{
		var selected = (categories ?? CharacteristicCategories).Where(value => CharacteristicCategories.Contains(value, StringComparer.OrdinalIgnoreCase))
			.ToHashSet(StringComparer.OrdinalIgnoreCase);
		return selected;
	}
	private sealed record ArenaConfiguration(string Provider, string Model, string GenerationMode, bool UseLiveProvider);
	private sealed record Decision(AiTrainingAction Action, string? TargetPlayerId, string? Message, string? Strategy, double? Confidence,
		int? InputTokens = null, int? OutputTokens = null, string? PrivateStrategicPlan = null,
		IReadOnlyList<AiTrainingStatement>? PublicClaims = null, IReadOnlyList<AiTrainingStatement>? ExplicitBluffs = null, string? ProviderError = null,
		string? ProviderErrorDetail = null, int RequestAttempts = 1, long? RequestDurationMilliseconds = null,
		long? PromptBuildMilliseconds = null, long? GenerationMilliseconds = null, int? PromptCharacters = null,
		int? EstimatedPromptTokens = null, long? PlanGenerationMilliseconds = null, bool StrategicPlanRefreshed = false);
}
