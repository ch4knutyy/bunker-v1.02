namespace Bunker.Models;

public enum AiWorldFactKind { Confirmed, Inferred, Unknown }

public sealed record AiWorldApocalypse(string Name, string Description, IReadOnlyList<string> KnownConditions);
public sealed record AiWorldThreat(string Name, string Description, string Status, string Severity);
public sealed record AiWorldBunker(
    IReadOnlyList<string> Advantages,
    IReadOnlyList<string> Disadvantages,
    IReadOnlyList<string> Resources,
    IReadOnlyList<string> Limitations);
public sealed record AiWorldGame(int CurrentRound, int? AvailableSeats, int RemainingPlayers);
public sealed record AiWorldContext(
    AiWorldApocalypse? Apocalypse,
    IReadOnlyList<AiWorldThreat> Threats,
    AiWorldBunker? Bunker,
    AiWorldGame Game);
public sealed record AiWorldFinding(AiWorldFactKind Kind, string Category, string Value);
public sealed record AiWorldAnalysis(
    IReadOnlyList<AiWorldFinding> Confirmed,
    IReadOnlyList<AiWorldFinding> Inferred,
    IReadOnlyList<AiWorldFinding> Unknown);
