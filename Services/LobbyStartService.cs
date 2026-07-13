using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Bunker.Models;

namespace Bunker.Services;

public sealed class LobbyStartService(TimeProvider time)
{
    public const int MinimumGameplayPlayers = 2;
    private sealed record Ticket(string RoomId, string HostPlayerId, long Version, string Fingerprint, DateTimeOffset ExpiresAtUtc, bool CanStart);
    private sealed record VersionStamp(string Fingerprint, long Version);
    private readonly ConcurrentDictionary<string, Ticket> _tickets = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, VersionStamp> _versions = new(StringComparer.OrdinalIgnoreCase);

    public LobbyStateDto GetState(Room room)
    {
        var members = RoomService.GetPlayersSnapshot(room).Select(entry => BuildMember(room, entry.Value)).ToList();
        var blockers = Validate(room, members);
        return new(Lifecycle(room), members.Count(x => x.IsGameplayParticipant), members.Count(x => x.IsSpectator),
            members.Count(x => x.IsTechnicalGm), members.Count(x => x.IsOmniscientGm), members.Count(x => x.IsReady),
            members.Count(x => x.IsConnected), blockers.Count == 0, blockers, Version(room), time.GetUtcNow(), members);
    }

    public LobbyStartPreviewDto Preview(Room room, Player host)
    {
        var state = GetState(room); var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant(); var expiry = time.GetUtcNow().AddSeconds(30);
        _tickets[token] = new(room.Id, RoomService.GetPlayerKey(host), state.StateVersion, Fingerprint(room), expiry, state.CanStart);
        return new(state.GameplayPlayerCount, state.SpectatorCount, state.TechnicalGmCount, state.OmniscientGmCount,
            state.Members.Where(x => x.IsConnected && !x.IsReady).Select(x => x.DisplayName).ToList(),
            state.Members.Where(x => !x.IsConnected).Select(x => x.DisplayName).ToList(), state.Blockers, state.CanStart,
            state.StateVersion, token, expiry);
    }

    public bool TryConsume(Room room, Player host, string token, out string? error)
    {
        error = null;
        if (!_tickets.TryRemove(token, out var ticket) || ticket.ExpiresAtUtc < time.GetUtcNow()) { error = "lobby_preview_expired"; return false; }
        var state = GetState(room);
        if (!ticket.CanStart || !state.CanStart || ticket.RoomId != room.Id || ticket.HostPlayerId != RoomService.GetPlayerKey(host) ||
            ticket.Version != state.StateVersion || ticket.Fingerprint != Fingerprint(room)) { error = "lobby_preview_stale"; return false; }
        return true;
    }

    public static LobbyMemberDto BuildMember(Room room, Player player)
    {
        var gameplay = RoomService.IsGameplayParticipant(player); var omni = player.IsSpectatorGm && player.GmRole == GmMode.OmniscientGm;
        var technical = player.GmRole == GmMode.TechnicalGm; var spectator = !gameplay;
        var role = omni ? "OmniscientGm" : technical ? "TechnicalGm" : gameplay && room.IsHost(player) ? "HostPlayer" : gameplay ? "Player" : "Spectator";
        return new(RoomService.GetPlayerKey(player), player.Name, role, room.IsHost(player), gameplay, spectator, technical, omni,
            player.IsLobbyReady, player.IsConnected, null);
    }

    public static string Lifecycle(Room room) => room.State switch { RoomState.Lobby or RoomState.Waiting => "Lobby", RoomState.Finished => "Finished", _ => "Running" };
    public long Version(Room room)
    {
        var fingerprint = Fingerprint(room);
        return _versions.AddOrUpdate(room.Id, _ => new(fingerprint, 1), (_, current) =>
            current.Fingerprint == fingerprint ? current : new(fingerprint, current.Version + 1)).Version;
    }
    private static List<string> Validate(Room room, IReadOnlyList<LobbyMemberDto> members)
    {
        var blockers = new List<string>();
        if (room.State != RoomState.Lobby) blockers.Add("lifecycle_not_lobby");
        if (string.IsNullOrWhiteSpace(room.HostPlayerId) || !members.Any(x => x.PlayerId == room.HostPlayerId)) blockers.Add("host_missing");
        if (members.Count(x => x.IsGameplayParticipant) < MinimumGameplayPlayers) blockers.Add("minimum_gameplay_players");
        if (members.Any(x => x.IsConnected && !x.IsReady)) blockers.Add("connected_members_not_ready");
        if (room.CurrentVoting?.State is VotingState.Active or VotingState.Completed) blockers.Add("active_voting");
        if (room.CurrentThreat != null && room.ThreatState != null && room.ThreatState.ThreatStatus is not ("aborted" or "resolved_safely" or "resolved_with_casualty" or "failed" or "completed")) blockers.Add("active_threat");
        foreach (var player in RoomService.GetPlayersSnapshot(room).Select(x => x.Value).Where(x => x.IsSpectatorGm))
            if (!room.IrreversibleOmniscientPlayerIds.Contains(RoomService.GetPlayerKey(player))) blockers.Add("invalid_omniscient_boundary");
        return blockers.Distinct().ToList();
    }
    private static string Fingerprint(Room room) => string.Join('|', room.Id, room.State, room.HostPlayerId,
        room.CurrentVoting?.Id, room.ThreatState?.ThreatStatus, string.Join(';', RoomService.GetPlayersSnapshot(room)
            .OrderBy(x => RoomService.GetPlayerKey(x.Value)).Select(x => $"{RoomService.GetPlayerKey(x.Value)}:{x.Value.IsConnected}:{x.Value.IsLobbyReady}:{x.Value.IsLobbySpectator}:{x.Value.GmRole}:{x.Value.IsSpectatorGm}")));
}
