using Bunker.Models;

namespace Bunker.Services;

public sealed class GmAuditService(TimeProvider timeProvider)
{
    public const int MaxEntriesPerRoom = 200;
    private static readonly HashSet<string> AllowedResults = new(StringComparer.OrdinalIgnoreCase)
    {
        "success", "rejected", "failed"
    };

    public GmAuditEntryDto Append(
        Room room,
        string actorPlayerId,
        string actionType,
        GmAuditResult result,
        string summary,
        string? targetPlayerId = null,
        string? commandId = null,
        string? errorCode = null)
    {
        lock (room.GmAuditSyncRoot)
        {
            var safeAction = SafeToken(actionType, "unknown_action");
            var safeSummary = SafeText(summary, 240);
            var safeError = string.IsNullOrWhiteSpace(errorCode) ? null : SafeToken(errorCode, "operation_failed");
            var entry = new GmAuditEntry
            {
                Id = ++room.NextGmAuditSequenceId,
                OccurredAtUtc = timeProvider.GetUtcNow(),
                ActorPlayerId = SafeId(actorPlayerId),
                ActionType = safeAction,
                TargetPlayerId = string.IsNullOrWhiteSpace(targetPlayerId) ? null : SafeId(targetPlayerId),
                Result = result,
                Summary = safeSummary,
                CommandId = string.IsNullOrWhiteSpace(commandId) ? null : SafeId(commandId),
                RelatedSnapshotId = null,
                CanUndo = false,
                ErrorCode = safeError
            };
            room.GmAuditLog.Add(entry);
            var overflow = room.GmAuditLog.Count - MaxEntriesPerRoom;
            if (overflow > 0) room.GmAuditLog.RemoveRange(0, overflow);
            return ToDto(entry);
        }
    }

    public IReadOnlyList<GmAuditEntryDto> GetRecent(Room room, int take = 50)
    {
        lock (room.GmAuditSyncRoot)
            return room.GmAuditLog.OrderByDescending(entry => entry.Id)
                .Take(Math.Clamp(take, 1, 50)).Select(ToDto).ToList();
    }

    private static GmAuditEntryDto ToDto(GmAuditEntry entry)
    {
        var result = entry.Result.ToString().ToLowerInvariant();
        if (!AllowedResults.Contains(result)) result = "failed";
        return new(entry.Id, entry.OccurredAtUtc, entry.ActorPlayerId, entry.ActionType,
            entry.TargetPlayerId, result, entry.Summary, entry.CommandId,
            entry.RelatedSnapshotId, false, entry.ErrorCode);
    }

    private static string SafeId(string value) => SafeText(value, 80);
    private static string SafeToken(string? value, string fallback)
    {
        var token = new string((value ?? "").Where(c => char.IsLetterOrDigit(c) || c is '_' or '-').ToArray());
        return string.IsNullOrWhiteSpace(token) ? fallback : token[..Math.Min(token.Length, 80)].ToLowerInvariant();
    }

    private static string SafeText(string? value, int maxLength)
    {
        var clean = new string((value ?? "").Where(c => !char.IsControl(c)).ToArray())
            .Replace("<", "").Replace(">", "").Trim();
        return clean[..Math.Min(clean.Length, maxLength)];
    }
}
