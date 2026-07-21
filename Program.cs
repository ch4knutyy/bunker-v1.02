using Bunker.Data.Persistence;
using Bunker.Data.Persistence.Identity;
using Bunker.Hubs;
using Bunker.Hubs.GameHunSpy;
using Bunker.Models;
using Bunker.Services;
using Bunker.Services.Bunker.GameSessions;
using Bunker.Services.OwnerContent;
using Bunker.Services.Profile;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var processStartedAtUtc = DateTime.UtcNow;
var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

builder.Services.AddControllersWithViews();

builder.Services.Configure<OwnerAccessOptions>(
	builder.Configuration.GetSection(OwnerAccessOptions.SectionName));

builder.Services.Configure<ContentEditorOptions>(
	builder.Configuration.GetSection(ContentEditorOptions.SectionName));

builder.Services.AddAuthorization(options =>
{
	options.AddPolicy("OwnerOnly", policy =>
	{
		policy.RequireAuthenticatedUser();
		policy.AddRequirements(new OwnerOnlyRequirement());
	});
});

builder.Services.AddSingleton<IAuthorizationHandler, OwnerOnlyAuthorizationHandler>();
builder.Services.AddSingleton<IContentDocumentRegistry, ContentDocumentRegistry>();
builder.Services.AddSingleton<IContentDocumentValidator, GenericContentDocumentValidator>();
builder.Services.AddSingleton<ContentFileLockManager>();
builder.Services.AddSingleton<ContentEditorCommandRegistry>();
builder.Services.AddSingleton<ContentDocumentServiceFaults>();
builder.Services.AddSingleton<IContentReloadCoordinator, ContentReloadCoordinator>();
builder.Services.AddSingleton<IContentDocumentService, ContentDocumentService>();

builder.Services.AddSignalR(options =>
{
	options.EnableDetailedErrors = builder.Environment.IsDevelopment();
});

builder.Services.AddSingleton<GameDataService>();
builder.Services.AddSingleton<ApocalypseSelectionService>();
builder.Services.AddSingleton<ApocalypseActivationPolicyResolver>();
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
builder.Services.AddSingleton<GmPanelStateBuilder>();
builder.Services.AddSingleton<PlayerDisconnectCleanupCoordinator>();
builder.Services.AddSingleton<RoomIntegrityService>();
builder.Services.AddSingleton<RoomSnapshotService>();

builder.Services.Configure<RoomRecoveryOptions>(
	builder.Configuration.GetSection(RoomRecoveryOptions.SectionName));

builder.Services.AddSingleton<RoomRecoveryCaptureService>();
builder.Services.AddSingleton<IRoomRecoverySnapshotStore, RoomRecoverySnapshotStore>();
builder.Services.AddSingleton<RoomRecoveryCoordinator>();
builder.Services.AddSingleton<IRoomRecoveryCoordinator>(services =>
	services.GetRequiredService<RoomRecoveryCoordinator>());
builder.Services.AddHostedService(services =>
	services.GetRequiredService<RoomRecoveryCoordinator>());

builder.Services.AddSingleton<RoomLocalEditorService>();
builder.Services.AddSingleton<BunkerResourceService>();
builder.Services.AddSingleton<IScenarioContentRegistry, ScenarioContentRegistry>();
builder.Services.AddSingleton<ScenarioSchedulerService>();
builder.Services.AddSingleton<BunkerIntelService>();
builder.Services.AddSingleton<EventSpecialCardService>();
builder.Services.AddSingleton<ScenarioRunnerService>();

builder.Services.Configure<GlobalContentCatalogOptions>(
	builder.Configuration.GetSection(GlobalContentCatalogOptions.SectionName));

builder.Services.AddSingleton<GlobalContentAccessPolicy>();
builder.Services.AddSingleton<GlobalContentCatalogService>();
builder.Services.AddSingleton<GlobalContentDraftService>();
builder.Services.AddSingleton<GlobalContentCommitService>();
builder.Services.AddSingleton<StableIdMigrationService>();

builder.Services.Configure<OmniscientGmOptions>(
	builder.Configuration.GetSection(OmniscientGmOptions.SectionName));

builder.Services.AddSingleton<OmniscientGmAccessPolicy>();
builder.Services.AddSingleton<OmniscientGmRoleService>();
builder.Services.AddSingleton<OmniscientHiddenStateService>();
builder.Services.AddSingleton<OmniscientRequestRateLimitService>();
builder.Services.AddSingleton<DirectorControlService>();
builder.Services.AddSingleton<LobbyStartService>();
builder.Services.AddSingleton<RoomGameSettingsService>();
builder.Services.AddSingleton<IThreatMiniGameService, RadiationLeakMiniGameService>();
builder.Services.AddSingleton<ThreatMiniGameRegistry>();

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
	?? throw new InvalidOperationException(
		"Connection string 'DefaultConnection' not found.");

builder.Services.AddDbContext<BunkerDbContext>(options =>
	options.UseSqlite(connectionString));

builder.Services
	.AddIdentity<ApplicationUser, IdentityRole<Guid>>(options =>
	{
		options.User.RequireUniqueEmail = true;

		options.Password.RequiredLength = 8;
		options.Password.RequireDigit = true;
		options.Password.RequireLowercase = true;
		options.Password.RequireUppercase = true;
		options.Password.RequireNonAlphanumeric = false;

		options.Lockout.AllowedForNewUsers = true;
		options.Lockout.MaxFailedAccessAttempts = 5;
		options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);

		options.SignIn.RequireConfirmedAccount = false;
		options.SignIn.RequireConfirmedEmail = false;
	})
	.AddEntityFrameworkStores<BunkerDbContext>()
	.AddDefaultTokenProviders();

builder.Services.ConfigureApplicationCookie(options =>
{
	options.Cookie.Name = "Bunker.Identity";
	options.Cookie.HttpOnly = true;
	options.Cookie.SameSite = SameSiteMode.Lax;
	options.Cookie.SecurePolicy = CookieSecurePolicy.Always;

	options.SlidingExpiration = true;
	options.ExpireTimeSpan = TimeSpan.FromDays(14);

	options.LoginPath = "/account/login";
	options.AccessDeniedPath = "/account/access-denied";
});

builder.Services.AddAntiforgery(options =>
{
	options.Cookie.Name = "Bunker.Antiforgery";
	options.Cookie.HttpOnly = true;
	options.Cookie.SameSite = SameSiteMode.Strict;
	options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
});

builder.Services.AddScoped<IGameSessionHistoryService, GameSessionHistoryService>();
builder.Services.AddScoped<IProfileGameHistoryService, ProfileGameHistoryService>();

var app = builder.Build();

// Fail fast before the server starts accepting requests.
_ = app.Services.GetRequiredService<IScenarioContentRegistry>();

using (var scope = app.Services.CreateScope())
{
	await scope.ServiceProvider.GetRequiredService<BunkerDbContext>()
		.Database.MigrateAsync();

	await scope.ServiceProvider.GetRequiredService<IGameSessionHistoryService>()
		.AbandonStartedSessionsAsync(
			processStartedAtUtc,
			"startup_recovery");
}

if (!app.Environment.IsDevelopment())
{
	app.UseExceptionHandler("/Home/Error");
	app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(
	name: "default",
	pattern: "{controller=Home}/{action=Index}/{id?}");

app.MapHub<GameHub>("/gameHub");
app.MapHub<SpyHub>("/spyHub");

app.Run();
