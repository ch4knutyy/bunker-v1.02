using Bunker.Data.ContentPersistence;
using Bunker.Services;
using Bunker.Services.ContentMigration;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

var arguments = args.ToList();
var dryRun = arguments.Remove("--dry-run");
var report = arguments.Remove("--report");
var compare = arguments.Remove("--compare");
var contentRoot = ReadOption(arguments, "--content-root");
var database = ReadOption(arguments, "--database");

if (string.IsNullOrWhiteSpace(database) || (!report && string.IsNullOrWhiteSpace(contentRoot)))
{
    Console.Error.WriteLine("Usage: dotnet run --project tools/ContentMigration -- --content-root <wwwroot/data> --database <content.db> [--dry-run]");
    Console.Error.WriteLine("   or: dotnet run --project tools/ContentMigration -- --database <content.db> --report");
    Console.Error.WriteLine("   or: dotnet run --project tools/ContentMigration -- --content-root <wwwroot/data> --database <content.db> --compare");
    return 2;
}

database = Path.GetFullPath(database);
if (report && compare)
{
    Console.Error.WriteLine("Choose either --report or --compare.");
    return 2;
}
if (report)
{
    if (!File.Exists(database))
    {
        Console.Error.WriteLine($"Content database does not exist: {database}");
        return 2;
    }

    var reportOptions = new DbContextOptionsBuilder<ContentDbContext>().UseSqlite($"Data Source={database}").Options;
    await using var reportDb = new ContentDbContext(reportOptions);
    Console.WriteLine($"Content database report: {database}");
    foreach (var category in await reportDb.Items.GroupBy(item => item.CategoryKey)
                 .Select(group => new { Category = group.Key, Count = group.Count() })
                 .OrderBy(row => row.Category).ToListAsync())
        Console.WriteLine($"category {category.Category}={category.Count}");
    foreach (var relationship in await reportDb.Relationships.GroupBy(item => item.Kind)
                 .Select(group => new { Kind = group.Key, Count = group.Count() })
                 .OrderBy(row => row.Kind).ToListAsync())
        Console.WriteLine($"relationship {relationship.Kind}={relationship.Count}");
    foreach (var localization in await reportDb.Localizations.GroupBy(item => item.Language)
                 .Select(group => new { Language = group.Key, Count = group.Count() })
                 .OrderBy(row => row.Language).ToListAsync())
        Console.WriteLine($"localization {localization.Language}={localization.Count}");
    var mentalEnglishFallbacks = await reportDb.Items
        .Where(item => item.CategoryKey == "mental_conditions" &&
                       item.Localizations.Any(localization => localization.Language == "uk") &&
                       !item.Localizations.Any(localization => localization.Language == "en"))
        .CountAsync();
    Console.WriteLine($"fallback mental_conditions:en->uk={mentalEnglishFallbacks}");
    Console.WriteLine($"totals documents={await reportDb.Documents.CountAsync()}, items={await reportDb.Items.CountAsync()}, localizations={await reportDb.Localizations.CountAsync()}, tags={await reportDb.Tags.CountAsync()}, relationships={await reportDb.Relationships.CountAsync()}");
    return 0;
}

contentRoot = Path.GetFullPath(contentRoot!);
if (compare)
{
    if (!File.Exists(database))
    {
        Console.Error.WriteLine($"Content database does not exist: {database}");
        return 2;
    }

    var comparisonOptions = new DbContextOptionsBuilder<ContentDbContext>()
        .UseSqlite(new SqliteConnectionStringBuilder { DataSource = database, Mode = SqliteOpenMode.ReadOnly }.ToString())
        .Options;
    await using var comparisonDb = new ContentDbContext(comparisonOptions);
    var sqlite = await new SqliteContentReader(comparisonDb).ReadAsync();
    var webRoot = Directory.GetParent(contentRoot)?.FullName
        ?? throw new InvalidOperationException("Content root must be nested below wwwroot.");
    var repositoryRoot = Directory.GetParent(webRoot)?.FullName
        ?? throw new InvalidOperationException("wwwroot must be nested below the repository root.");
    var json = new GameDataService(new ComparisonEnvironment(repositoryRoot, webRoot), NullLogger<GameDataService>.Instance);
    var scenarios = new ScenarioContentRegistry(Path.Combine(contentRoot, "scenario"));
    var differences = ContentSemanticComparer.Compare(json, scenarios, sqlite);
    if (differences.Count == 0)
    {
        Console.WriteLine("Semantic comparison passed: JSON and SQLite content are equivalent.");
        return 0;
    }

    foreach (var difference in differences)
        Console.Error.WriteLine($"difference: {difference.Category}: {difference.Detail}");
    return 1;
}

if (!dryRun && string.Equals(Path.GetFileName(database), "bunker.db", StringComparison.OrdinalIgnoreCase))
{
    Console.Error.WriteLine("Refusing to write bunker.db. Content migration requires a separate SQLite database file.");
    return 2;
}

var options = new DbContextOptionsBuilder<ContentDbContext>();
if (dryRun)
    options.UseSqlite("Data Source=:memory:");
else
    options.UseSqlite($"Data Source={database}");

await using var db = new ContentDbContext(options.Options);
if (dryRun)
{
    await db.Database.OpenConnectionAsync();
    await db.Database.EnsureCreatedAsync();
}
else
{
    await db.Database.MigrateAsync();
}

var importer = new ContentJsonImporter(db, TimeProvider.System);
try
{
    var result = await importer.ImportAsync(new ContentImportRequest(contentRoot, dryRun));
    Console.WriteLine($"{(result.DryRun ? "Dry run" : "Import")} complete: documents={result.DocumentCount}, items={result.ItemCount}, localizations={result.LocalizationCount}, tags={result.TagCount}, relationships={result.RelationshipCount}.");
    foreach (var issue in result.Issues.Where(issue => issue.Severity == "error"))
        Console.WriteLine($"{issue.Severity}: {issue.SourcePath} [{issue.StableId}] {issue.Message}");
    var missingTranslations = result.Issues.Count(issue => issue.Severity == "warning" && issue.Message.StartsWith("Missing translation", StringComparison.Ordinal));
    if (missingTranslations > 0)
        Console.WriteLine($"warning: missing translations={missingTranslations}; inspect ContentImportResult.Issues or the focused test for individual records.");
    return 0;
}
catch (ContentImportValidationException exception)
{
    foreach (var issue in exception.Issues)
        Console.Error.WriteLine($"{issue.Severity}: {issue.SourcePath} [{issue.StableId}] {issue.Message}");
    return 1;
}

static string? ReadOption(IReadOnlyList<string> arguments, string name)
{
    for (var index = 0; index < arguments.Count - 1; index++)
        if (string.Equals(arguments[index], name, StringComparison.Ordinal)) return arguments[index + 1];
    return null;
}

sealed class ComparisonEnvironment(string contentRoot, string webRoot) : IWebHostEnvironment
{
    public string ApplicationName { get; set; } = "ContentMigration";
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    public string WebRootPath { get; set; } = webRoot;
    public string EnvironmentName { get; set; } = "Development";
    public string ContentRootPath { get; set; } = contentRoot;
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}
