namespace Bunker.Models
{
    public class ThreatInteractionState
    {
        public string CurrentThreatId { get; set; } = "";
        public string ThreatStatus { get; set; } = "hidden";
        public int? ThreatRevealedRound { get; set; }
        public ThreatSecretSupportDropState SecretSupportDrop { get; set; } = new();
        public ThreatVolunteerSelectionState VolunteerSelection { get; set; } = new();
        public List<ThreatContributionState> Contributions { get; set; } = new();
        public ThreatVolunteerVoteState ThreatVolunteerVote { get; set; } = new();
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
