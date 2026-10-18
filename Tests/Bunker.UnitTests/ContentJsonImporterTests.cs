using System.Text.Json;
using System.Text.Json.Nodes;
using Bunker.Data.ContentPersistence;
using Bunker.Services.ContentMigration;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bunker.UnitTests;

public sealed class ContentJsonImporterTests
{
    [Fact]
    public async Task ImportAsync_preserves_active_json_content_and_is_idempotent()
    {
        var contentRoot = FindContentRoot();
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<ContentDbContext>().UseSqlite(connection).Options;
        await using var db = new ContentDbContext(options);
        await db.Database.MigrateAsync();
        var importer = new ContentJsonImporter(db, TimeProvider.System);

        var first = await importer.ImportAsync(new ContentImportRequest(contentRoot, false));
        var second = await importer.ImportAsync(new ContentImportRequest(contentRoot, false));

        var apocalypsePath = "Apocalypses/apocalypses.json";
        var originalRoot = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(contentRoot, "Apocalypses", "apocalypses.json")))!;
        var original = originalRoot["apocalypses"]!.AsArray().Single(node => node!["id"]!.GetValue<string>() == "nuclear_war")!;
        var imported = await db.Items.SingleAsync(item => item.SourcePath == apocalypsePath && item.StableId == "nuclear_war");
        var ukrainian = await db.Localizations.SingleAsync(item => item.SourcePath == apocalypsePath && item.StableId == "nuclear_war" && item.Language == "uk");
        var eventItem = await db.Items.SingleAsync(item => item.SourcePath == "scenario/scenario_events.json" && item.StableId == "unknown_food_thief_6");

        Assert.Equal(first.ItemCount, second.ItemCount);
        Assert.Equal(first.ItemCount, await db.Items.CountAsync());
        Assert.True(JsonNode.DeepEquals(original, JsonNode.Parse(imported.PayloadJson)));
        Assert.Equal(8, JsonDocument.Parse(imported.PayloadJson).RootElement.GetProperty("survivalChance").GetInt32());
        Assert.Equal("Ядерна війна", JsonDocument.Parse(ukrainian.PayloadJson).RootElement.GetProperty("_i18n").GetProperty("name").GetString());
        Assert.Equal("remove_bunker_food", JsonDocument.Parse(eventItem.PayloadJson).RootElement.GetProperty("effects")[0].GetProperty("type").GetString());
        Assert.True(await db.Relationships.AnyAsync(item => item.Kind == "related_apocalypse"));
        Assert.Contains(first.Issues, issue => issue.Severity == "warning" && issue.Message.StartsWith("Missing translation", StringComparison.Ordinal));

        var mentalCondition = await db.Items.FirstAsync(item => item.SourcePath == "Mental_conditions/mental_conditions.uk.json");
        var englishFallback = ContentLocalizationFallback.ResolvePayload(
            await db.Localizations.Where(item => item.SourcePath == mentalCondition.SourcePath && item.StableId == mentalCondition.StableId).ToListAsync(),
            "en");
        Assert.NotNull(englishFallback);
        Assert.Equal(
            JsonDocument.Parse((await db.Localizations.SingleAsync(item => item.SourcePath == mentalCondition.SourcePath && item.StableId == mentalCondition.StableId && item.Language == "uk")).PayloadJson).RootElement.GetRawText(),
            JsonDocument.Parse(englishFallback!).RootElement.GetRawText());

        var countBeforeInvalidInput = await db.Items.AsNoTracking().CountAsync();
        var invalidRoot = Path.Combine(Path.GetTempPath(), $"bunker-content-import-{Guid.NewGuid():N}");
        CopyDirectory(contentRoot, invalidRoot);
        try
        {
            await File.WriteAllTextAsync(Path.Combine(invalidRoot, "items.json"), "{ \"items\": [ }");
            await Assert.ThrowsAsync<ContentImportValidationException>(() => importer.ImportAsync(new ContentImportRequest(invalidRoot, false)));
            Assert.Equal(countBeforeInvalidInput, await db.Items.AsNoTracking().CountAsync());

            await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER BlockContentItemInsert BEFORE INSERT ON ContentItems WHEN NEW.SourcePath = 'items.json' BEGIN SELECT RAISE(ABORT, 'rollback probe'); END;");
            try
            {
                await Assert.ThrowsAsync<DbUpdateException>(() => importer.ImportAsync(new ContentImportRequest(contentRoot, false)));
                db.ChangeTracker.Clear();
                Assert.Equal(countBeforeInvalidInput, await db.Items.AsNoTracking().CountAsync());
            }
            finally
            {
                await db.Database.ExecuteSqlRawAsync("DROP TRIGGER IF EXISTS BlockContentItemInsert;");
            }
        }
        finally
        {
            Directory.Delete(invalidRoot, recursive: true);
        }
    }

    private static string FindContentRoot()
    {
        for (var directory = new DirectoryInfo(Directory.GetCurrentDirectory()); directory != null; directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "wwwroot", "data");
            if (Directory.Exists(candidate)) return candidate;
        }
        throw new DirectoryNotFoundException("Could not find wwwroot/data from the test working directory.");
    }

    private static void CopyDirectory(string source, string destination)
    {
        foreach (var directory in Directory.EnumerateDirectories(source, "*", SearchOption.AllDirectories))
            Directory.CreateDirectory(Path.Combine(destination, Path.GetRelativePath(source, directory)));
        Directory.CreateDirectory(destination);
        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
            File.Copy(file, Path.Combine(destination, Path.GetRelativePath(source, file)));
    }
}
