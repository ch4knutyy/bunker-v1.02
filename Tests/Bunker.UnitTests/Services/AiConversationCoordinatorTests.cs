using Bunker.Hubs;
using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class AiConversationCoordinatorTests
{
    [Fact]
    public async Task Conversation_starts_only_when_the_host_starts_one_manual_round()
    {
        var rooms = new RoomService(NullLogger<RoomService>.Instance);
        var room = rooms.CreateRoom("phase-gate", "host", "Host");
        room.State = RoomState.Playing; room.CurrentPhase = GamePhase.RoundReveal; room.CurrentRound = 1;
        var ai = new Player { Name = "Maria", StablePlayerId = "ai", ConnectionId = RoomService.AiConnectionKey("ai"), IsAi = true, Profession = new Profession { Name = "Doctor" } };
        room.Players[ai.ConnectionId] = ai;
        var chat = new RoomChatService(TimeProvider.System);
        chat.AddCompanion(room.Id, new AiChatCompanion { Id = "ai", Name = ai.Name, PlayerStableId = "ai" });
        var provider = new CountingProvider();
        var coordinator = new AiConversationCoordinator(chat, provider, new AiChatContextBuilder(new BunkerIntelService()), new NullHubContext(), rooms, NullLogger<AiConversationCoordinator>.Instance);

        Assert.True(chat.TryAddHumanMessage(room.Id, "host", "Host", "Are you ready?", "presentation-message", out var duringPresentation, out _));
        await Task.Delay(30);
        Assert.Equal(0, provider.Calls);

        room.Presentation.Status = AiPresentationStatus.Discussion; room.Presentation.RoundNumber = room.CurrentRound;
        Assert.True(chat.TryAddHumanMessage(room.Id, "other", "Other", "Maria, why should we trust you?", "discussion-message", out var duringDiscussion, out _));
        await Task.Delay(30);
        Assert.Equal(0, provider.Calls);
        Assert.True(coordinator.StartManualDiscussionRound(room));
        await WaitForAsync(() => provider.Calls == 1);

        Assert.Equal(1, provider.Calls);
        Assert.Single(chat.GetHistory(room.Id), message => message.SenderType == ChatSenderType.Ai);
    }

    private static async Task WaitForAsync(Func<bool> condition)
    {
        for (var attempt = 0; attempt < 20 && !condition(); attempt++) await Task.Delay(10);
        Assert.True(condition());
    }

    private sealed class CountingProvider : IAiProvider
    {
        public int Calls { get; private set; }
        public Task<AiProviderReply> GenerateReplyAsync(string prompt, CancellationToken cancellationToken) => Task.FromResult(new AiProviderReply("I can explain my public role."));
        public Task<AiProviderReply> GenerateReplyAsync(AiChatCompanion companion, string prompt, CancellationToken cancellationToken)
        {
            Calls++;
            return GenerateReplyAsync(prompt, cancellationToken);
        }
    }

    private sealed class NullHubContext : IHubContext<GameHub>
    {
        public IHubClients Clients { get; } = new NullClients();
        public IGroupManager Groups { get; } = new NullGroups();
    }
    private sealed class NullClients : IHubClients
    {
        private readonly IClientProxy _proxy = new NullProxy();
        public IClientProxy All => _proxy; public IClientProxy AllExcept(IReadOnlyList<string> _) => _proxy; public IClientProxy Client(string _) => _proxy; public IClientProxy Clients(IReadOnlyList<string> _) => _proxy; public IClientProxy Group(string _) => _proxy; public IClientProxy GroupExcept(string _, IReadOnlyList<string> __) => _proxy; public IClientProxy Groups(IReadOnlyList<string> _) => _proxy; public IClientProxy User(string _) => _proxy; public IClientProxy Users(IReadOnlyList<string> _) => _proxy;
    }
    private sealed class NullProxy : IClientProxy { public Task SendCoreAsync(string _, object?[] __, CancellationToken ___ = default) => Task.CompletedTask; }
    private sealed class NullGroups : IGroupManager { public Task AddToGroupAsync(string _, string __, CancellationToken ___ = default) => Task.CompletedTask; public Task RemoveFromGroupAsync(string _, string __, CancellationToken ___ = default) => Task.CompletedTask; }
}
