using System.Text.Json;
using System.Text.Json.Nodes;
using Bunker.Data.ContentPersistence;
using Bunker.Models;
using Bunker.Services;
using Bunker.Services.ContentMigration;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests;

public sealed class SqliteContentReaderTests
{
    [Fact]
    public async Task ReadAsync_reconstructs_json_models_without_tracking_or_semantic_loss()
    {
        var root = FindRepositoryRoot();
        var dataRoot = Path.Combine(root, "wwwroot", "data");
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<ContentDbContext>().UseSqlite(connection).Options;
        await using var db = new ContentDbContext(options);
        await db.Database.MigrateAsync();
        await new ContentJsonImporter(db, TimeProvider.System).ImportAsync(new ContentImportRequest(dataRoot, false));
        db.ChangeTracker.Clear();

        var sqlite = await new SqliteContentReader(db).ReadAsync();
        var json = new GameDataService(new TestEnvironment(root), NullLogger<GameDataService>.Instance);
        var scenarios = new ScenarioContentRegistry(Path.Combine(dataRoot, "scenario"));

        AssertPoolsEqual(json, sqlite);
        AssertEquivalent(json.Bunkers, sqlite.Bunkers);
        AssertEquivalent(json.Properties, sqlite.Properties);
        AssertEquivalent(json.Apocalypses, sqlite.Apocalypses);
        AssertEquivalent(json.Threats, sqlite.Threats);
        AssertEquivalent(json.SpecialCards, sqlite.SpecialCards);
        AssertEquivalent(scenarios.Events, sqlite.ScenarioEvents);
        AssertEquivalent(scenarios.Cards, sqlite.EventSpecialCards);
        Assert.Empty(ContentSemanticComparer.Compare(json, scenarios, sqlite));

        var mental = sqlite.MentalConditions[0];
        var englishFallback = sqlite.ResolveLocalizationPayload("mental_conditions", mental.Id, "en");
        var ukrainian = sqlite.ResolveLocalizationPayload("mental_conditions", mental.Id, "uk");
        Assert.NotNull(englishFallback);
        Assert.NotNull(ukrainian);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(ukrainian!), JsonNode.Parse(englishFallback!)));
        Assert.Empty(db.ChangeTracker.Entries());
    }

    private static void AssertPoolsEqual(GameDataService json, SqliteContentSnapshot sqlite)
    {
        AssertEquivalent(json.Hobbies, sqlite.Hobbies);
        AssertEquivalent(json.Professions, sqlite.Professions);
        AssertEquivalent(json.MentalConditions, sqlite.MentalConditions);
        AssertEquivalent(json.PhysicalConditions, sqlite.PhysicalConditions);
        AssertEquivalent(json.Items, sqlite.Items);
        AssertEquivalent(json.CharacterTraits, sqlite.CharacterTraits);
        AssertEquivalent(json.Phobias, sqlite.Phobias);
        AssertEquivalent(json.Facts, sqlite.Facts);
        AssertEquivalent(json.ApocalypseCategories, sqlite.ApocalypseCategories);
        AssertEquivalent(json.ApocalypseVisualThemes, sqlite.ApocalypseVisualThemes);
        Assert.True(JsonNode.DeepEquals(
            JsonNode.Parse(JsonSerializer.Serialize(json.ApocalypseInteractiveSchema)),
            JsonNode.Parse(JsonSerializer.Serialize(sqlite.ApocalypseInteractiveSchema))));
        Assert.Equal(json.PropertyConditionProfiles.Keys.OrderBy(key => key), sqlite.PropertyConditionProfiles.Keys.OrderBy(key => key));
    }

    private static void AssertEquivalent<T>(IEnumerable<T> expected, IEnumerable<T> actual)
    {
        var expectedNodes = expected.Select(item => JsonNode.Parse(JsonSerializer.Serialize(item))).ToArray();
        var actualNodes = actual.Select(item => JsonNode.Parse(JsonSerializer.Serialize(item))).ToArray();
        Assert.Equal(expectedNodes.Length, actualNodes.Length);
        for (var index = 0; index < expectedNodes.Length; index++)
            Assert.True(JsonNode.DeepEquals(expectedNodes[index], actualNodes[index]), $"Semantic difference at index {index} for {typeof(T).Name}.");
    }

    private static string FindRepositoryRoot()
    {
        for (var directory = new DirectoryInfo(Directory.GetCurrentDirectory()); directory != null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Bunker.csproj"))) return directory.FullName;
        throw new DirectoryNotFoundException("Could not find the repository root.");
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
