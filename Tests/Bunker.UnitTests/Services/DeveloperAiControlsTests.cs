using System.Security.Claims;
using Bunker.Hubs;
using Bunker.Models;
using Bunker.Services;
using Bunker.Services.OwnerContent;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Bunker.UnitTests.Services;

public sealed class DeveloperAiControlsTests
{
    private static readonly Guid DeveloperId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    [Fact]
    public async Task OnlyDeveloperCanInvokeAiHubOperationsWhilePlayersCanUseNormalChat()
    {
        var root = FindRepositoryRoot();
        var environment = new TestEnvironment(root);
        var gameData = new GameDataService(environment, NullLogger<GameDataService>.Instance);
        var rooms = new RoomService(NullLogger<RoomService>.Instance);
        var chat = new RoomChatService(TimeProvider.System);
        var generator = new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance);
        var authority = new DeveloperAuthorityService(
            Options.Create(new OwnerAccessOptions { UserId = DeveloperId.ToString() }),
            Options.Create(new DeveloperAuthorityOptions()), TimeProvider.System);
        var hub = new GameHub(
            generator, rooms, gameData, new ScenarioImageService(environment, NullLogger<ScenarioImageService>.Instance),
            new GameTimerService(TimeProvider.System), NullLogger<GameHub>.Instance,
            new PlayerDisconnectCleanupCoordinator(rooms, new GmAuditService(TimeProvider.System), null!, TimeProvider.System, null!, NullLogger<PlayerDisconnectCleanupCoordinator>.Instance),
            developerAuthority: authority,
            roomChat: chat,
            aiParticipants: new AiParticipantService(rooms, chat, generator),
            characterRevealSync: new CharacterRevealSynchronizationService(new NullHubContext(), rooms))
        {
            Clients = new NullHubCallerClients(),
            Context = new TestHubCallerContext("host")
        };

        var room = rooms.CreateRoom("Developer AI", "host", "Host");
        var host = Join(rooms, room, "host", "host-player", "Host");
        var developer = Join(rooms, room, "developer", "developer-player", "Developer", DeveloperId);
        var player = Join(rooms, room, "player", "player-player", "Player");

        var hostError = await Assert.ThrowsAsync<HubException>(() => hub.AddAiPlayers(1));
        Assert.Equal("developer_required", hostError.Message);

        hub.Context = new TestHubCallerContext(developer.ConnectionId);
        await hub.AddAiPlayers(1);
        Assert.Single(RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value), entry => entry.IsAi);

        hub.Context = new TestHubCallerContext(player.ConnectionId);
        var playerError = Assert.Throws<HubException>(() => hub.StartAiDiscussionRound());
        Assert.Equal("developer_required", playerError.Message);

        await hub.SendRoomChatMessage("Regular player chat", "player-message");
        Assert.Contains(chat.GetHistory(room.Id), message => message.SenderId == player.StablePlayerId && message.Text == "Regular player chat");
    }

    private static Player Join(RoomService rooms, Room room, string connectionId, string stableId, string name, Guid? accountUserId = null)
    {
        var player = new Player { ConnectionId = connectionId, StablePlayerId = stableId, Name = name, AccountUserId = accountUserId, IsConnected = true };
        Assert.True(rooms.JoinRoom(room.Id, connectionId, player).success);
        return player;
    }

    private static string FindRepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Bunker.csproj"))) return directory.FullName;
        throw new DirectoryNotFoundException("Bunker.csproj was not found.");
    }

    private sealed class NullHubContext : IHubContext<GameHub>
    {
        public IHubClients Clients { get; } = new NullHubClients();
        public IGroupManager Groups { get; } = new NullGroups();
    }

    private sealed class NullHubClients : IHubClients
    {
        private readonly IClientProxy _proxy = new NullClientProxy();
        public IClientProxy All => _proxy; public IClientProxy AllExcept(IReadOnlyList<string> _) => _proxy;
        public IClientProxy Client(string _) => _proxy; public IClientProxy Clients(IReadOnlyList<string> _) => _proxy;
        public IClientProxy Group(string _) => _proxy; public IClientProxy GroupExcept(string _, IReadOnlyList<string> __) => _proxy;
        public IClientProxy Groups(IReadOnlyList<string> _) => _proxy; public IClientProxy User(string _) => _proxy; public IClientProxy Users(IReadOnlyList<string> _) => _proxy;
    }

    private sealed class NullHubCallerClients : IHubCallerClients
    {
        private readonly IClientProxy _proxy = new NullClientProxy();
        public IClientProxy All => _proxy; public IClientProxy Caller => _proxy; public IClientProxy Others => _proxy;
        public IClientProxy AllExcept(IReadOnlyList<string> _) => _proxy; public IClientProxy Client(string _) => _proxy;
        public IClientProxy Clients(IReadOnlyList<string> _) => _proxy; public IClientProxy Group(string _) => _proxy;
        public IClientProxy GroupExcept(string _, IReadOnlyList<string> __) => _proxy; public IClientProxy Groups(IReadOnlyList<string> _) => _proxy;
        public IClientProxy OthersInGroup(string _) => _proxy; public IClientProxy User(string _) => _proxy; public IClientProxy Users(IReadOnlyList<string> _) => _proxy;
    }

    private sealed class NullClientProxy : IClientProxy
    {
        public Task SendCoreAsync(string _, object?[] __, CancellationToken ___ = default) => Task.CompletedTask;
    }

    private sealed class NullGroups : IGroupManager
    {
        public Task AddToGroupAsync(string _, string __, CancellationToken ___ = default) => Task.CompletedTask;
        public Task RemoveFromGroupAsync(string _, string __, CancellationToken ___ = default) => Task.CompletedTask;
    }

    private sealed class TestHubCallerContext(string connectionId) : HubCallerContext
    {
        private readonly Dictionary<object, object?> _items = [];
        private readonly CancellationTokenSource _connectionAborted = new();
        public override string ConnectionId { get; } = connectionId;
        public override string? UserIdentifier => null;
        public override ClaimsPrincipal? User { get; } = new(new ClaimsIdentity());
        public override IDictionary<object, object?> Items => _items;
        public override IFeatureCollection Features { get; } = new FeatureCollection();
        public override CancellationToken ConnectionAborted => _connectionAborted.Token;
        public override void Abort() => _connectionAborted.Cancel();
    }

    private sealed class TestEnvironment(string root) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Bunker.UnitTests";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = Path.Combine(root, "wwwroot");
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new PhysicalFileProvider(root);
    }
}
