using System.Text.Json;
using System.Reflection;
using Bunker.Hubs;
using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services.CharacterGeneration;

public class ProfessionItemGenerationTests
{
    [Fact]
    public void GeneratedProfessionItemComesFromProfessionItemsAndIsNotInventory()
    {
        var gameData = CreateGameData();
        var generator = new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance);

        for (var i = 0; i < 50; i++)
        {
            var player = generator.Generate($"P{i}");
            if (player.Profession.AllItems.Count == 0)
            {
                continue;
            }

            Assert.Contains(player.Profession.SelectedItem, player.Profession.AllItems);
            Assert.Equal(player.Profession.SelectedItem, player.ProfessionItem.Name);
            Assert.DoesNotContain(player.Inventory.Items, item => item.Name == player.ProfessionItem.Name);
            Assert.All(player.Inventory.Items, item => Assert.Equal("inventory", item.Source));
            Assert.Equal("profession", player.ProfessionItem.Source);
        }
    }

    [Fact]
    public void ProfessionItemInventoryAndProfessionSurviveJsonRoundTrip()
    {
        var gameData = CreateGameData();
        var generator = new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance);
        var player = generator.Generate("Reload");
        var inventoryBefore = JsonSerializer.Serialize(player.Inventory);
        var professionItemBefore = JsonSerializer.Serialize(player.ProfessionItem);
        var professionBefore = JsonSerializer.Serialize(player.Profession);

        var restored = JsonSerializer.Deserialize<Bunker.Models.Player>(JsonSerializer.Serialize(player))!;

        Assert.Equal(professionBefore, JsonSerializer.Serialize(restored.Profession));
        Assert.Equal(professionItemBefore, JsonSerializer.Serialize(restored.ProfessionItem));
        Assert.Equal(inventoryBefore, JsonSerializer.Serialize(restored.Inventory));
    }

    [Fact]
    public void ProfessionsJsonHasOnlyPhysicalItemsAndSynchronizedI18nItems()
    {
        var gameData = CreateGameData();
        var abstractValues = new[]
        {
            "Витончений смак",
            "Медичні знання",
            "Лідерські якості",
            "Критичне мислення",
            "Гарна пам’ять",
            "Гарна пам'ять",
            "Уміння переконувати"
        };

        foreach (var profession in gameData.Professions)
        {
            Assert.DoesNotContain(profession.Items, item => abstractValues.Contains(item));

            if (profession.I18n != null && profession.I18n.TryGetValue("items", out var itemsI18n))
            {
                Assert.Equal(JsonValueKind.Array, itemsI18n.ValueKind);
                Assert.Equal(profession.Items.Count, itemsI18n.GetArrayLength());
            }
        }
    }

    [Fact]
    public void ServerThreatItemResolverAcceptsOwnedProfessionItemAndRejectsForgedToken()
    {
        var player = CreatePlayerWithProfessionItem();
        var resolve = typeof(GameHub).GetMethod("ResolvePlayerThreatItem", BindingFlags.NonPublic | BindingFlags.Static);

        Assert.NotNull(resolve);
        var owned = resolve!.Invoke(null, new object[] { player, "profession", player.ProfessionItem.InstanceId });
        var forgedProfession = resolve.Invoke(null, new object[] { player, "profession", "profession:forged" });
        var forgedInventory = resolve.Invoke(null, new object[] { player, "inventory", player.ProfessionItem.InstanceId });

        Assert.Same(player.ProfessionItem, owned);
        Assert.Null(forgedProfession);
        Assert.Null(forgedInventory);
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

    private static Player CreatePlayerWithProfessionItem() =>
        new()
        {
            Name = "Tool owner",
            Profession = new Profession
            {
                Name = "Хірург",
                SelectedItem = "Скальпель"
            },
            ProfessionItem = new Item
            {
                Name = "Скальпель",
                InstanceId = "profession:scalpel-owned",
                Source = "profession"
            },
            Inventory = new Inventory
            {
                Items = new List<Item>
                {
                    new() { Name = "Радіоприймач", InstanceId = "inventory:radio-owned", Source = "inventory" }
                }
            }
        };

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
