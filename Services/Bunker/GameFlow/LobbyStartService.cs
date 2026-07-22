using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Bunker.Models;

namespace Bunker.Services;

public sealed class LobbyStartService
{
    public const int MinimumGameplayPlayers = 2;
    private readonly TimeProvider time;
    private readonly RoomGameSettingsService settings;
    private readonly GmAuditService audit;
    private readonly DeveloperAuthorityService? developerAuthority;
    private sealed record Ticket(string RoomId, string HostPlayerId, long Version, string Fingerprint, DateTimeOffset ExpiresAtUtc, bool CanStart);
    private sealed record VersionStamp(string Fingerprint, long Version);
    private readonly ConcurrentDictionary<string, Ticket> _tickets = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, VersionStamp> _versions = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, long> _guestWarningRequests = new(StringComparer.OrdinalIgnoreCase);

    public LobbyStartService(TimeProvider time, RoomGameSettingsService? settings = null, GmAuditService? audit = null,
        DeveloperAuthorityService? developerAuthority = null)
    {
        this.time = time;
        this.audit = audit ?? new GmAuditService(time);
        this.settings = settings ?? new RoomGameSettingsService(this.audit);
        this.developerAuthority = developerAuthority;
    }

    public LobbyStateDto GetState(Room room)
    {
        var members = RoomService.GetPlayersSnapshot(room)
            .Select(entry => BuildMember(room, entry.Value, developerAuthority?.IsDeveloper(entry.Value) == true)).ToList();
        var blockers = Validate(room, members);
        var requiredMembers = members.Where(member => member.IsGameplayParticipant && member.IsConnected).ToList();
        var recentEvents = audit.GetRecent(room, 20)
            .Where(entry => entry.ActionType.StartsWith("lobby_", StringComparison.OrdinalIgnoreCase) || entry.ActionType == "game_started_from_lobby")
            .Select(entry => new LobbyAuditEventDto(entry.Id, entry.OccurredAtUtc, entry.ActionType, entry.Summary, entry.Result))
            .ToList();
        return new(Lifecycle(room), members.Count(x => x.IsGameplayParticipant), members.Count(x => x.IsSpectator),
            members.Count(x => x.IsTechnicalGm), members.Count(x => x.IsOmniscientGm), requiredMembers.Count(x => x.IsReady),
            members.Count(x => x.IsConnected), blockers.Count == 0, blockers, Version(room), time.GetUtcNow(), members,
            requiredMembers.Count, room.HasPassword, settings.ToDto(room), room.SettingsRevision, room.SettingsFrozen,
            settings.GetWarnings(room), recentEvents, room.GuestWarningRevision,
            _guestWarningRequests.GetValueOrDefault(room.Id));
    }

    public LobbyStartPreviewDto Preview(Room room, Player host)
    {
        var state = GetState(room); var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant(); var expiry = time.GetUtcNow().AddSeconds(30);
        _tickets[token] = new(room.Id, RoomService.GetPlayerKey(host), state.StateVersion, Fingerprint(room), expiry, state.CanStart);
        var preview = new LobbyStartPreviewDto(state.GameplayPlayerCount, state.SpectatorCount, state.TechnicalGmCount, state.OmniscientGmCount,
            state.Members.Where(x => x.IsGameplayParticipant && x.IsConnected && !x.IsReady).Select(x => x.DisplayName).ToList(),
            state.Members.Where(x => x.IsGameplayParticipant && !x.IsConnected).Select(x => x.DisplayName).ToList(), state.Blockers, state.CanStart,
            state.StateVersion, token, expiry, state.Members.Count(x => x.IsGameplayParticipant && !x.IsAccountBound));
        if (preview.CanStart) _guestWarningRequests[room.Id] = room.GuestWarningRevision;
        return preview;
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

    public static LobbyMemberDto BuildMember(Room room, Player player, bool isDeveloper = false)
    {
        var gameplay = RoomService.IsGameplayParticipant(player); var omni = player.IsSpectatorGm && player.GmRole == GmMode.OmniscientGm;
        var technical = player.GmRole == GmMode.TechnicalGm; var spectator = !gameplay;
        var role = omni ? "OmniscientGm" : technical ? "TechnicalGm" : gameplay && room.IsHost(player) ? "HostPlayer" : gameplay ? "Player" : "Spectator";
        return new(RoomService.GetPlayerKey(player), player.Name, role, room.IsHost(player), gameplay, spectator, technical, omni,
            player.IsLobbyReady, player.IsConnected, player.AccountUserId.HasValue, isDeveloper, null);
    }

    public static string Lifecycle(Room room) => room.State switch { RoomState.Lobby or RoomState.Waiting => "Lobby", RoomState.Finished => "Finished", _ => "Running" };
    public long Version(Room room)
    {
        var fingerprint = Fingerprint(room);
        return _versions.AddOrUpdate(room.Id, _ => new(fingerprint, 1), (_, current) =>
            current.Fingerprint == fingerprint ? current : new(fingerprint, current.Version + 1)).Version;
    }
    private List<string> Validate(Room room, IReadOnlyList<LobbyMemberDto> members)
    {
        var blockers = new List<string>();
        var gameSettings = settings.GetCanonical(room);
        if (room.State != RoomState.Lobby) blockers.Add("lifecycle_not_lobby");
        if (string.IsNullOrWhiteSpace(room.HostPlayerId) || !members.Any(x => x.PlayerId == room.HostPlayerId)) blockers.Add("host_missing");
        if (members.Count(x => x.IsGameplayParticipant) < gameSettings.MinGameplayPlayers) blockers.Add("minimum_gameplay_players");
        if (members.Count(x => x.IsGameplayParticipant) > gameSettings.MaxGameplayPlayers) blockers.Add("maximum_gameplay_players");
        if (gameSettings.ReadyRequirement == ReadyRequirementMode.AllPlayers && !gameSettings.HostCanStartWithoutAllReady &&
            members.Any(x => x.IsGameplayParticipant && x.IsConnected && !x.IsReady)) blockers.Add("connected_members_not_ready");
        blockers.AddRange(settings.ValidateStart(room));
        if (room.CurrentVoting?.State is VotingState.Active or VotingState.Completed) blockers.Add("active_voting");
        if (room.CurrentThreat != null && room.ThreatState != null && room.ThreatState.ThreatStatus is not ("aborted" or "resolved_safely" or "resolved_with_casualty" or "failed" or "completed")) blockers.Add("active_threat");
        foreach (var player in RoomService.GetPlayersSnapshot(room).Select(x => x.Value).Where(x => x.IsSpectatorGm))
            if (!room.IrreversibleOmniscientPlayerIds.Contains(RoomService.GetPlayerKey(player))) blockers.Add("invalid_omniscient_boundary");
        return blockers.Distinct().ToList();
    }
    private static string Fingerprint(Room room) => string.Join('|', room.Id, room.State, room.HostPlayerId,
        room.SettingsRevision, room.SettingsFrozen, room.CurrentVoting?.Id, room.ThreatState?.ThreatStatus, string.Join(';', RoomService.GetPlayersSnapshot(room)
            .OrderBy(x => RoomService.GetPlayerKey(x.Value)).Select(x => $"{RoomService.GetPlayerKey(x.Value)}:{x.Value.IsConnected}:{x.Value.IsLobbyReady}:{x.Value.IsLobbySpectator}:{x.Value.GmRole}:{x.Value.IsSpectatorGm}")));
}
