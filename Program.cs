using Bunker.Hubs;
using Bunker.Hubs.GameHunSpy;
using Bunker.Services;
using Bunker.Services.Threats;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

builder.Services.AddControllersWithViews();
builder.Services.AddSignalR();

builder.Services.AddSingleton<GameDataService>();
builder.Services.AddSingleton<CharacterGeneratorService>();
builder.Services.AddSingleton<PlayerStorageService>();
builder.Services.AddSingleton<RoomService>();
builder.Services.AddSingleton<SpyRoomService>();
builder.Services.AddSingleton<ScenarioImageService>();
builder.Services.AddSingleton<ThreatScalingService>();
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

