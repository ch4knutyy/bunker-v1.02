using Bunker;
using Bunker.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();
builder.Services.AddSignalR();

builder.Services.AddSingleton<GameDataService>();
builder.Services.AddSingleton<CharacterGeneratorService>();
builder.Services.AddSingleton<PlayerStorageService>();
builder.Services.AddSingleton<RoomService>();
builder.Services.AddSingleton<CardService>();
builder.Services.AddSingleton<ScenarioImageService>();

var app = builder.Build();

app.UseStaticFiles();
app.UseRouting();

app.MapControllerRoute(
	name: "default",
	pattern: "{controller=Home}/{action=Index}/{id?}");

app.MapHub<GameHub>("/gameHub");

app.Run();