using Bunker.Hubs;
using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class AiPresentationCoordinatorTests
{
    [Fact]
    public async Task Presentation_reveals_ai_profession_posts_reply_and_enters_discussion()
    {
        var room = new Room { Id = "presentation", State = RoomState.Playing };
        var ai = new Player { Name = "Maria AI", StablePlayerId = "ai-maria", ConnectionId = RoomService.AiConnectionKey("ai-maria"), IsAi = true, SeatNumber = 2, Profession = new Profession { Name = "Engineer" } };
        room.Players[ai.ConnectionId] = ai;
        var chat = new RoomChatService(TimeProvider.System);
        chat.AddCompanion(room.Id, new AiChatCompanion { Id = ai.StablePlayerId, Name = ai.Name, PlayerStableId = ai.StablePlayerId });
        var hub = new RecordingHubContext();
        var sync = new CharacterRevealSynchronizationService(hub, new RoomService(NullLogger<RoomService>.Instance));
        var coordinator = new AiPresentationCoordinator(chat, new CharacterRevealService(), sync,
            new AiChatContextBuilder(new BunkerIntelService()), new FixedAiProvider("I can repair the bunker systems."), hub,
            NullLogger<AiPresentationCoordinator>.Instance);

        Assert.True(await coordinator.StartAsync(room, "Profession", CancellationToken.None));
        Assert.True(ai.Revealed.Profession);
        Assert.Equal(AiPresentationStatus.Discussion, room.Presentation.Status);
        Assert.Contains(chat.GetHistory(room.Id), message => message.SenderType == ChatSenderType.Ai && message.Text.Contains("repair"));
        Assert.Single(hub.Events, item => item.Event == "CharacteristicRevealed");
    }

    [Fact]
    public void Reveal_service_allows_human_own_reveal_but_rejects_unapproved_ai_or_wrong_identity()
    {
        var room = new Room { State = RoomState.Playing };
        var human = new Player { StablePlayerId = "human" };
        var ai = new Player { StablePlayerId = "ai", IsAi = true };
        var service = new CharacterRevealService();

        Assert.True(service.RevealOwn(room, human, "Profession").Success);
        Assert.Equal("ai_presentation_required", service.RevealOwn(room, ai, "Profession").ErrorCode);
        Assert.Equal("ai_reveal_forbidden", service.RevealAiPresentation(room, ai, "other", "Profession", true).ErrorCode);
        Assert.True(service.RevealAiPresentation(room, ai, "ai", "Profession", true).Success);
    }

    private sealed class FixedAiProvider(string text) : IAiProvider
    {
        public Task<AiProviderReply> GenerateReplyAsync(string prompt, CancellationToken cancellationToken) => Task.FromResult(new AiProviderReply(text));
    }

    private sealed class RecordingHubContext : IHubContext<GameHub>
    {
        public List<(string Event, object?[] Args)> Events { get; } = [];
        public IHubClients Clients { get; }
        public IGroupManager Groups { get; } = new NullGroups();
        public RecordingHubContext() => Clients = new RecordingClients(Events);
    }

    private sealed class RecordingClients(List<(string Event, object?[] Args)> events) : IHubClients
    {
        private readonly IClientProxy _proxy = new RecordingProxy(events);
        public IClientProxy All => _proxy; public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => _proxy;
        public IClientProxy Client(string connectionId) => _proxy; public IClientProxy Clients(IReadOnlyList<string> connectionIds) => _proxy;
        public IClientProxy Group(string groupName) => _proxy; public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => _proxy;
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => _proxy; public IClientProxy User(string userId) => _proxy; public IClientProxy Users(IReadOnlyList<string> userIds) => _proxy;
    }
    private sealed class RecordingProxy(List<(string Event, object?[] Args)> events) : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default) { events.Add((method, args)); return Task.CompletedTask; }
    }
    private sealed class NullGroups : IGroupManager
    {
        public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
