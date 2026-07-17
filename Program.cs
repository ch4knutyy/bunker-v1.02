using Bunker.Hubs;
using Bunker.Hubs.GameHunSpy;
using Bunker.Models;
using Bunker.Services;
using Bunker.Services.Threats;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

builder.Services.AddControllersWithViews();
builder.Services.AddSignalR(options =>
{
	options.EnableDetailedErrors = true;
});

builder.Services.AddSingleton<GameDataService>();
builder.Services.AddSingleton<CharacterGeneratorService>();
builder.Services.AddSingleton<PlayerStorageService>();
builder.Services.AddSingleton<RoomService>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<GameTimerService>();
builder.Services.AddHostedService<GameTimerExpiryService>();
builder.Services.AddSingleton<SpyRoomService>();
builder.Services.AddSingleton<ScenarioImageService>();
builder.Services.AddSingleton<ThreatScalingService>();
builder.Services.AddSingleton<ThreatAuditService>();
builder.Services.AddSingleton<GmAuditService>();
builder.Services.AddSingleton<RoomIntegrityService>();
builder.Services.AddSingleton<RoomSnapshotService>();
builder.Services.AddSingleton<RoomLocalEditorService>();
builder.Services.Configure<GlobalContentCatalogOptions>(builder.Configuration.GetSection(GlobalContentCatalogOptions.SectionName));
builder.Services.AddSingleton<GlobalContentAccessPolicy>();
builder.Services.AddSingleton<GlobalContentCatalogService>();
builder.Services.AddSingleton<GlobalContentDraftService>();
builder.Services.AddSingleton<GlobalContentCommitService>();
builder.Services.AddSingleton<StableIdMigrationService>();
builder.Services.Configure<OmniscientGmOptions>(builder.Configuration.GetSection(OmniscientGmOptions.SectionName));
builder.Services.AddSingleton<OmniscientGmAccessPolicy>();
builder.Services.AddSingleton<OmniscientGmRoleService>();
builder.Services.AddSingleton<OmniscientHiddenStateService>();
builder.Services.AddSingleton<OmniscientRequestRateLimitService>();
builder.Services.AddSingleton<DirectorControlService>();
builder.Services.AddSingleton<LobbyStartService>();
builder.Services.AddSingleton<RoomGameSettingsService>();
builder.Services.AddSingleton<IThreatMiniGameService, RadiationLeakMiniGameService>();
builder.Services.AddSingleton<ThreatMiniGameRegistry>();

var app = builder.Build();

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();

app.MapControllerRoute(
	name: "default",
	pattern: "{controller=Home}/{action=Index}/{id?}");

app.MapHub<GameHub>("/gameHub");
app.MapHub<SpyHub>("/spyHub");

app.Run();

