using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Bunker.Services;

namespace Bunker.Hubs;

[Authorize(Policy = "DeveloperOnly")]
public sealed class AiTrainingArenaHub(AiTrainingArenaService arenas) : Hub
{
    public Task<IReadOnlyList<object>> ListArenas() => Task.FromResult(arenas.List());
    public Task<object> GetArenaConfiguration() => Task.FromResult(arenas.Configuration());
    public Task<object> CheckArenaProvider() => arenas.CheckProviderAsync(Context.ConnectionAborted);

    public async Task<object> CreateArena(AiTrainingArenaRequest? request = null)
    {
        var arena = await arenas.CreateAsync(request, Context.ConnectionAborted);
        await Groups.AddToGroupAsync(Context.ConnectionId, arena.Id, Context.ConnectionAborted);
        return arenas.View(arena.Id, null);
    }

    public async Task<object> WatchArena(string arenaId, string? selectedAgentId = null)
    {
        var view = arenas.View(arenaId, selectedAgentId);
        await Groups.AddToGroupAsync(Context.ConnectionId, arenaId, Context.ConnectionAborted);
        return view;
    }

    public Task<object> StartArena(string arenaId) => arenas.StartAsync(arenaId, Context.ConnectionAborted);
    public Task<object> PauseArena(string arenaId) => arenas.PauseAsync(arenaId, Context.ConnectionAborted);
    public Task<object> ResumeArena(string arenaId) => arenas.ResumeAsync(arenaId, Context.ConnectionAborted);
    public Task<object> StepArena(string arenaId) => arenas.StepAsync(arenaId, Context.ConnectionAborted);
    public Task<object> CancelArena(string arenaId) => arenas.CancelAsync(arenaId, Context.ConnectionAborted);
}
