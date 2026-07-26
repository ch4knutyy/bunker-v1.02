using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class CatalogItemServiceTests
{
    private static readonly Lazy<GameDataService> Data = new(CreateGameData);

    [Fact]
    public void PickerUsesStableIdsLocalizedProjectionAndServerPagination()
    {
        var service = new CatalogItemService(Data.Value);

        var page = service.GetPage("fact", null, "en", 2, 7, null, false);
        var secretCards = service.GetPage("specialCard", null, "uk", 1, 50, null, false);

        Assert.Equal("fact", page.Category);
        Assert.Equal(2, page.Page);
        Assert.Equal(7, page.Items.Count);
        Assert.Equal(300, page.Total);
        Assert.Equal(7, page.Items.Select(item => item.RecordId).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.All(page.Items, item => Assert.False(string.IsNullOrWhiteSpace(item.Title)));
        Assert.All(secretCards.Items, item => Assert.Null(item.TechnicalEffectType));
    }

    [Fact]
    public void ReplacementPreservesRevealAccountingAndProfessionInventoryBoundary()
    {
        var service = new CatalogItemService(Data.Value);
        var player = GeneratePlayer();
        player.FutureRevealCredits = 3;
        player.Revealed.Fact = true;
        player.Profession.ExperienceYears = 17;
        var inventoryIds = player.Inventory.Items.Select(item => item.DefinitionId).ToArray();
        var fact = service.GetPage("fact", player, "uk", 1, 1, null, false).Items[0];
        var profession = service.GetPage("profession", player, "uk", 1, 1, null, false).Items[0];

        var factResult = service.ApplyReplacement(player,
            new("fact", player.StablePlayerId, fact.RecordId, "replace", null, null, "fact-command"));
        var professionResult = service.ApplyReplacement(player,
            new("profession", player.StablePlayerId, profession.RecordId, "replace", null, null, "profession-command"));

        Assert.True(factResult.Success);
        Assert.True(professionResult.Success);
        Assert.Equal(3, player.FutureRevealCredits);
        Assert.True(player.Revealed.Fact);
        Assert.Equal(17, player.Profession.ExperienceYears);
        Assert.Equal("profession", player.ProfessionItem.Source);
        Assert.Equal(inventoryIds, player.Inventory.Items.Select(item => item.DefinitionId));
    }

    [Fact]
    public void ExchangeDeepCopiesValuesWithoutChangingRevealAccounting()
    {
        var service = new CatalogItemService(Data.Value);
        var source = GeneratePlayer();
        var target = GeneratePlayer();
        source.FutureRevealCredits = 2;
        target.FutureRevealCredits = 4;
        source.Revealed.Hobby = true;
        target.Revealed.Hobby = false;
        var sourceId = source.Hobby.Id;
        var targetId = target.Hobby.Id;
        var sourceHobby = source.Hobby;
        var targetHobby = target.Hobby;

        var result = service.ApplyOperation(source, target,
            new("exchange", "hobby", source.StablePlayerId, target.StablePlayerId, null, null,
                sourceId, targetId, "exchange-command"));

        Assert.True(result.Success);
        Assert.Equal(targetId, source.Hobby.Id);
        Assert.Equal(sourceId, target.Hobby.Id);
        Assert.NotSame(targetHobby, source.Hobby);
        Assert.NotSame(sourceHobby, target.Hobby);
        Assert.Equal((2, 4), (source.FutureRevealCredits, target.FutureRevealCredits));
        Assert.Equal((true, false), (source.Revealed.Hobby, target.Revealed.Hobby));
    }

    [Fact]
    public void IssuingSpecialCardDoesNotExecuteItsEffect()
    {
        var service = new CatalogItemService(Data.Value);
        var player = GeneratePlayer();
        player.SpecialCard = new();
        player.SpecialCards.Clear();
        player.ExtraVotes = 2;
        player.IsProtectedFromVote = true;
        var card = service.GetPage("specialCard", player, "uk", 1, 1, null, true).Items[0];

        var result = service.ApplyReplacement(player,
            new("specialCard", player.StablePlayerId, card.RecordId, "issue", null, null, "card-command"));
        var duplicate = service.ApplyReplacement(player,
            new("specialCard", player.StablePlayerId, card.RecordId, "issue", null, null, "duplicate-command"));

        Assert.True(result.Success);
        Assert.Contains(player.SpecialCards, item => item.Id == card.RecordId);
        Assert.False(player.SpecialCard.IsUsed);
        Assert.Equal(2, player.ExtraVotes);
        Assert.True(player.IsProtectedFromVote);
        Assert.False(duplicate.Success);
    }

    [Fact]
    public void HealthAndAdditionalConditionsValidateSeverityAndDuplicates()
    {
        var service = new CatalogItemService(Data.Value);
        var player = GeneratePlayer();
        var definition = Assert.Single(
            Data.Value.PhysicalConditions.Take(1));
        var item = Assert.Single(
            service.GetPage("physicalHealth", player, "uk", 1, 10, definition.Id, true).Items);
        var severity = item.SeverityCodes.FirstOrDefault();
        var valid = service.ApplyReplacement(player,
            new("physicalHealth", player.StablePlayerId, item.RecordId, "replace",
                severity, null, "health-command"));
        var invalid = service.ApplyReplacement(player,
            new("physicalHealth", player.StablePlayerId, item.RecordId, "replace",
                "not-a-severity", null, "invalid-health-command"));
        var added = service.ApplyReplacement(player,
            new("additionalPhysicalCondition", player.StablePlayerId, item.RecordId, "add",
                severity, null, "additional-command"));
        var duplicate = service.ApplyReplacement(player,
            new("additionalPhysicalCondition", player.StablePlayerId, item.RecordId, "add",
                severity, null, "duplicate-additional-command"));

        Assert.True(valid.Success);
        Assert.False(invalid.Success);
        Assert.True(added.Success);
        Assert.False(duplicate.Success);
        Assert.Single(player.AdditionalConditionEffects);
        Assert.Throws<CatalogItemRequestException>(() =>
            service.GetPage("unknown", player, "uk", 1, 10, null, false));
    }

    [Fact]
    public void TransferRequiresReplacementAndOppositeSexLeavesOrientationUntouched()
    {
        var service = new CatalogItemService(Data.Value);
        var source = GeneratePlayer();
        var target = GeneratePlayer();
        var sourceId = source.Fact.Id;
        var targetId = target.Fact.Id;
        var withoutReplacement = service.PreviewOperation(source, target,
            new("transfer", "fact", source.StablePlayerId, target.StablePlayerId, null, null,
                sourceId, targetId, "transfer-preview"));
        source.Personality.Sex = "Чоловіча";
        source.Personality.SexOrientation = "Гетеросексуальна";
        var opposite = service.ApplyOperation(source, null,
            new("oppositeSex", "personalitySex", source.StablePlayerId, null, null, null,
                null, null, "opposite-command"));
        var mappedSex = source.Personality.Sex;
        source.Personality.Sex = "Невідомо";
        var ambiguous = service.PreviewOperation(source, null,
            new("oppositeSex", "personalitySex", source.StablePlayerId, null, null, null,
                null, null, "ambiguous-preview"));

        Assert.False(withoutReplacement.Allowed);
        Assert.Equal("source_replacement_required", withoutReplacement.Code);
        Assert.True(opposite.Success);
        Assert.Equal("Жіноча", mappedSex);
        Assert.Equal("Гетеросексуальна", source.Personality.SexOrientation);
        Assert.False(ambiguous.Allowed);
        Assert.Equal("explicit_sex_selection_required", ambiguous.Code);
    }

    private static Player GeneratePlayer()
    {
        var generator = new CharacterGeneratorService(
            Data.Value,
            NullLogger<CharacterGeneratorService>.Instance);
        var player = generator.Generate($"player-{Guid.NewGuid():N}");
        player.StablePlayerId = Guid.NewGuid().ToString("N");
        return player;
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
            directory = directory.Parent;

        Assert.NotNull(directory);
        return directory!.FullName;
    }

    private sealed class TestWebHostEnvironment(string root) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Bunker.UnitTests";
        public IFileProvider WebRootFileProvider { get; set; } =
            new PhysicalFileProvider(Path.Combine(root, "wwwroot"));
        public string WebRootPath { get; set; } = Path.Combine(root, "wwwroot");
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new PhysicalFileProvider(root);
    }
}
