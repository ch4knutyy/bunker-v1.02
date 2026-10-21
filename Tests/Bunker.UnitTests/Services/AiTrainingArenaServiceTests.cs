using Bunker.Hubs;
using Bunker.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace Bunker.UnitTests.Services;

public sealed class AiTrainingArenaServiceTests : IDisposable
{
    private readonly string _root = FindRepositoryRoot();
    private readonly string _datasetDirectory = ".ai-training-test-" + Guid.NewGuid().ToString("N");

    [Fact]
    public async Task ArenaCreatesSixIsolatedAiAndDefersFirstVoteUntilThreeRevealsEach()
    {
        var options = Options.Create(new AiTrainingArenaOptions { DatasetDirectory = _datasetDirectory, UseLiveProvider = false, MaxSteps = 80, VoteApprovalPercent = 51 });
        var environment = new TestEnvironment(_root);
        var gameData = new GameDataService(environment, NullLogger<GameDataService>.Instance);
        var generator = new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance);
        var store = new AiTrainingDatasetStore(environment, options);
        var service = new AiTrainingArenaService(generator, new FakeProvider(), new FakeLocalProvider(), store, options, new NullHubContext(), TimeProvider.System, NullLogger<AiTrainingArenaService>.Instance);

        var arena = await service.CreateAsync(CancellationToken.None);
        Assert.Equal(6, arena.Agents.Count);
        arena.Agents[0].OwnCharacteristics["testSecret"] = "only-first-agent";
        var secondPerspective = JsonSerializer.Serialize(service.View(arena.Id, arena.Agents[1].Id));
        Assert.DoesNotContain("only-first-agent", secondPerspective);

        for (var index = 0; index < 17; index++) await service.StepAsync(arena.Id, CancellationToken.None);
        Assert.Equal(0, arena.VoteCount);
        Assert.Contains(arena.Agents, agent => agent.RevealedCharacteristics.Count < 3);

        for (var index = 0; index < 14; index++) await service.StepAsync(arena.Id, CancellationToken.None);
        Assert.Equal(1, arena.VoteCount);
        Assert.Single(arena.Agents, agent => agent.IsEliminated);

        using var metadata = JsonDocument.Parse(File.ReadAllText(Path.Combine(store.SessionPath(arena.Id), "metadata.json")));
        Assert.Equal(arena.Id, metadata.RootElement.GetProperty("sessionId").GetString());
        Assert.NotEmpty(File.ReadAllLines(Path.Combine(store.SessionPath(arena.Id), "events.jsonl")));
        Assert.NotEmpty(File.ReadAllLines(Path.Combine(store.SessionPath(arena.Id), "decisions.jsonl")));
    }

    public void Dispose()
    {
        var path = Path.Combine(_root, _datasetDirectory);
        if (Directory.Exists(path)) Directory.Delete(path, recursive: true);
    }

    private static string FindRepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Bunker.csproj"))) return directory.FullName;
        throw new DirectoryNotFoundException();
    }

    private sealed class FakeProvider : IAiProvider
    {
        public Task<AiProviderReply> GenerateReplyAsync(string prompt, CancellationToken cancellationToken) => Task.FromResult(new AiProviderReply(null, "not_used"));
    }

    private sealed class FakeLocalProvider : ILocalMamayLmProvider
    {
        public AiTrainingProviderStatus LastStatus { get; } = new("Local", "not_checked", null);
        public Task<AiProviderReply> GenerateAsync(AiTrainingModelRequest request, CancellationToken cancellationToken) => Task.FromResult(new AiProviderReply(null, "not_used"));
        public Task<AiTrainingProviderStatus> ProbeAsync(CancellationToken cancellationToken) => Task.FromResult(LastStatus);
    }

    private sealed class NullHubContext : IHubContext<AiTrainingArenaHub>
    {
        public IHubClients Clients { get; } = new NullHubClients();
        public IGroupManager Groups { get; } = new NullGroups();
    }

    private sealed class NullHubClients : IHubClients
    {
        private readonly IClientProxy _proxy = new NullProxy();
        public IClientProxy All => _proxy; public IClientProxy AllExcept(IReadOnlyList<string> _) => _proxy; public IClientProxy Client(string _) => _proxy; public IClientProxy Clients(IReadOnlyList<string> _) => _proxy;
        public IClientProxy Group(string _) => _proxy; public IClientProxy GroupExcept(string _, IReadOnlyList<string> __) => _proxy; public IClientProxy Groups(IReadOnlyList<string> _) => _proxy; public IClientProxy User(string _) => _proxy; public IClientProxy Users(IReadOnlyList<string> _) => _proxy;
    }
    private sealed class NullProxy : IClientProxy { public Task SendCoreAsync(string _, object?[] __, CancellationToken ___ = default) => Task.CompletedTask; }
    private sealed class NullGroups : IGroupManager { public Task AddToGroupAsync(string _, string __, CancellationToken ___ = default) => Task.CompletedTask; public Task RemoveFromGroupAsync(string _, string __, CancellationToken ___ = default) => Task.CompletedTask; }
    private sealed class TestEnvironment(string root) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Bunker.UnitTests"; public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider(); public string WebRootPath { get; set; } = Path.Combine(root, "wwwroot"); public string EnvironmentName { get; set; } = "Development"; public string ContentRootPath { get; set; } = root; public IFileProvider ContentRootFileProvider { get; set; } = new PhysicalFileProvider(root);
    }
}
