using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Hosting;

namespace Bunker.UnitTests.Services;

public sealed class GlobalContentCatalogServiceTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "bunker-global-catalog-" + Guid.NewGuid().ToString("N"));

    public GlobalContentCatalogServiceTests() => Directory.CreateDirectory(_root);

    [Fact]
    public void CapabilityIsSeparateAndPlayerHostNeverReceivesIt()
    {
        Assert.False(GmCapabilities.Allows(GmMode.PlayerHost, GmCapability.ManageGlobalContent));
        Assert.True(GmCapabilities.Allows(GmMode.PlayerHost, GmCapability.ManagePublicGameState));
        Assert.True(GmCapabilities.Allows(GmMode.TechnicalGm, GmCapability.ManageGlobalContent));
    }

    [Fact]
    public void ProductionIsDisabledEvenWhenFlagIsTrue()
    {
        var policy = Policy(Environments.Production, enabled: true);
        Assert.False(policy.FeatureEnabled);
        Assert.False(policy.CanAccess(GmMode.TechnicalGm));
        Assert.Equal("production_disabled", policy.GetAccess(GmMode.TechnicalGm).Reason);
    }

    [Fact]
    public void DevelopmentRequiresExplicitFlagAndTechnicalCapability()
    {
        Assert.False(Policy(Environments.Development, false).CanAccess(GmMode.TechnicalGm));
        Assert.False(Policy(Environments.Development, true).CanAccess(GmMode.PlayerHost));
        Assert.True(Policy(Environments.Development, true).CanAccess(GmMode.TechnicalGm));
    }

    [Fact]
    public void DevelopmentBootstrapRequiresExplicitLongKeyAndNeverWorksInProduction()
    {
        const string key = "test-bootstrap-key-1234";
        Assert.False(Policy(Environments.Production, true, key).ValidateDevelopmentBootstrap(key));
        Assert.False(Policy(Environments.Development, true, key).ValidateDevelopmentBootstrap("wrong"));
        Assert.True(Policy(Environments.Development, true, key).ValidateDevelopmentBootstrap(key));
    }

    [Theory]
    [InlineData("unknown")]
    [InlineData("../appsettings")]
    [InlineData("C:\\secrets.json")]
    public void UnsupportedCategoryAndPathsAreBlocked(string category)
    {
        var error = Assert.Throws<GlobalContentRequestException>(() => Service().GetMetadata(category));
        Assert.Equal("unsupported_category", error.Code);
    }

    [Fact]
    public void PaginationAndSearchBoundsAreEnforced()
    {
        WriteProfessions("""{"professions":[{"id":"p1","profession":"Doctor"}]}""");
        var service = Service();
        Assert.Equal("invalid_page", Assert.Throws<GlobalContentRequestException>(() => service.GetEntries("professions", 0, 10, "")).Code);
        Assert.Equal("invalid_page_size", Assert.Throws<GlobalContentRequestException>(() => service.GetEntries("professions", 1, 101, "")).Code);
        Assert.Equal("search_too_long", Assert.Throws<GlobalContentRequestException>(() => service.GetEntries("professions", 1, 10, new string('x', 101))).Code);
    }

    [Fact]
    public void MetadataIsSafeAndInvalidJsonReturnsValidationStatus()
    {
        WriteProfessions("not-json");
        var metadata = Service().GetMetadata("professions");
        Assert.Equal("invalid_json", metadata.SchemaStatus);
        var json = JsonSerializer.Serialize(metadata);
        Assert.DoesNotContain(_root, json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Path", json, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(GlobalContentEditableReadiness.BlockedSchemaUnknown, metadata.EditableReadiness);
    }

    [Fact]
    public void DuplicateAndMissingIdsAreDetectedWithoutMutation()
    {
        var original = """{"professions":[{"id":"same","profession":"A"},{"id":"same","profession":"B"},{"profession":"C"}]}""";
        WriteProfessions(original);
        var path = Path.Combine(_root, "professions.json");
        var timestamp = File.GetLastWriteTimeUtc(path);

        var metadata = Service().GetMetadata("professions");

        Assert.StartsWith("Missing:", metadata.StableIdStatus);
        Assert.Equal(GlobalContentEditableReadiness.BlockedMissingStableIds, metadata.EditableReadiness);
        Assert.Equal(original, File.ReadAllText(path));
        Assert.Equal(timestamp, File.GetLastWriteTimeUtc(path));
    }

    [Fact]
    public void DuplicateIdsAreReportedWhenNoIdsAreMissing()
    {
        WriteProfessions("""{"professions":[{"id":"same","profession":"A"},{"id":"same","profession":"B"}]}""");
        Assert.Equal("Duplicates:1", Service().GetMetadata("professions").StableIdStatus);
    }

    [Fact]
    public void ReadOnlyPageSearchAndDetailsUseStableId()
    {
        WriteProfessions("""{"professions":[{"id":"p1","profession":"Doctor","description":"Medical"},{"id":"p2","profession":"Engineer"}]}""");
        var service = Service();
        var page = service.GetEntries("professions", 1, 25, "doctor");
        Assert.Single(page.Entries);
        Assert.Equal("p1", page.Entries[0].StableId);
        Assert.Equal("Doctor", service.GetEntry("professions", "p1").DisplayName);
    }

    [Fact]
    public void RateLimitIsPerClientAndBounded()
    {
        var service = Service();
        for (var i = 0; i < 30; i++) Assert.True(service.TryConsumeRead("client"));
        Assert.False(service.TryConsumeRead("client"));
        Assert.True(service.TryConsumeRead("other"));
    }

    private GlobalContentCatalogService Service() => new(_root);
    private void WriteProfessions(string json) => File.WriteAllText(Path.Combine(_root, "professions.json"), json);
    private static GlobalContentAccessPolicy Policy(string environment, bool enabled, string bootstrapKey = "") =>
        new(new TestEnvironment { EnvironmentName = environment }, Options.Create(new GlobalContentCatalogOptions { Enabled = enabled, DevelopmentBootstrapKey = bootstrapKey }));

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "Tests";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
