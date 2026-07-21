using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class ApocalypseSelectionServiceTests
{
    private static readonly Lazy<GameDataService> Data = new(() => new GameDataService(new TestEnvironment(FindRoot()), NullLogger<GameDataService>.Instance));
    private static ApocalypseSelectionService Service => new(Data.Value);

    [Fact]
    public void RandomAllCanChooseOrdinaryAndChanceZeroAlwaysDoes()
    {
        var settings = Defaults(); settings.InteractiveApocalypseChancePercent = 0;
        Assert.False(Service.SelectCandidate(settings, _ => 0).Gameplay?.Interactive == true);
    }

    [Fact]
    public void ChanceOneHundredChoosesInteractive()
    {
        var settings = Defaults(); settings.InteractiveApocalypseChancePercent = 100;
        Assert.True(Service.SelectCandidate(settings, _ => 0).Gameplay?.Interactive == true);
    }

    [Fact]
    public void InteractiveDisabledNeverChoosesInteractive()
    {
        var settings = Defaults(); settings.AllowInteractiveApocalypses = false; settings.InteractiveApocalypseChancePercent = 100;
        Assert.False(Service.SelectCandidate(settings, _ => 0).Gameplay?.Interactive == true);
    }

    [Fact]
    public void RandomCategoriesUsesOnlySelectedCategories()
    {
        var settings = Defaults(); settings.ApocalypseSelectionMode = ApocalypseSelectionMode.RandomCategories;
        settings.AllowedApocalypseCategoryIds = ["cosmic"]; settings.InteractiveApocalypseChancePercent = 0;
        Assert.Equal("cosmic", Service.SelectCandidate(settings, _ => 0).CategoryId);
    }

    [Fact]
    public void SpecificReturnsExactIdAndIgnoresChance()
    {
        var target = Data.Value.Apocalypses.First(item => item.Gameplay == null);
        var settings = Defaults(); settings.ApocalypseSelectionMode = ApocalypseSelectionMode.Specific;
        settings.SelectedApocalypseId = target.Id; settings.InteractiveApocalypseChancePercent = 100;
        Assert.Same(target, Service.SelectCandidate(settings, _ => throw new InvalidOperationException()));
    }

    [Fact]
    public void SpecificInteractiveIsRejectedWhenInteractiveDisabled()
    {
        var target = Data.Value.Apocalypses.First(item => item.Gameplay?.Interactive == true);
        var settings = Defaults(); settings.ApocalypseSelectionMode = ApocalypseSelectionMode.Specific;
        settings.SelectedApocalypseId = target.Id; settings.AllowInteractiveApocalypses = false;
        Assert.Contains("apocalypse_interactive_unavailable", Service.ValidateSettings(settings));
    }

    [Fact]
    public void CustomPoolUsesOnlyConfiguredIds()
    {
        var targets = Data.Value.Apocalypses.Where(item => item.Gameplay == null).Take(2).ToList();
        var settings = Defaults(); settings.ApocalypseSelectionMode = ApocalypseSelectionMode.CustomPool;
        settings.ApocalypseCustomPoolIds = targets.Select(item => item.Id).ToList(); settings.InteractiveApocalypseChancePercent = 0;
        Assert.Contains(Service.SelectCandidate(settings, _ => 1).Id, settings.ApocalypseCustomPoolIds);
    }

    [Theory]
    [InlineData(ApocalypseSelectionMode.RandomCategories, "apocalypse_categories_empty")]
    [InlineData(ApocalypseSelectionMode.CustomPool, "apocalypse_pool_empty")]
    public void EmptyModeInputsAreRejected(ApocalypseSelectionMode mode, string error)
    {
        var settings = Defaults(); settings.ApocalypseSelectionMode = mode;
        settings.AllowedApocalypseCategoryIds = []; settings.ApocalypseCustomPoolIds = [];
        Assert.Contains(error, Service.ValidateSettings(settings));
    }

    [Fact]
    public void UnknownCategoryAndApocalypseIdsAreRejected()
    {
        var categories = Defaults(); categories.ApocalypseSelectionMode = ApocalypseSelectionMode.RandomCategories;
        categories.AllowedApocalypseCategoryIds = ["missing"];
        Assert.Contains("apocalypse_category_unknown", Service.ValidateSettings(categories));
        var specific = Defaults(); specific.ApocalypseSelectionMode = ApocalypseSelectionMode.Specific; specific.SelectedApocalypseId = "missing";
        Assert.Contains("apocalypse_specific_missing", Service.ValidateSettings(specific));
        var pool = Defaults(); pool.ApocalypseSelectionMode = ApocalypseSelectionMode.CustomPool; pool.ApocalypseCustomPoolIds = ["missing"];
        Assert.Contains("apocalypse_id_unknown", Service.ValidateSettings(pool));
    }

    [Fact]
    public void DuplicateIdsAreRejectedCaseInsensitively()
    {
        var settings = Defaults(); settings.ApocalypseSelectionMode = ApocalypseSelectionMode.CustomPool;
        var id = Data.Value.Apocalypses[0].Id; settings.ApocalypseCustomPoolIds = [id, id.ToUpperInvariant()];
        Assert.Contains("apocalypse_pool_duplicate", Service.ValidateSettings(settings));
        settings.ApocalypseSelectionMode = ApocalypseSelectionMode.RandomCategories; settings.ApocalypseCustomPoolIds = [];
        settings.AllowedApocalypseCategoryIds = ["cosmic", "COSMIC"];
        Assert.Contains("apocalypse_category_duplicate", Service.ValidateSettings(settings));
    }

    [Fact]
    public void ImpossibleInteractiveSplitIsRejected()
    {
        var ordinary = Data.Value.Apocalypses.First(item => item.Gameplay == null);
        var settings = Defaults(); settings.ApocalypseSelectionMode = ApocalypseSelectionMode.CustomPool;
        settings.ApocalypseCustomPoolIds = [ordinary.Id]; settings.InteractiveApocalypseChancePercent = 100;
        Assert.Contains("apocalypse_interactive_unavailable", Service.ValidateSettings(settings));
    }

    [Fact]
    public void ResolveForStartIsIdempotentAndDisabledReturnsNull()
    {
        var room = new Room(); var settings = Defaults(); settings.InteractiveApocalypseChancePercent = 0;
        var draws = 0;
        var first = Service.ResolveForStart(room, settings, max => { draws++; return 0; });
        var second = Service.ResolveForStart(room, settings, _ => throw new InvalidOperationException());
        Assert.Same(first, second); Assert.Equal(2, draws);
        settings.ApocalypseEnabled = false;
        Assert.Null(Service.ResolveForStart(new Room(), settings, _ => throw new InvalidOperationException()));
    }

    [Fact]
    public void CatalogIsSanitizedAndPreviewDoesNotResolveRandomChoice()
    {
        var catalog = Service.BuildCatalog(Defaults(), "en");
        Assert.Equal(10, catalog.Categories.Count); Assert.Equal(220, catalog.Apocalypses.Count);
        Assert.Null(catalog.Preview.Specific);
        Assert.All(catalog.Apocalypses, item => Assert.False(item.ImageUrl?.StartsWith("http", StringComparison.OrdinalIgnoreCase) == true));
    }

    private static RoomGameSettings Defaults() => RoomGameSettingsService.Preset(GamePreset.Classic);
    private static string FindRoot() { var directory = new DirectoryInfo(AppContext.BaseDirectory); while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Bunker.csproj"))) directory = directory.Parent; return directory?.FullName ?? throw new DirectoryNotFoundException(); }
    private sealed class TestEnvironment(string root) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Bunker.UnitTests"; public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = Path.Combine(root, "wwwroot"); public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = root; public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
