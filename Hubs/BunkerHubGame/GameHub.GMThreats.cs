using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public async Task GetGMThreatControlData()
    {
        if (!TryGetHostRoom(out var room)) return;
        await Clients.Caller.SendAsync("GMThreatControlData", BuildGMThreatControlData(room));
    }

    public async Task GMGenerateRandomRareThreat(string commandId, bool confirmedReplace)
    {
        if (!TryGetHostRoom(out var room) || !await CanRunThreatReplacement(room, commandId, confirmedReplace)) return;
        var rare = _gameData.Threats.Where(IsAvailableSpecialThreat).ToList();
        if (rare.Count == 0)
        {
            await Clients.Caller.SendAsync("ReceiveError", "Немає доступних рідкісних загроз");
            return;
        }
        await ReplaceThreatForGM(room, rare[_random.Next(rare.Count)], commandId, "Випадкову рідкісну загрозу запущено");
    }

    public async Task GMGenerateTextThreat(string commandId, bool confirmedReplace)
    {
        if (!TryGetHostRoom(out var room) || !await CanRunThreatReplacement(room, commandId, confirmedReplace)) return;
        var selected = new ThreatPoolSelector().Select(
            _gameData.Threats,
            _ => false,
            _random.Next,
            _gameData.Threats.FirstOrDefault() ?? new ThreatData { Id = "fallback_threat", Name = "Невідома загроза" });
        if (IsExplicitSpecialThreat(selected))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Немає доступних текстових загроз");
            return;
        }
        await ReplaceThreatForGM(room, selected, commandId, "Випадкову текстову загрозу запущено");
    }

    public async Task GMSelectThreat(string threatId, string commandId, bool confirmedReplace)
    {
        if (!TryGetHostRoom(out var room) || !await CanRunThreatReplacement(room, commandId, confirmedReplace)) return;
        var threat = _gameData.Threats.FirstOrDefault(item => string.Equals(item.Id, threatId, StringComparison.OrdinalIgnoreCase));
        if (threat == null || (IsExplicitSpecialThreat(threat) && !IsAvailableSpecialThreat(threat)))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Загрозу не знайдено або її механіка недоступна");
            return;
        }
        await ReplaceThreatForGM(room, threat, commandId, "Обрану загрозу запущено");
    }

    public async Task GMCancelCurrentThreat(string commandId, bool confirmed)
    {
        if (!TryGetHostRoom(out var room) || !await CanRunThreatReplacement(room, commandId, confirmed)) return;
        if (!TryRememberThreatCommand(room, commandId)) { await SyncThreatRoom(room); return; }
        GMThreatStateMutator.Cancel(room);
        await SyncThreatRoom(room, "Поточну загрозу скасовано без наслідків");
    }

    public async Task GMRestartCurrentThreat(string commandId, bool confirmed)
    {
        if (!TryGetHostRoom(out var room) || room.CurrentThreat == null) return;
        if (room.ThreatState?.Resolution.EffectsApplied == true)
        {
            await Clients.Caller.SendAsync("ReceiveError", "Не можна перезапустити загрозу з уже застосованими наслідками");
            return;
        }
        if (!await CanRunThreatReplacement(room, commandId, confirmed)) return;
        if (!TryRememberThreatCommand(room, commandId)) { await SyncThreatRoom(room); return; }
        GMThreatStateMutator.Restart(room);
        EnsureRadiationThreatState(room);
        await SyncThreatRoom(room, "Стан поточної загрози перезапущено");
    }

    public async Task GMResyncThreatRoom()
    {
        if (!TryGetHostRoom(out var room)) return;
        await SyncThreatRoom(room, "Кімнату синхронізовано");
    }

    private bool TryGetHostRoom(out Room room)
    {
        room = _roomService.GetPlayerRoom(Context.ConnectionId)!;
        return room != null && IsCallerHost();
    }

    private async Task<bool> CanRunThreatReplacement(Room room, string commandId, bool confirmed)
    {
        if (string.IsNullOrWhiteSpace(commandId))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Некоректний ідентифікатор GM-команди");
            return false;
        }
        if (room.ProcessedGmThreatCommandIds.Contains(commandId)) return true;
        var unfinished = room.CurrentThreat != null && room.ThreatState?.Resolution.EffectsApplied != true;
        if (unfinished && !confirmed)
        {
            await Clients.Caller.SendAsync("ReceiveError", "Потрібне подвійне підтвердження заміни активної загрози");
            return false;
        }
        return true;
    }

    private async Task ReplaceThreatForGM(Room room, ThreatData source, string commandId, string message)
    {
        if (!TryRememberThreatCommand(room, commandId)) { await SyncThreatRoom(room); return; }
        GMThreatStateMutator.Replace(room, CloneThreatData(source), IsExplicitSpecialThreat(source) ? "collecting_contributions" : "revealed");
        EnsureRadiationThreatState(room);
        await SyncThreatRoom(room, message);
    }

    private bool TryRememberThreatCommand(Room room, string commandId)
    {
        return GMThreatStateMutator.TryRememberCommand(room, commandId);
    }

    private async Task SyncThreatRoom(Room room, string? message = null)
    {
        var roundState = BuildRoundState(room);
        await Clients.Group(room.Id).SendAsync("RoundStateUpdated", roundState);
        await BroadcastThreatState(room, room.Id);
        await Clients.Caller.SendAsync("GMThreatControlData", BuildGMThreatControlData(room));
        if (!string.IsNullOrWhiteSpace(message))
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = message });
    }

    private object BuildGMThreatControlData(Room room) => new
    {
        currentThreat = room.CurrentThreat == null ? null : new
        {
            room.CurrentThreat.Id,
            room.CurrentThreat.Name,
            type = GetThreatControlType(room.CurrentThreat),
            status = room.ThreatState?.ThreatStatus ?? "none",
            effectsApplied = room.ThreatState?.Resolution.EffectsApplied ?? false
        },
        threats = _gameData.Threats.Where(item => !string.IsNullOrWhiteSpace(item.Id) && !string.IsNullOrWhiteSpace(item.Name))
            .Select(item => new { item.Id, item.Name, type = GetThreatControlType(item), available = !IsExplicitSpecialThreat(item) || IsAvailableSpecialThreat(item) })
            .OrderBy(item => item.Name).ToList()
    };

    private bool IsAvailableSpecialThreat(ThreatData threat) =>
        string.Equals(threat.Id, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase)
            ? _threatMiniGames.TryGet(RadiationLeakThreatId, out _)
            : string.Equals(threat.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase) && IsPlanChoiceMechanics(threat.Mechanics);

    private static bool IsExplicitSpecialThreat(ThreatData threat) =>
        string.Equals(threat.Id, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(threat.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase);

    private string GetThreatControlType(ThreatData threat) =>
        string.Equals(threat.Id, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase) ? "team_operation" :
        string.Equals(threat.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase) && IsPlanChoiceMechanics(threat.Mechanics) ? "plan_choice" : "text";
}
