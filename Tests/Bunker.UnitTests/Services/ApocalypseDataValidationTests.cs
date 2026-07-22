using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class ApocalypseDataValidationTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public void ProductionRootDeserializesAndValidatesExpectedCounts()
    {
        var root = LoadRoot();

        GameDataService.ValidateApocalypseData(root);

        Assert.Equal(220, root.Apocalypses.Count);
        Assert.Equal(200, root.Apocalypses.Count(item => item.Gameplay?.Interactive != true));
        Assert.Equal(20, root.Apocalypses.Count(item => item.Gameplay?.Interactive == true));
        Assert.Equal(10, root.CategoryCatalog.Count);
        Assert.Equal(10, root.VisualThemeProfiles.Count);
        Assert.Equal(2, root.InteractiveEffectSchema?.Version);
    }

    [Fact]
    public void GameDataServiceCachesCatalogsAndProvidesCaseInsensitiveLookups()
    {
        var service = LoadService();
        var apocalypse = service.Apocalypses[0];
        var category = service.ApocalypseCategories[0];
        var theme = service.ApocalypseVisualThemes[0];

        Assert.Equal(220, service.Apocalypses.Count);
        Assert.Equal(10, service.ApocalypseCategories.Count);
        Assert.Equal(10, service.ApocalypseVisualThemes.Count);
        Assert.Equal(2, service.ApocalypseInteractiveSchema?.Version);
        Assert.Same(apocalypse, service.FindApocalypseById(apocalypse.Id.ToUpperInvariant()));
        Assert.Same(category, service.GetApocalypseCategoryById(category.Id.ToUpperInvariant()));
        Assert.Same(theme, service.GetApocalypseVisualThemeById(theme.Id.ToUpperInvariant()));
        Assert.Equal(20, service.GetInteractiveApocalypses().Count);
        Assert.False(service.Apocalypses is List<Apocalypse>);
    }

    [Fact]
    public void DuplicateApocalypseIdIsRejected()
    {
        var root = LoadRoot();
        root.Apocalypses[1].Id = root.Apocalypses[0].Id.ToUpperInvariant();
        AssertValidationError(root, "duplicate apocalypse IDs");
    }

    [Fact]
    public void DuplicateCategoryIdIsRejected()
    {
        var root = LoadRoot();
        root.CategoryCatalog[1].Id = root.CategoryCatalog[0].Id.ToUpperInvariant();
        AssertValidationError(root, "duplicate category IDs");
    }

    [Fact]
    public void DuplicateThemeIdIsRejected()
    {
        var root = LoadRoot();
        root.VisualThemeProfiles[1].Id = root.VisualThemeProfiles[0].Id.ToUpperInvariant();
        AssertValidationError(root, "duplicate visual theme IDs");
    }

    [Fact]
    public void UnknownCategoryIsRejected()
    {
        var root = LoadRoot();
        root.Apocalypses[0].CategoryId = "missing-category";
        AssertValidationError(root, "unknown category");
    }

    [Fact]
    public void UnknownVisualThemeIsRejected()
    {
        var root = LoadRoot();
        root.Apocalypses[0].VisualThemeId = "missing-theme";
        AssertValidationError(root, "unknown visual theme");
    }

    [Fact]
    public void VisualThemeFromAnotherCategoryIsRejected()
    {
        var root = LoadRoot();
        var apocalypse = root.Apocalypses[0];
        apocalypse.VisualThemeId = root.VisualThemeProfiles.First(theme =>
            !string.Equals(theme.CategoryId, apocalypse.CategoryId, StringComparison.OrdinalIgnoreCase)).Id;
        AssertValidationError(root, "instead of");
    }

    [Theory]
    [InlineData("unknown-modifier", "unknown visual modifier")]
    [InlineData("unsafe_modifier", "unsafe visual modifier")]
    [InlineData("", "empty visual modifier")]
    public void InvalidVisualModifierIsRejected(string modifier, string expected)
    {
        var root = LoadRoot();
        root.Apocalypses[0].VisualModifierIds = [modifier];
        AssertValidationError(root, expected);
    }

    [Fact]
    public void DuplicateVisualModifierIsRejected()
    {
        var root = LoadRoot();
        root.Apocalypses[0].VisualModifierIds = ["storm", "STORM"];
        AssertValidationError(root, "duplicate visual modifiers");
    }

    [Fact]
    public void MoreThanThreeVisualModifiersIsRejected()
    {
        var root = LoadRoot();
        root.Apocalypses[0].VisualModifierIds = ["storm", "flood", "fog", "frost"];
        AssertValidationError(root, "more than 3 visual modifiers");
    }

    [Fact]
    public void NullVisualModifiersAreNormalizedAndValidZeroToThreeRemainReadOnly()
    {
        var root = LoadRoot();
        root.Apocalypses[0].VisualModifierIds = null;
        root.Apocalypses[1].VisualModifierIds = ["storm", "flood", "fog"];

        GameDataService.ValidateApocalypseData(root);

        Assert.Empty(root.Apocalypses[0].VisualModifierIds!);
        Assert.Equal(new[] { "storm", "flood", "fog" }, root.Apocalypses[1].VisualModifierIds);
        Assert.False(root.Apocalypses[1].VisualModifierIds is List<string>);
    }

    [Fact]
    public void VisualModifierNormalizationCopiesTheDeserializedCollection()
    {
        var root = LoadRoot();
        var source = new List<string> { "drought", "toxic", "vegetation-collapse" };
        root.Apocalypses[0].VisualModifierIds = source;

        GameDataService.ValidateApocalypseData(root);
        source[0] = "flood";
        source.Add("storm");

        Assert.Equal(new[] { "drought", "toxic", "vegetation-collapse" }, root.Apocalypses[0].VisualModifierIds);
        Assert.False(root.Apocalypses[0].VisualModifierIds is List<string>);
    }

    [Fact]
    public void LobbyCatalogCategoryTotalsAreCanonicalAndSumToProductionCount()
    {
        var service = LoadService();
        var catalog = new ApocalypseSelectionService(service).BuildCatalog(new RoomGameSettings(), "uk");

        Assert.Equal(10, catalog.Categories.Count);
        Assert.Equal(220, catalog.Categories.Sum(category => category.TotalCount));
        Assert.All(catalog.Categories, category => Assert.Equal(category.TotalCount, category.OrdinaryCount + category.InteractiveCount));
        var json = JsonSerializer.Serialize(catalog);
        Assert.DoesNotContain("effectProfileId", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"Effects\":", json, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("theme unsafe")]
    [InlineData(".theme")]
    [InlineData("#theme")]
    [InlineData("theme{color:red;}")]
    [InlineData("url(https://example.test)")]
    public void UnsafeCssClassIsRejected(string cssClass)
    {
        var root = LoadRoot();
        root.VisualThemeProfiles[0].CssClass = cssClass;
        AssertValidationError(root, "unsafe cssClass");
    }

    [Fact]
    public void InteractiveApocalypseWithoutEffectsIsRejected()
    {
        var root = LoadRoot();
        root.Apocalypses.First(item => item.Gameplay?.Interactive == true).Gameplay!.Effects = [];
        AssertValidationError(root, "gameplay effects are required");
    }

    [Fact]
    public void UnsupportedGameplaySchemaVersionIsRejected()
    {
        var root = LoadRoot();
        root.Apocalypses.First(item => item.Gameplay != null).Gameplay!.SchemaVersion = 3;
        AssertValidationError(root, "gameplay schemaVersion must be 2");
    }

    [Fact]
    public void UnsupportedRootSchemaVersionIsRejected()
    {
        var root = LoadRoot();
        root.InteractiveEffectSchema!.Version = 3;
        AssertValidationError(root, "interactive effect schema version must be 2");
    }

    [Fact]
    public void RecurringActivationWithoutIntervalIsRejected()
    {
        var root = LoadRoot();
        var gameplay = root.Apocalypses.First(item => item.Gameplay?.Activation?.Mode == "recurring").Gameplay!;
        gameplay.Activation!.IntervalRounds = null;
        AssertValidationError(root, "recurring activation requires intervalRounds");
    }

    [Fact]
    public void OrdinaryApocalypseWithoutGameplayIsAccepted()
    {
        var root = LoadRoot();
        Assert.Contains(root.Apocalypses, item => item.Gameplay == null);
        GameDataService.ValidateApocalypseData(root);
    }

    [Fact]
    public void EffectExtensionDataSurvivesRoundTrip()
    {
        const string json = """{"type":"multiply_all_player_weight","factor":1.5,"minimum":20,"includeEliminated":false,"characteristicKeys":["weight","height"]}""";
        var effect = JsonSerializer.Deserialize<ApocalypseEffectDefinition>(json, JsonOptions)!;
        var roundTrip = JsonSerializer.Deserialize<ApocalypseEffectDefinition>(JsonSerializer.Serialize(effect), JsonOptions)!;

        Assert.Equal("multiply_all_player_weight", roundTrip.Type);
        Assert.Equal(1.5, roundTrip.Parameters["factor"].GetDouble());
        Assert.Equal(20, roundTrip.Parameters["minimum"].GetInt32());
        Assert.False(roundTrip.Parameters["includeEliminated"].GetBoolean());
        Assert.Equal(2, roundTrip.Parameters["characteristicKeys"].GetArrayLength());
    }

    [Fact]
    public void ClientInfoContainsSafeSummaryButNotRawEffects()
    {
        var apocalypse = LoadRoot().Apocalypses.First(item => item.Gameplay?.Interactive == true);
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(apocalypse.ToClientInfo()));
        var payload = document.RootElement;

        Assert.Equal(apocalypse.CategoryId, payload.GetProperty("categoryId").GetString());
        Assert.Equal(apocalypse.VisualThemeId, payload.GetProperty("visualThemeId").GetString());
        Assert.True(payload.GetProperty("interactive").GetBoolean());
        Assert.True(payload.TryGetProperty("gameplay", out var gameplay));
        Assert.True(gameplay.TryGetProperty("activationMode", out _));
        Assert.False(gameplay.TryGetProperty("effects", out _));
        Assert.DoesNotContain("effectProfileId", payload.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("includeEliminated", payload.GetRawText(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ClientInfoProjectsOnlyNormalizedAllowlistedVisualModifiers()
    {
        var apocalypse = new Apocalypse
        {
            VisualModifierIds = ["STORM", "unknown-modifier", "unsafe_modifier", "storm", "flood", "fog", "frost"]
        };
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(apocalypse.ToClientInfo()));
        var modifiers = document.RootElement.GetProperty("visualModifierIds")
            .EnumerateArray().Select(value => value.GetString()).ToArray();

        Assert.Equal(new[] { "storm", "flood", "fog" }, modifiers);
    }

    [Fact]
    public void SnapshotStyleClonePreservesDefinitionMetadata()
    {
        var source = LoadRoot().Apocalypses.First(item => item.Gameplay?.Interactive == true);
        var clone = JsonSerializer.Deserialize<Apocalypse>(JsonSerializer.Serialize(source), JsonOptions)!;

        Assert.Equal(source.CategoryId, clone.CategoryId);
        Assert.Equal(source.VisualThemeId, clone.VisualThemeId);
        Assert.Equal(source.Gameplay!.EffectProfileId, clone.Gameplay!.EffectProfileId);
        Assert.Equal(source.Gameplay.Effects.Count, clone.Gameplay.Effects.Count);
        Assert.Equal(source.Gameplay.Effects[0].Parameters.Keys, clone.Gameplay.Effects[0].Parameters.Keys);
    }

    private static void AssertValidationError(ApocalypsesRoot root, string expected)
    {
        var error = Assert.Throws<InvalidDataException>(() => GameDataService.ValidateApocalypseData(root));
        Assert.Contains(expected, error.Message, StringComparison.OrdinalIgnoreCase);
    }

    private static ApocalypsesRoot LoadRoot() =>
        JsonSerializer.Deserialize<ApocalypsesRoot>(File.ReadAllText(ApocalypsePath()), JsonOptions)
        ?? throw new InvalidDataException("Production apocalypse root could not be deserialized.");

    private static GameDataService LoadService() =>
        new(new TestEnvironment(RepositoryRoot()), NullLogger<GameDataService>.Instance);

    private static string ApocalypsePath() => Path.Combine(RepositoryRoot(), "wwwroot", "data", "Apocalypses", "apocalypses.json");

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Bunker.csproj"))) directory = directory.Parent;
        return directory?.FullName ?? throw new DirectoryNotFoundException("Repository root not found");
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
