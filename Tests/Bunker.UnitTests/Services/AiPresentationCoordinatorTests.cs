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
    public async Task Human_completion_unblocks_two_ai_profession_presentations_without_starting_discussion()
    {
        var room = new Room { Id = "presentation", State = RoomState.Playing, CurrentRound = 1, CurrentPhase = GamePhase.RoundReveal };
        var human = new Player { Name = "Dmytro", StablePlayerId = "human", ConnectionId = "human", SeatNumber = 1 };
        var firstAi = new Player { Name = "Oleksii", StablePlayerId = "ai-oleksii", ConnectionId = RoomService.AiConnectionKey("ai-oleksii"), IsAi = true, AiProvider = "Groq", SeatNumber = 2, Profession = new Profession { Name = "Engineer" } };
        var secondAi = new Player { Name = "Maria", StablePlayerId = "ai-maria", ConnectionId = RoomService.AiConnectionKey("ai-maria"), IsAi = true, AiProvider = "OpenRouter", SeatNumber = 3, Profession = new Profession { Name = "Doctor" } };
        room.Players[human.ConnectionId] = human;
        room.Players[firstAi.ConnectionId] = firstAi;
        room.Players[secondAi.ConnectionId] = secondAi;
        var chat = new RoomChatService(TimeProvider.System);
        chat.AddCompanion(room.Id, new AiChatCompanion { Id = firstAi.StablePlayerId, Name = firstAi.Name, PlayerStableId = firstAi.StablePlayerId, Provider = "Groq", Model = "fake-groq" });
        chat.AddCompanion(room.Id, new AiChatCompanion { Id = secondAi.StablePlayerId, Name = secondAi.Name, PlayerStableId = secondAi.StablePlayerId, Provider = "OpenRouter", Model = "fake-openrouter:free" });
        var hub = new RecordingHubContext();
        var sync = new CharacterRevealSynchronizationService(hub, new RoomService(NullLogger<RoomService>.Instance));
        var coordinator = new AiPresentationCoordinator(chat, new CharacterRevealService(), sync, new AiPresentationCharacteristicSelector(),
            new AiChatContextBuilder(new BunkerIntelService()), new FixedAiProvider("I can repair the bunker systems."), hub,
            NullLogger<AiPresentationCoordinator>.Instance);

        Assert.True(await coordinator.StartAsync(room, "Profession", CancellationToken.None));
        Assert.Equal("human", room.Presentation.CurrentSpeakerStablePlayerId);
        Assert.DoesNotContain(chat.GetHistory(room.Id), message => message.SenderType == ChatSenderType.Ai);
        Assert.True(await coordinator.CompleteHumanTurnAsync(room, "human", CancellationToken.None));
        Assert.True(firstAi.Revealed.Profession && secondAi.Revealed.Profession);
        Assert.Equal(AiPresentationStatus.ReadyForDiscussion, room.Presentation.Status);
        Assert.Equal(2, chat.GetHistory(room.Id).Count(message => message.SenderType == ChatSenderType.Ai));
        Assert.True(await coordinator.BeginDiscussionAsync(room, CancellationToken.None));
        Assert.Equal(AiPresentationStatus.Discussion, room.Presentation.Status);
    }

    [Fact]
    public async Task First_presentation_forces_profession_and_uses_a_distinct_event_id()
    {
        var room = new Room { Id = "first-presentation", State = RoomState.Playing, CurrentPhase = GamePhase.RoundReveal };
        var human = new Player { Name = "Human", StablePlayerId = "human", ConnectionId = "human", SeatNumber = 1 };
        room.Players[human.ConnectionId] = human;
        var hub = new RecordingHubContext();
        var coordinator = new AiPresentationCoordinator(new RoomChatService(TimeProvider.System), new CharacterRevealService(),
            new CharacterRevealSynchronizationService(hub, new RoomService(NullLogger<RoomService>.Instance)), new AiPresentationCharacteristicSelector(),
            new AiChatContextBuilder(new BunkerIntelService()), new FixedAiProvider("unused"), hub, NullLogger<AiPresentationCoordinator>.Instance);

        Assert.True(await coordinator.StartAsync(room, "Hobby", CancellationToken.None));
        Assert.Equal("Profession", room.Presentation.CharacteristicKey);
        Assert.Equal(1, room.Presentation.PresentationId);
        Assert.True(await coordinator.EndAsync(room, CancellationToken.None));
        Assert.True(room.ProfessionPresentationCompleted);
        human.Revealed.Profession = true;
        room.CurrentRound = 2;
        Assert.True(await coordinator.StartAsync(room, "Auto", CancellationToken.None));
        Assert.Equal("Hobby", room.Presentation.CharacteristicKey);
    }

    [Fact]
    public async Task Automatic_presentation_chooses_distinct_available_characteristics_for_ai_players()
    {
        var room = new Room { Id = "auto-presentation", State = RoomState.Playing, CurrentPhase = GamePhase.RoundReveal, ProfessionPresentationCompleted = true };
        var first = CreateAi("ai-one", 1);
        var second = CreateAi("ai-two", 2);
        first.Revealed.Profession = true;
        second.Revealed.Profession = true;
        room.Players[first.ConnectionId] = first;
        room.Players[second.ConnectionId] = second;
        var chat = new RoomChatService(TimeProvider.System);
        chat.AddCompanion(room.Id, new AiChatCompanion { Id = first.StablePlayerId, Name = first.Name, PlayerStableId = first.StablePlayerId });
        chat.AddCompanion(room.Id, new AiChatCompanion { Id = second.StablePlayerId, Name = second.Name, PlayerStableId = second.StablePlayerId });
        var hub = new RecordingHubContext();
        var coordinator = new AiPresentationCoordinator(chat, new CharacterRevealService(), new CharacterRevealSynchronizationService(hub, new RoomService(NullLogger<RoomService>.Instance)), new AiPresentationCharacteristicSelector(), new AiChatContextBuilder(new BunkerIntelService()), new FixedAiProvider("I can help."), hub, NullLogger<AiPresentationCoordinator>.Instance);

        Assert.True(await coordinator.StartAsync(room, "Auto", CancellationToken.None));
        var selected = chat.GetHistory(room.Id).Where(message => message.SystemEventType == "ai_characteristic_selected").Select(message => message.SystemEventData!["characteristic"]).ToList();
        Assert.Equal(2, selected.Count);
        Assert.Equal(2, selected.Distinct(StringComparer.Ordinal).Count());
        Assert.DoesNotContain("Profession", selected);
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

    private static Player CreateAi(string id, int seat) => new()
    {
        Name = id,
        StablePlayerId = id,
        ConnectionId = RoomService.AiConnectionKey(id),
        IsAi = true,
        SeatNumber = seat
    };

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
