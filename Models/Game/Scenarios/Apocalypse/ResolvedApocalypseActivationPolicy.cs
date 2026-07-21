namespace Bunker.Models;

public sealed class ResolvedApocalypseActivationPolicy
{
    public bool Enabled { get; set; }
    public string ApocalypseId { get; set; } = "";
    public string EffectProfileId { get; set; } = "";
    public int GameplaySchemaVersion { get; set; }
    public string Source { get; set; } = "definition_default";
    public string ScheduleMode { get; set; } = "recurring";
    public string Trigger { get; set; } = "after_voting";
    public int FirstRound { get; set; } = 3;
    public int? IntervalRounds { get; set; } = 3;
    public int? MaxActivations { get; set; }
}

public sealed record PublicApocalypseActivationPolicyDto(
    bool EffectsEnabled,
    string ScheduleMode,
    string Trigger,
    int FirstRound,
    int? IntervalRounds,
    int? MaxActivations);
