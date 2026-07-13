using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Bunker.Models;
using Bunker.Services.Threats;

namespace Bunker.Services;

public sealed class DirectorControlService(TimeProvider time)
{
    private sealed record Ticket(string RoomId, string ActorId, DirectorActionRequestDto Request,
        long Version, string StateFingerprint, string? CanonicalThreatFingerprint, DateTimeOffset ExpiresAtUtc, bool CanApply);
    private readonly ConcurrentDictionary<string, Ticket> _tickets = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, DirectorActionApplyDto> _results = new(StringComparer.Ordinal);

    public DirectorActionPreviewDto Preview(Room room, Player actor, DirectorActionRequestDto request, Player? target,
        IReadOnlyList<string> categories, int mutationCount, bool canApply, IReadOnlyList<string> blockers)
    {
        var action = Normalize(request.ActionType); var irreversible = action.StartsWith("threat_force_", StringComparison.Ordinal);
        var version = StateVersion(room); var expiry = time.GetUtcNow().AddSeconds(30); var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        var canonicalThreatFingerprint = action switch
        {
            "threat_force_success" => GMThreatStateMutator.BuildForcePreviewFingerprint(room, "success"),
            "threat_force_failure" => GMThreatStateMutator.BuildForcePreviewFingerprint(room, "failure"),
            _ => null
        };
        _tickets[token] = new(room.Id, RoomService.GetPlayerKey(actor), request with { ActionType = action }, version, Fingerprint(room), canonicalThreatFingerprint, expiry, canApply);
        return new(action, target?.Name ?? "room", categories, mutationCount, !irreversible, !irreversible,
            irreversible ? "Undo unavailable after canonical threat effects are applied." : null,
            version, token, expiry, canApply, blockers);
    }

    public bool TryConsume(Room room, Player actor, DirectorActionRequestDto request, string token, long version, string commandId,
        out string? threatFingerprint, out DirectorActionApplyDto? duplicate, out string? error)
    {
        threatFingerprint = null; duplicate = null; error = null;
        if (_results.TryGetValue(commandId, out var result)) { duplicate = result with { Duplicate = true }; return false; }
        if (!_tickets.TryRemove(token, out var ticket) || ticket.ExpiresAtUtc < time.GetUtcNow()) { error = "preview_expired"; return false; }
        if (!ticket.CanApply) { error = "director_action_blocked"; return false; }
        if (ticket.RoomId != room.Id || ticket.ActorId != RoomService.GetPlayerKey(actor) || ticket.Version != version ||
            ticket.Request != request with { ActionType = Normalize(request.ActionType) } || ticket.StateFingerprint != Fingerprint(room))
        { error = "stale_preview"; return false; }
        threatFingerprint = ticket.CanonicalThreatFingerprint; return true;
    }

    public DirectorActionApplyDto Remember(string commandId, DirectorActionApplyDto result) => _results.GetOrAdd(commandId, result);
    public static long StateVersion(Room room) => (long)(BitConverter.ToUInt64(SHA256.HashData(Encoding.UTF8.GetBytes(Fingerprint(room))), 0) & 0x001F_FFFF_FFFF_FFFFUL);
    private static string Fingerprint(Room room) => string.Join('|', room.Id, room.CurrentRound, room.CurrentPhase, room.IsPaused,
        room.CurrentVoting?.Id, room.CurrentVoting?.Votes.Count ?? 0, room.ThreatState?.ThreatStatus,
        string.Join(';', RoomService.GetPlayersSnapshot(room).OrderBy(x => RoomService.GetPlayerKey(x.Value)).Select(x =>
            $"{RoomService.GetPlayerKey(x.Value)}:{x.Value.IsEliminated}:{x.Value.Revealed.RevealedValues.Count}:{x.Value.AdditionalConditionEffects.Count}")));
    public static string Normalize(string? action) => action?.Trim().ToLowerInvariant() ?? "";
}
