using System.Collections.Concurrent;
using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services;

/// <summary>Per-AI, visibility-safe projection of concrete room facts for future AI agents.</summary>
public sealed class AiWorldContextService(BunkerIntelService bunkerIntel)
{
    private sealed record CacheEntry(string Fingerprint, AiWorldContext Context);
    private readonly ConcurrentDictionary<string, CacheEntry> _cache = new(StringComparer.OrdinalIgnoreCase);

    public AiWorldContext GetForAi(Room room, Player viewer)
    {
        var projection = bunkerIntel.Project(room, viewer) as BunkerIntelProjectionDto;
        var fingerprint = BuildFingerprint(room, viewer, projection);
        var key = room.Id + ":" + RoomService.GetPlayerKey(viewer);
        if (_cache.TryGetValue(key, out var cached) && cached.Fingerprint == fingerprint) return cached.Context;

        var context = Build(room, projection);
        _cache[key] = new(fingerprint, context);
        return context;
    }

    private static AiWorldContext Build(Room room, BunkerIntelProjectionDto? bunker)
    {
        var apocalypse = room.ApocalypseRevealed && room.Apocalypse != null
            ? new AiWorldApocalypse(room.Apocalypse.Name, room.Apocalypse.Description,
                room.Apocalypse.Threats.Concat(room.Apocalypse.Requirements).Where(NotBlank).Take(6).ToList())
            : null;
        var threats = new List<AiWorldThreat>();
        if (room.IsThreatRevealed && room.CurrentThreat != null)
        {
            threats.Add(new(room.CurrentThreat.Name, room.CurrentThreat.Description,
                IsThreatResolved(room) ? "resolved" : "active", room.CurrentThreat.Severity));
        }

        var bunkerContext = bunker == null ? null : new AiWorldBunker(
            bunker.Facilities?.Where(NotBlank).Take(4).ToList() ?? [],
            bunker.Problems?.Where(NotBlank).Take(4).ToList() ?? [],
            bunker.Resources?.Where(NotBlank).Take(4).ToList() ?? [],
            BuildLimitations(bunker));
        var remainingPlayers = RoomService.GetGameplayPlayersSnapshot(room).Count(entry => !entry.Value.IsEliminated);
        var capacity = room.ResolvedBunkerCapacity ?? bunker?.Capacity;
        return new(apocalypse, threats, bunkerContext, new(room.CurrentRound, capacity, remainingPlayers));
    }

    private static IReadOnlyList<string> BuildLimitations(BunkerIntelProjectionDto bunker)
    {
        var limitations = new List<string>();
        if (!string.IsNullOrWhiteSpace(bunker.Condition)) limitations.Add("condition: " + bunker.Condition);
        if (bunker.SuppliesMonths is { } food) limitations.Add("foodMonths: " + food);
        if (bunker.WaterMonths is { } water) limitations.Add("waterMonths: " + water);
        return limitations;
    }

    private static bool IsThreatResolved(Room room) =>
        string.Equals(room.ThreatState?.ThreatStatus, "resolved", StringComparison.OrdinalIgnoreCase) ||
        room.ScenarioSituations?.ActiveScenario is { ResolutionMode: "existing_threat_flow", IsResolved: true };

    private static string BuildFingerprint(Room room, Player viewer, BunkerIntelProjectionDto? bunker) => JsonSerializer.Serialize(new
    {
        room.GameRunId,
        room.CurrentRound,
        room.ApocalypseRevealed,
        apocalypse = room.ApocalypseRevealed ? new { room.Apocalypse?.Id, room.Apocalypse?.Name, room.Apocalypse?.Description,
            room.Apocalypse?.Threats, room.Apocalypse?.Requirements } : null,
        room.IsThreatRevealed,
        threat = room.IsThreatRevealed ? new { room.CurrentThreat?.Id, room.CurrentThreat?.Name, room.CurrentThreat?.Description,
            room.CurrentThreat?.Severity, room.ThreatState?.ThreatStatus, scenarioMode = room.ScenarioSituations?.ActiveScenario?.ResolutionMode,
            scenarioResolved = room.ScenarioSituations?.ActiveScenario?.IsResolved } : null,
        bunker = bunker == null ? null : new { bunker.Capacity, bunker.Name, bunker.Condition, bunker.SuppliesMonths, bunker.WaterMonths,
            bunker.Facilities, bunker.Resources, bunker.Problems },
        room.ResolvedBunkerCapacity,
        activePlayers = RoomService.GetGameplayPlayersSnapshot(room).Count(entry => !entry.Value.IsEliminated),
        viewer = RoomService.GetPlayerKey(viewer)
    });

    private static bool NotBlank(string value) => !string.IsNullOrWhiteSpace(value);
}

/// <summary>Classifies only server-projected facts; conditional deductions are never promoted to facts.</summary>
public static class AiWorldAnalysisService
{
    public static AiWorldAnalysis Analyze(AiWorldContext context)
    {
        var confirmed = new List<AiWorldFinding>();
        if (context.Apocalypse != null)
        {
            confirmed.Add(new(AiWorldFactKind.Confirmed, "apocalypse", context.Apocalypse.Name));
            confirmed.AddRange(context.Apocalypse.KnownConditions.Select(value => new AiWorldFinding(AiWorldFactKind.Confirmed, "condition", value)));
        }
        confirmed.AddRange(context.Threats.Select(threat => new AiWorldFinding(AiWorldFactKind.Confirmed, "threat", $"{threat.Name} ({threat.Status})")));
        if (context.Bunker != null)
        {
            confirmed.AddRange(context.Bunker.Advantages.Select(value => new AiWorldFinding(AiWorldFactKind.Confirmed, "bunkerAdvantage", value)));
            confirmed.AddRange(context.Bunker.Disadvantages.Select(value => new AiWorldFinding(AiWorldFactKind.Confirmed, "bunkerProblem", value)));
            confirmed.AddRange(context.Bunker.Resources.Select(value => new AiWorldFinding(AiWorldFactKind.Confirmed, "bunkerResource", value)));
        }

        var inferred = context.Threats.Where(threat => threat.Status == "active")
            .Select(threat => new AiWorldFinding(AiWorldFactKind.Inferred, "conditional", $"Addressing {threat.Name} may matter for survival."))
            .Take(2).ToList();
        var unknown = new List<AiWorldFinding>();
        if (context.Apocalypse == null)
            unknown.Add(new(AiWorldFactKind.Unknown, "apocalypse", "The apocalypse has not been publicly revealed."));
        if (context.Threats.Count == 0)
            unknown.Add(new(AiWorldFactKind.Unknown, "threat", "No public current threat is known."));
        return new(confirmed.Take(12).ToList(), inferred, unknown);
    }
}
