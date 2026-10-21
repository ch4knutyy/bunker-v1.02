using Bunker.Data.Persistence;
using Bunker.Data.Persistence.Identity;
using Bunker.Hubs;
using Bunker.Hubs.GameHunSpy;
using Bunker.Models;
using Bunker.Services;
using Bunker.Services.Bunker.GameSessions;
using Bunker.Services.OwnerContent;
using Bunker.Services.Profile;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.HttpOverrides;
using Bunker.Services.PrivateAlpha;
using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var processStartedAtUtc = DateTime.UtcNow;
var builder = WebApplication.CreateBuilder(args);

// Keep local secrets outside Git in every environment, including Production.
// Environment variables take final precedence for future VPS deployment.
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false)
    .AddUserSecrets<Program>(optional: true)
    .AddEnvironmentVariables();
var privateAlphaConfiguration = builder.Configuration.GetSection(PrivateAlphaOptions.SectionName)
    .Get<PrivateAlphaOptions>() ?? new PrivateAlphaOptions();
privateAlphaConfiguration.ValidateForStartup();

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

builder.Services.AddControllersWithViews();
builder.Services.Configure<PrivateAlphaOptions>(builder.Configuration.GetSection(PrivateAlphaOptions.SectionName));

builder.Services.Configure<OwnerAccessOptions>(
	builder.Configuration.GetSection(OwnerAccessOptions.SectionName));
builder.Services.Configure<DeveloperAuthorityOptions>(
	builder.Configuration.GetSection(DeveloperAuthorityOptions.SectionName));

builder.Services.Configure<ContentEditorOptions>(
	builder.Configuration.GetSection(ContentEditorOptions.SectionName));

builder.Services.AddAuthorization(options =>
{
	options.AddPolicy("OwnerOnly", policy =>
	{
		policy.RequireAuthenticatedUser();
		policy.AddRequirements(new OwnerOnlyRequirement());
	});
	options.AddPolicy("DeveloperOnly", policy =>
	{
		policy.RequireAuthenticatedUser();
		policy.AddRequirements(new DeveloperOnlyRequirement());
	});
});

builder.Services.AddSingleton<IAuthorizationHandler, OwnerOnlyAuthorizationHandler>();
builder.Services.AddSingleton<IAuthorizationHandler, DeveloperOnlyAuthorizationHandler>();
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
builder.Services.AddSingleton<IApocalypseRandom, SystemApocalypseRandom>();
builder.Services.AddSingleton<ApocalypseEffectHandlerRegistry>();
builder.Services.AddSingleton<ApocalypseEffectEngine>();
builder.Services.AddSingleton<ApocalypseActivationScheduler>();
builder.Services.AddSingleton<CharacterGeneratorService>();
builder.Services.AddSingleton<PlayerStorageService>();
builder.Services.AddSingleton<RoomService>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<GameTimerService>();
builder.Services.AddHostedService<GameTimerExpiryService>();
builder.Services.AddSingleton<SpyRoomService>();
builder.Services.AddHostedService<SpyTimerExpiryService>();
builder.Services.AddSingleton<ScenarioImageService>();
builder.Services.AddSingleton<GmAuditService>();
builder.Services.AddSingleton<GmPanelStateBuilder>();
builder.Services.AddSingleton<CatalogItemService>();
builder.Services.AddSingleton<PlayerDisconnectCleanupCoordinator>();
builder.Services.AddSingleton<RoomIntegrityService>();
builder.Services.AddSingleton<RoomSnapshotService>();
builder.Services.AddSingleton<DeveloperAuthorityService>();
builder.Services.AddSingleton<PostGameStoryPromptBuilder>();
builder.Services.AddSingleton<PostGameStoryResultParser>();
builder.Services.AddSingleton<PostGameStoryService>();

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
builder.Services.AddSingleton<CharacterRevealService>();
builder.Services.AddSingleton<CharacterRevealSynchronizationService>();
builder.Services.Configure<AiChatOptions>(builder.Configuration.GetSection(AiChatOptions.SectionName));
builder.Services.Configure<AiTrainingArenaOptions>(builder.Configuration.GetSection(AiTrainingArenaOptions.SectionName));
builder.Services.Configure<AiTrainingLlmEditorOptions>(builder.Configuration.GetSection(AiTrainingLlmEditorOptions.SectionName));
builder.Services.Configure<AiTokenCostOptions>(builder.Configuration.GetSection("AiTokenCost"));
builder.Services.AddHttpClient<IGeminiAiProvider, GeminiAiProvider>(client => client.BaseAddress = new Uri("https://generativelanguage.googleapis.com/"));
builder.Services.AddHttpClient(nameof(OpenAiInputTokenCounter));
builder.Services.AddHttpClient(nameof(LocalMamayLmProvider));
builder.Services.AddHttpClient(nameof(AiTrainingLlmEditorService));
builder.Services.AddSingleton<GroqAiProvider>();
builder.Services.AddSingleton<OpenRouterAiProvider>();
builder.Services.AddSingleton<ILocalMamayLmProvider, LocalMamayLmProvider>();
builder.Services.AddSingleton<AiProviderManagementService>();
builder.Services.AddSingleton<AiTokenCostEstimator>();
builder.Services.AddSingleton<OpenAiInputTokenCounter>();
builder.Services.AddSingleton<IAiProvider, AiProviderRouter>();
builder.Services.AddSingleton<RoomChatService>();
  builder.Services.AddSingleton<AiProviderRateLimitService>();
builder.Services.AddSingleton<AiParticipantService>();
builder.Services.AddSingleton<AiWorldContextService>();
builder.Services.AddSingleton<AiChatContextBuilder>();
  builder.Services.AddSingleton<AiSynergyEvaluator>();
  builder.Services.AddSingleton<AiPresentationCharacteristicSelector>();
builder.Services.AddSingleton<AiConversationCoordinator>();
builder.Services.AddSingleton<AiPresentationCoordinator>();
builder.Services.AddSingleton<AiTrainingDatasetStore>();
builder.Services.AddSingleton<AiTrainingLlmEditorService>();
builder.Services.AddHostedService<AiTrainingLlmEditorService>(provider => provider.GetRequiredService<AiTrainingLlmEditorService>());
builder.Services.AddSingleton<AiTrainingArenaService>();

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

// This scheme is separate from the existing Bunker.Identity player accounts.
builder.Services.AddAuthentication()
    .AddCookie(PrivateAlphaOptions.AuthenticationScheme, options =>
    {
        options.Cookie.Name = "Bunker.PrivateAlpha";
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromDays(7);
        options.SlidingExpiration = true;
        options.LoginPath = "/alpha-access";
    });

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("private-alpha-login", context =>
    {
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        // Cloudflare's header is trusted only when the origin connection is local.
        // Keep Kestrel bound to loopback when using Cloudflare Tunnel.
        if (context.Connection.RemoteIpAddress is { } remote && IPAddress.IsLoopback(remote) &&
            IPAddress.TryParse(context.Request.Headers["CF-Connecting-IP"].ToString(), out var cloudflareIp))
            ip = cloudflareIp.ToString();

        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 8,
            Window = TimeSpan.FromMinutes(15),
            QueueLimit = 0,
            AutoReplenishment = true
        });
    });
});

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

var aiTokenCostOptions = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<AiTokenCostOptions>>().Value;
var groqConfigured = app.Services.GetRequiredService<AiProviderManagementService>().HasApiKey("Groq");
app.Logger.LogInformation("AI startup configuration: AiTokenCostDryRun={DryRun}; Environment={Environment}; GroqConfigured={GroqConfigured}",
	aiTokenCostOptions.DryRun, app.Environment.EnvironmentName, groqConfigured);

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

app.UseForwardedHeaders(new ForwardedHeadersOptions
{
	ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

if (!app.Environment.IsDevelopment())
{
	app.UseExceptionHandler("/Home/Error");
	app.UseHsts();
}

app.UseHttpsRedirection();
// Run before static files, routing, MVC actions and both SignalR hubs.
app.UseMiddleware<PrivateAlphaGateMiddleware>();
app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(
	name: "default",
	pattern: "{controller=Home}/{action=Index}/{id?}");

app.MapHub<GameHub>("/gameHub");
app.MapHub<SpyHub>("/spyHub");
app.MapHub<AiTrainingArenaHub>("/aiArenaHub").RequireAuthorization("DeveloperOnly");

app.Run();
