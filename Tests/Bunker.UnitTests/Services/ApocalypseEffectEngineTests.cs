using System.Text.Json;
using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class ApocalypseEffectEngineTests
{
    private static readonly Lazy<GameDataService> Data = new(() =>
        new GameDataService(new TestEnvironment(FindRoot()), NullLogger<GameDataService>.Instance));

    [Fact]
    public void RegistryCoversEveryProductionEffectAndAllInteractiveProfilesValidate()
    {
        var registry = Registry();
        var productionTypes = Data.Value.ApocalypseInteractiveSchema!.EffectTypesUsed
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        Assert.Equal(productionTypes, registry.EffectTypes.ToHashSet(StringComparer.OrdinalIgnoreCase));
        Assert.Equal(20, Data.Value.GetInteractiveApocalypses().Count);
        Assert.All(Data.Value.GetInteractiveApocalypses(), apocalypse =>
            Assert.All(apocalypse.Gameplay!.Effects, effect => Assert.NotNull(registry.Get(effect.Type))));
    }

    [Fact]
    public void EveryProductionInteractiveProfileExecutesThroughTheEngine()
    {
        var engine = Engine();
        var generator = new CharacterGeneratorService(Data.Value, NullLogger<CharacterGeneratorService>.Instance);
        foreach (var apocalypse in Data.Value.GetInteractiveApocalypses())
        {
            var room = new Room();
            for (var index = 0; index < 4; index++)
            {
                var player = generator.Generate($"Player {index}", room.Players.Values);
                player.StablePlayerId = $"player-{index}";
                player.ConnectionId = $"connection-{index}";
                room.Players[player.ConnectionId] = player;
            }
            var result = engine.Execute(room, apocalypse);
            Assert.True(result.Success, $"{apocalypse.Id}: {result.FailureCode}");
        }
    }

    [Fact]
    public void AgeEffectTargetsGameplayPlayersButNeverSpectators()
    {
        var gameplay = Player("gameplay", 30);
        var spectator = Player("spectator", 40); spectator.IsLobbySpectator = true;
        var room = new Room { Players = new() { ["one"] = gameplay, ["two"] = spectator } };
        var apocalypse = Apocalypse(Effect("set_all_player_age", new { value = 18, includeEliminated = false }));

        var result = Engine().Execute(room, apocalypse);

        Assert.True(result.Success);
        Assert.Equal(18, gameplay.Personality.Age);
        Assert.Equal(40, spectator.Personality.Age);
        Assert.Single(result.PersonalChanges);
    }

    [Fact]
    public void IncludeEliminatedAddsEliminatedPlayersButNeverGmOrSpectators()
    {
        var active = Player("active", 30);
        var eliminated = Player("eliminated", 31); eliminated.IsEliminated = true;
        var technicalGm = Player("technical-gm", 32); technicalGm.GmRole = GmMode.TechnicalGm;
        var omniscientGm = Player("omniscient-gm", 33); omniscientGm.IsSpectatorGm = true; omniscientGm.GmRole = GmMode.OmniscientGm;
        var spectator = Player("spectator", 34); spectator.IsLobbySpectator = true;
        var room = new Room { Players = new() { ["a"] = active, ["e"] = eliminated, ["t"] = technicalGm, ["o"] = omniscientGm, ["s"] = spectator } };

        var result = Engine().Execute(room, Apocalypse(Effect("set_all_player_age", new { value = 18, includeEliminated = true })));

        Assert.True(result.Success);
        Assert.Equal(18, active.Personality.Age);
        Assert.Equal(18, eliminated.Personality.Age);
        Assert.Equal(32, technicalGm.Personality.Age);
        Assert.Equal(33, omniscientGm.Personality.Age);
        Assert.Equal(34, spectator.Personality.Age);
    }

    [Fact]
    public void MalformedNumericPayloadFailsBeforeAnyMutation()
    {
        var player = Player("stable", 30);
        player.Body.Weight = 80;
        var room = new Room { Players = new() { ["connection"] = player } };
        var apocalypse = Apocalypse(
            Effect("add_all_player_age", new { value = 10, minimum = 8, maximum = 120 }),
            Effect("multiply_all_player_weight", new { factor = "not-a-number", minimumWeight = 25, maximumWeight = 350 }));

        var result = Engine().Execute(room, apocalypse);

        Assert.False(result.Success);
        Assert.Equal("apocalypse_effect_payload_invalid", result.FailureCode);
        Assert.Equal(30, player.Personality.Age);
        Assert.Equal(80, player.Body.Weight);
    }

    [Fact]
    public void RuntimeFailureRollsBackIntoTheSamePlayerInstance()
    {
        var player = Player("stable", 30);
        player.Body.Height = 180; player.Body.Weight = 80;
        var room = new Room { Players = new() { ["connection"] = player } };
        var apocalypse = Apocalypse(
            Effect("add_all_player_age", new { value = 10, minimum = 8, maximum = 120, includeEliminated = false }),
            Effect("reroll_all_player_body", new { heightRange = new[] { 170 }, weightRange = new[] { 60, 90 }, includeEliminated = false }));

        var result = Engine().Execute(room, apocalypse);

        Assert.False(result.Success);
        Assert.Same(player, room.Players["connection"]);
        Assert.Equal(30, player.Personality.Age);
        Assert.Equal(180, player.Body.Height);
        Assert.Equal(80, player.Body.Weight);
    }

    private static ApocalypseEffectEngine Engine()
    {
        var random = new FixedRandom();
        return new ApocalypseEffectEngine(new ApocalypseEffectHandlerRegistry(Data.Value, random), Data.Value, random);
    }
    private static ApocalypseEffectHandlerRegistry Registry() => new(Data.Value, new FixedRandom());
    private static Apocalypse Apocalypse(params ApocalypseEffectDefinition[] effects) => new()
    {
        Id = "test", Gameplay = new() { Interactive = true, EffectProfileId = "test-profile", Effects = effects }
    };
    private static ApocalypseEffectDefinition Effect(string type, object parameters)
    {
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(parameters));
        return new() { Type = type, Parameters = document.RootElement.EnumerateObject()
            .ToDictionary(property => property.Name, property => property.Value.Clone()) };
    }
    private static Player Player(string id, int age) => new()
    {
        StablePlayerId = id, Personality = new() { Age = age }, Body = new(), Profession = new(),
        PhysicalHealth = new(), MentalHealth = new(), Hobby = new(), CharacterTrait = new(),
        Phobia = new(), Fact = new(), Inventory = new(), Revealed = new()
    };
    private sealed class FixedRandom : IApocalypseRandom
    {
        public int Next(int minValue, int maxValue) => minValue;
    }
    private static string FindRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Bunker.csproj"))) directory = directory.Parent;
        return directory?.FullName ?? throw new DirectoryNotFoundException();
    }
    private sealed class TestEnvironment(string root) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Bunker.UnitTests";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = Path.Combine(root, "wwwroot");
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
