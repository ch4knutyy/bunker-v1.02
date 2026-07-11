namespace Bunker.Models
{
    public class ThreatInteractionState
    {
        public string CurrentThreatId { get; set; } = "";
        public string ThreatStatus { get; set; } = "hidden";
        public int? ThreatRevealedRound { get; set; }
        public ThreatSecretSupportDropState SecretSupportDrop { get; set; } = new();
        public ThreatVolunteerSelectionState VolunteerSelection { get; set; } = new();
        public List<string> ParticipantPlayerIds { get; set; } = new();
        public string ForcedParticipantPlayerId { get; set; } = "";
        public List<ThreatContributionState> Contributions { get; set; } = new();
        public ThreatVolunteerVoteState ThreatVolunteerVote { get; set; } = new();
        public ThreatOperationScalingState OperationScaling { get; set; } = new();
        public ThreatOperationBonusState OperationBonuses { get; set; } = new();
        public ThreatMiniGameState MiniGame { get; set; } = new();
        public ThreatResolutionState Resolution { get; set; } = new();
    }

    public class ThreatSecretSupportDropState
    {
        public bool IsCompleted { get; set; }
        public string RecipientPlayerId { get; set; } = "";
        public string AwardedItemInstanceId { get; set; } = "";
        public int? RollValue { get; set; }
    }

    public class ThreatVolunteerSelectionState
    {
        public string SelectedPlayerId { get; set; } = "";
        public string SelectionReason { get; set; } = "";
        public int? SelectedAtRound { get; set; }
    }

    public class ThreatContributionState
    {
        public string ContributionId { get; set; } = Guid.NewGuid().ToString("N");
        public string SourceType { get; set; } = "";
        public string SourceId { get; set; } = "";
        public string OwnerPlayerId { get; set; } = "";
        public string PlayerId { get; set; } = "";
        public string ItemInstanceId { get; set; } = "";
        public string Status { get; set; } = "accepted";
        public bool IsHidden { get; set; } = true;
        public bool IsAccepted { get; set; }
        public int SubmittedAt { get; set; }
        public int SubmittedRound { get; set; }
        public string ReservedForThreatId { get; set; } = "";
        public List<string> TagsSnapshot { get; set; } = new();
        public string DisplayName { get; set; } = "";
        public bool IsConsumed { get; set; }
    }

    public class ThreatVolunteerVoteState
    {
        public string Status { get; set; } = "none";
        public Dictionary<string, string> Votes { get; set; } = new();
        public string SelectedPlayerId { get; set; } = "";
        public int? StartedAtRound { get; set; }
        public int? CompletedAtRound { get; set; }
    }

    public class ThreatOperationScalingState
    {
        public bool IsCalculated { get; set; }
        public int? CalculatedAtRound { get; set; }
        public int ScalingPlayerCount { get; set; }
        public int MinParticipants { get; set; }
        public int MaxParticipants { get; set; }
        public int BaseTaskCount { get; set; }
        public int PlayableTaskCount { get; set; }
        public int BaseTimeSeconds { get; set; }
        public int TimeBonusSeconds { get; set; }
        public int TaskTimeSeconds { get; set; }
        public int HintTokens { get; set; }
        public int AllowedErrors { get; set; }
        public int RequiredTasksForSuccess { get; set; }
    }

    public class ThreatOperationBonusState
    {
        public bool IsCalculated { get; set; }
        public int AdditionalAllowedErrors { get; set; }
        public int TimeBonusSeconds { get; set; }
        public int AutoCompletedTaskCount { get; set; }
        public int HintTokens { get; set; }
        public int MedicalMitigationCount { get; set; }
        public int RepairRetryTokens { get; set; }
        public bool StrongAutoResolve { get; set; }
        public List<string> AutoCompletedCategories { get; set; } = new();
        public List<string> ProtectedPlayerIds { get; set; } = new();
        public List<string> UsefulContributionIds { get; set; } = new();
        public List<string> IneffectiveItemContributionIds { get; set; } = new();
        public List<string> PublicExplanations { get; set; } = new();
    }

    public class ThreatMiniGameState
    {
        public string ThreatId { get; set; } = "";
        public string Status { get; set; } = "not_started";
        public string LeaderPlayerId { get; set; } = "";
        public DateTimeOffset? StartedAtUtc { get; set; }
        public DateTimeOffset? CompletedAtUtc { get; set; }
        public int CurrentIndex { get; set; }
        public int CorrectAnswers { get; set; }
        public int WrongAnswers { get; set; }
        public int Timeouts { get; set; }
        public int HintsUsed { get; set; }
        public int AutoCompletedTaskCount { get; set; }
        public string ResultStatus { get; set; } = "";
        public string Outcome { get; set; } = "";
        public List<ThreatMiniGameQuestionState> Questions { get; set; } = new();
    }

    public class ThreatMiniGameQuestionState
    {
        public string QuestionId { get; set; } = "";
        public string Category { get; set; } = "";
        public DateTimeOffset? QuestionStartedAtUtc { get; set; }
        public DateTimeOffset? QuestionDeadlineUtc { get; set; }
        public DateTimeOffset? AnsweredAtUtc { get; set; }
        public string SelectedOptionId { get; set; } = "";
        public bool? IsCorrect { get; set; }
        public bool IsTimedOut { get; set; }
        public string AppliedHint { get; set; } = "";
    }

    public class ThreatResolutionState
    {
        public string SelectedApproachId { get; set; } = "";
        public bool WasSuccessful { get; set; }
        public bool WasVolunteerProtected { get; set; }
        public bool EffectsApplied { get; set; }
        public int? CompletedAtRound { get; set; }
        public List<string> PublicResults { get; set; } = new();
    }

    public class EliminationVoteImmunity
    {
        public bool IsActive { get; set; }
        public string SourceThreatId { get; set; } = "";
        public int? GrantedAtRound { get; set; }
        public int RemainingUses { get; set; }
    }
}
