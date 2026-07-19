using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Bunker.Hubs;
using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services.CharacterGeneration;

public sealed class PropertyGenerationTests
{
    [Fact]
    public void PropertyCatalogLoadsAllDefinitionsAndGenerationRespectsBoundsAndRoomUniqueness()
    {
        var gameData = CreateGameData();
        var generator = new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance);
        var activePlayers = new List<Player>();

        Assert.Equal(300, gameData.Properties.Count);
        Assert.NotEmpty(gameData.PropertyConditionProfiles);
        Assert.Equal(
            gameData.Properties.Count,
            gameData.Properties.Select(definition => definition.Id).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.All(gameData.Properties, definition =>
        {
            Assert.True(gameData.PropertyConditionProfiles.ContainsKey(definition.ConditionProfile));
            var conditionField = Assert.Single(
                definition.RandomProperties,
                field => field.Key == "conditionLevel");
            var profile = gameData.PropertyConditionProfiles[definition.ConditionProfile];
            Assert.All(
                Enumerable.Range(conditionField.Min, conditionField.Max - conditionField.Min + 1),
                level => Assert.Contains(level.ToString(), profile.Values.Keys));
        });

        for (var index = 0; index < 40; index++)
        {
            var generated = generator.GenerateProperty(activePlayers);
            Assert.NotNull(generated);
            var definition = Assert.Single(gameData.Properties, item => item.Id == generated.DefinitionId);
            foreach (var field in definition.RandomProperties)
            {
                Assert.True(generated.GeneratedValues.TryGetValue(field.Key, out var value));
                Assert.InRange(value, field.Min, field.Max);
            }

            var display = generated.GetDisplayText("uk");
            Assert.False(string.IsNullOrWhiteSpace(display));
            Assert.DoesNotContain("{item}", display, StringComparison.Ordinal);
            Assert.All(generated.GeneratedValues.Keys, key =>
                Assert.DoesNotContain($"{{{key}}}", display, StringComparison.Ordinal));
            Assert.DoesNotContain("{condition}", display, StringComparison.Ordinal);
            if (index < 20)
            {
                Assert.DoesNotContain(
                    activePlayers,
                    player => string.Equals(
                        player.Property?.DefinitionId,
                        generated.DefinitionId,
                        StringComparison.OrdinalIgnoreCase));
                activePlayers.Add(new Player { Property = generated });
            }
        }
    }

    [Fact]
    public void WeightedConditionGenerationUsesOnlyLevelsAllowedByTheDefinition()
    {
        var gameData = CreateGameData();
        var generator = new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance);
        var definition = Assert.Single(
            gameData.Properties.Take(1),
            property => property.RandomProperties.Any(field =>
                field.Key == "conditionLevel" && field.WeightsFromProfile));
        var field = Assert.Single(
            definition.RandomProperties,
            candidate => candidate.Key == "conditionLevel");
        var generateInteger = typeof(CharacterGeneratorService).GetMethod(
            "TryGeneratePropertyInteger",
            BindingFlags.Instance | BindingFlags.NonPublic);

        Assert.NotNull(generateInteger);
        for (var index = 0; index < 100; index++)
        {
            var arguments = new object?[] { definition, field, 0 };
            Assert.True(Assert.IsType<bool>(generateInteger!.Invoke(generator, arguments)));
            Assert.InRange(Assert.IsType<int>(arguments[2]), field.Min, field.Max);
        }

        var restrictedDefinition = gameData.Properties.First(property =>
            property.RandomProperties.Any(candidate =>
                candidate.Key == "conditionLevel" &&
                candidate.WeightsFromProfile &&
                candidate.Min > 1));
        var restrictedField = Assert.Single(
            restrictedDefinition.RandomProperties,
            candidate => candidate.Key == "conditionLevel");
        for (var index = 0; index < 100; index++)
        {
            var arguments = new object?[] { restrictedDefinition, restrictedField, 0 };
            Assert.True(Assert.IsType<bool>(generateInteger!.Invoke(generator, arguments)));
            Assert.InRange(Assert.IsType<int>(arguments[2]), restrictedField.Min, restrictedField.Max);
        }
    }

    [Fact]
    public void CanonicalFormatterResolvesLocalizedConditionAndFallsBackToUkrainian()
    {
        var gameData = CreateGameData();
        var definition = gameData.Properties.First();
        var generatedValues = definition.RandomProperties.ToDictionary(
            field => field.Key,
            field => field.Min,
            StringComparer.Ordinal);
        var property = new GeneratedProperty
        {
            DefinitionId = definition.Id,
            GeneratedValues = generatedValues
        };
        var conditionLevel = generatedValues["conditionLevel"];
        var condition = gameData.PropertyConditionProfiles[definition.ConditionProfile]
            .Values[conditionLevel.ToString()];

        foreach (var language in new[] { "uk", "en", "ru" })
        {
            var display = gameData.FormatProperty(property, language);
            Assert.Contains(condition[language], display, StringComparison.Ordinal);
            Assert.DoesNotContain("{condition}", display, StringComparison.Ordinal);
        }

        Assert.Equal(
            gameData.FormatProperty(property, "uk"),
            gameData.FormatProperty(property, "unsupported-language"));
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(19, 1)]
    [InlineData(20, 2)]
    [InlineData(39, 2)]
    [InlineData(40, 3)]
    [InlineData(59, 3)]
    [InlineData(60, 4)]
    [InlineData(74, 4)]
    [InlineData(75, 5)]
    [InlineData(89, 5)]
    [InlineData(90, 6)]
    [InlineData(100, 6)]
    public void LegacyConditionPercentMapsToTextConditionLevel(int percent, int expectedLevel)
    {
        Assert.True(GameDataService.TryResolvePropertyConditionLevel(
            new Dictionary<string, int> { ["conditionPercent"] = percent },
            out var level));
        Assert.Equal(expectedLevel, level);
    }

    [Fact]
    public void GeneratedPropertyKeepsLocalizedDisplayTagsAndExactValuesAcrossJsonRoundTrip()
    {
        var gameData = CreateGameData();
        var generator = new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance);
        var generated = Assert.IsType<GeneratedProperty>(generator.GenerateProperty());

        var restored = JsonSerializer.Deserialize<GeneratedProperty>(JsonSerializer.Serialize(generated));

        Assert.NotNull(restored);
        Assert.Equal(generated.DefinitionId, restored.DefinitionId);
        Assert.Equal(generated.GeneratedValues, restored.GeneratedValues);
        Assert.Equal(
            generated.GeneratedValues["conditionLevel"],
            restored.GeneratedValues["conditionLevel"]);
        Assert.Equal(generated.ResourceTags, restored.ResourceTags);
        Assert.Equal(generated.ProtectionTags, restored.ProtectionTags);
        Assert.Equal(generated.GetDisplayText("uk"), restored.GetDisplayText("unsupported-language"));
        Assert.All(new[] { "uk", "en", "ru" }, language =>
            Assert.False(string.IsNullOrWhiteSpace(restored.GetDisplayText(language))));
    }

    [Fact]
    public void LegacyPlayerPayloadWithoutPropertyRemainsValidAndNewSpecialCardsAreRegistered()
    {
        var restored = JsonSerializer.Deserialize<Player>("""
            {
              "Name": "Legacy",
              "StablePlayerId": "legacy-player",
              "Inventory": { "Items": [] },
              "Revealed": {}
            }
            """);
        var gameData = CreateGameData();

        Assert.NotNull(restored);
        Assert.Null(restored.Property);
        Assert.False(restored.Revealed.Property);

        var cards = gameData.SpecialCards
            .Where(card => card.Id is "property_swap" or "property_reroll" or "property_reveal")
            .ToDictionary(card => card.Id);
        Assert.Equal(3, cards.Count);
        Assert.True(cards["property_swap"].RequiresTarget);
        Assert.False(cards["property_reroll"].RequiresTarget);
        Assert.True(cards["property_reveal"].RequiresTarget);
    }

    [Fact]
    public void PropertyThreatContributionUsesServerCapturedTagsAndIsNeverMarkedForConsumption()
    {
        var state = new ThreatInteractionState
        {
            Contributions =
            [
                new()
                {
                    ContributionId = "property-contribution",
                    SourceType = "property",
                    SourceId = "property-home",
                    OwnerPlayerId = "owner",
                    IsAccepted = true,
                    Status = "accepted",
                    TagsSnapshot = ["radiation_detection", "radiation_protection", "repair_tools"]
                }
            ]
        };
        var hub = RuntimeHelpers.GetUninitializedObject(typeof(GameHub));
        var build = typeof(GameHub).GetMethod(
            "BuildRadiationOperationBonuses",
            BindingFlags.Instance | BindingFlags.NonPublic);

        Assert.NotNull(build);
        var bonuses = Assert.IsType<ThreatOperationBonusState>(build!.Invoke(hub, [state]));

        Assert.Contains("property-contribution", bonuses.UsefulContributionIds);
        Assert.Contains("detection", bonuses.AutoCompletedCategories);
        Assert.Contains("owner", bonuses.ProtectedPlayerIds);
        Assert.Equal(10, bonuses.TimeBonusSeconds);
        Assert.Equal(1, bonuses.RepairRetryTokens);
        Assert.False(state.Contributions[0].IsConsumed);
    }

    private static GameDataService CreateGameData()
    {
        var root = FindRepositoryRoot();
        return new GameDataService(
            new TestWebHostEnvironment(root),
            NullLogger<GameDataService>.Instance);
    }

    private static string FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Bunker.csproj")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        return directory!.FullName;
    }

    private sealed class TestWebHostEnvironment(string root) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Bunker.UnitTests";
        public IFileProvider WebRootFileProvider { get; set; } = new PhysicalFileProvider(Path.Combine(root, "wwwroot"));
        public string WebRootPath { get; set; } = Path.Combine(root, "wwwroot");
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new PhysicalFileProvider(root);
    }
}
