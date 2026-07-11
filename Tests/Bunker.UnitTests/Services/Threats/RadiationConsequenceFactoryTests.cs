using System.Text.Json;
using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Models.Сharacteristics;

namespace Bunker.UnitTests.Services.Threats;

public class RadiationConsequenceFactoryTests
{
    [Fact]
    public void TwoFailedParticipantsEachReceiveOneRadiationCondition()
    {
        var condition = CreateRadiationCondition();
        var first = CreatePlayer("first");
        var second = CreatePlayer("second");

        var firstAdded = RadiationConsequenceFactory.TryAddRadiationCondition(first, condition, "hard", "radiation_leak", 3, out _);
        var secondAdded = RadiationConsequenceFactory.TryAddRadiationCondition(second, condition, "hard", "radiation_leak", 3, out _);

        Assert.True(firstAdded);
        Assert.True(secondAdded);
        Assert.Single(first.AdditionalConditionEffects);
        Assert.Single(second.AdditionalConditionEffects);
        Assert.Equal("Початкове здоров'я", first.PhysicalHealth.Name);
        Assert.Equal("Початкове здоров'я", second.PhysicalHealth.Name);
    }

    [Fact]
    public void RadiationConditionRoundTripKeepsNameBaseNameAndSeverity()
    {
        var player = CreatePlayer("reload");

        RadiationConsequenceFactory.TryAddRadiationCondition(
            player,
            CreateRadiationCondition(),
            "medium",
            "radiation_leak",
            3,
            out var effect);

        var json = JsonSerializer.Serialize(player);
        var restored = JsonSerializer.Deserialize<Player>(json)!;
        var restoredEffect = Assert.Single(restored.AdditionalConditionEffects);

        Assert.NotNull(effect);
        Assert.Equal(effect!.Name, restoredEffect.Name);
        Assert.Equal(effect.BaseName, restoredEffect.BaseName);
        Assert.Equal(effect.SeverityCode, restoredEffect.SeverityCode);
        Assert.Equal(effect.SeverityLevel, restoredEffect.SeverityLevel);
        Assert.DoesNotContain("Невідомо", json);
        Assert.DoesNotContain("Unknown", json);
        Assert.DoesNotContain("Неизвестно", json);
    }

    [Fact]
    public void DuplicatePhysical152IsSkippedAndInventoryIsNotChanged()
    {
        var player = CreatePlayer("repeat");
        player.Inventory.Items.Add(new Item { Name = "Ліхтар" });
        var inventoryBefore = JsonSerializer.Serialize(player.Inventory);
        var condition = CreateRadiationCondition();

        var firstAdded = RadiationConsequenceFactory.TryAddRadiationCondition(player, condition, "hard", "radiation_leak", 3, out _);
        var secondAdded = RadiationConsequenceFactory.TryAddRadiationCondition(player, condition, "hard", "radiation_leak", 4, out _);

        Assert.True(firstAdded);
        Assert.False(secondAdded);
        Assert.Single(player.AdditionalConditionEffects);
        Assert.Equal(inventoryBefore, JsonSerializer.Serialize(player.Inventory));
    }

    private static Player CreatePlayer(string name) =>
        new()
        {
            Name = name,
            PhysicalHealth = new PhysicalHealth
            {
                Id = "physical_start",
                BaseName = "Початкове здоров'я",
                Name = "Початкове здоров'я"
            }
        };

    private static PhysicalConditionData CreateRadiationCondition() =>
        new()
        {
            Id = RadiationConsequenceFactory.RadiationConditionId,
            HasSeverity = true,
            Localization = new Dictionary<string, ConditionLocalization>
            {
                ["uk"] = new()
                {
                    Name = "Променева хвороба",
                    Descriptions = new Dictionary<string, string>
                    {
                        ["medium"] = "Слабкість і падіння імунітету стають помітними.",
                        ["hard"] = "Кровотворення порушене, організм швидко виснажується."
                    }
                },
                ["en"] = new()
                {
                    Name = "Radiation sickness",
                    Descriptions = new Dictionary<string, string>
                    {
                        ["medium"] = "Weakness and immune suppression become visible.",
                        ["hard"] = "Blood formation is impaired."
                    }
                }
            }
        };
}
