namespace Bunker.Models;

public sealed record GMThreatForcePreviewDto(
    string ThreatId,
    string ThreatName,
    int CurrentRound,
    string RequestedOutcome,
    bool EffectsWillBeApplied,
    string ConsequenceScope,
    int PotentiallyAffectedPlayers,
    string Description,
    string IrreversibleWarning,
    string Fingerprint);
