using Bunker.Models;
using Bunker.Services;
using Bunker.Services.OwnerContent;
using Microsoft.Extensions.Options;

namespace Bunker.UnitTests.Services;

internal static class PostGameStoryTestRoom
{
    public static readonly Guid DeveloperAccountId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    public static DeveloperAuthorityService CreateAuthority() => new(
        Options.Create(new OwnerAccessOptions { UserId = DeveloperAccountId.ToString() }),
        Options.Create(new DeveloperAuthorityOptions()),
        TimeProvider.System);

    public static Room Create()
    {
        var host = new Player
        {
            StablePlayerId = "host-player", ConnectionId = "host-connection", Name = "Олена", SeatNumber = 1,
            AccountUserId = DeveloperAccountId,
            Profession = new() { Name = "Лікар", ProfessionalLevel = "експерт" },
            Personality = new() { Age = 34, Sex = "жінка", SexOrientation = "гетеро" },
            PhysicalHealth = new() { Name = "Здорова" }, MentalHealth = new() { Name = "Стабільна" },
            Inventory = new() { Size = "середній", Items = [new() { Name = "Аптечка", Quantity = 1, IsUsefulInBunker = true }] },
            Fact = new() { Name = "Працювала у кризовому центрі" }
        };
        var eliminated = new Player
        {
            StablePlayerId = "eliminated-player", ConnectionId = "guest-connection", Name = "Тарас", SeatNumber = 2,
            IsEliminated = true, EliminatedAtRound = 3, EliminatedByVote = true,
            Profession = new() { Name = "Інженер" }, Personality = new() { Age = 41, Sex = "чоловік" },
            AdditionalConditionEffects = [new() { Name = "Пошкоджена рука", SeverityLevel = "medium", Description = "Потребує лікування" }]
        };
        var room = new Room
        {
            Id = "STORY01", State = RoomState.Finished, CurrentPhase = GamePhase.Finished, CurrentRound = 3,
            HostConnectionId = host.ConnectionId, HostPlayerId = host.StablePlayerId, ApocalypseRevealed = true,
            Apocalypse = new() { Name = "Ядерна зима", CategoryId = "nuclear", Description = "Світ накрила зима", Severity = "extreme", SurvivalChance = 35, Duration = "5 років", Threats = ["радіація"], Requirements = ["фільтри"], Tags = ["radiation"] },
            Bunker = new() { Name = "Сховище 7", Description = "Старий комплекс", Location = "Карпати", Condition = "fair", Capacity = 1, SuppliesMonths = 18, SerializedWaterMonths = 9, Facilities = ["Медпункт"], Resources = ["Генератор"], Problems = ["Тріщина"] },
            ResolvedBunkerCapacity = 1,
            Completion = new("bunker_capacity_reached", "vote", 1, 1, 3, DateTime.UtcNow, [new(host.StablePlayerId, host.Name)])
        };
        room.Players[host.ConnectionId] = host;
        room.Players[eliminated.ConnectionId] = eliminated;
        return room;
    }

    public static string ValidJson(string mode = PostGameStoryModes.FinalStory) => $$"""
    {
      "schemaVersion": 1,
      "mode": "{{mode}}",
      "title": "Остання варта",
      "subtitle": "Хроніка сховища",
      "survivalScore": 62,
      "verdictCode": "viable_but_fragile",
      "verdictText": "Шанс є, але ціна висока.",
      "estimatedHorizon": "три роки",
      "opening": "Двері зачинилися назавжди.",
      "chapters": [{"title":"Перша зима","text":"Група вчилася жити в темряві."}],
      "survivorEpilogues": [{"playerName":"Олена","role":"Лікар","fate":"Вона втримала медичний сектор."}],
      "eliminatedPlayerFates": [{"playerName":"Тарас","usefulnessAssessment":"Група втратила інженера.","fate":"Він знайшов інше укриття."}],
      "finalSummary": "Бункер вистояв, але пам'ятав свою ціну.",
      "continuationHooks": ["Сигнал зі сходу"],
      "humanityOutcome": "Поселення збереглися.",
      "bunkerRole": "Медичний вузол",
      "bunkerContribution": "Група відновила медицину.",
      "legacy": "Архів знань",
      "decisionAssessment": "Вигнання було сумнівним.",
      "groupLosses": ["Інженерні знання"]
    }
    """;
}
