using Bunker.Models;

namespace Bunker.Services.Threats
{
    public interface IThreatMiniGameService
    {
        string ThreatId { get; }
        ThreatMiniGamePublicState Start(Room room, ThreatInteractionState threatState, string leaderPlayerId, string language);
        ThreatMiniGamePublicState GetPublicState(ThreatInteractionState threatState, string language);
        ThreatMiniGameAnswerResult ApplyHint(ThreatInteractionState threatState, string language);
        ThreatMiniGameAnswerResult SubmitAnswer(Room room, ThreatInteractionState threatState, string playerId, string questionId, string optionId, string language);
    }

    public sealed class ThreatMiniGameAnswerResult
    {
        public bool Success { get; init; }
        public string Error { get; init; } = "";
        public ThreatMiniGamePublicState? PublicState { get; init; }
    }

    public sealed class ThreatMiniGamePublicState
    {
        public string ThreatId { get; init; } = "";
        public string Status { get; init; } = "";
        public string LeaderPlayerId { get; init; } = "";
        public int CurrentIndex { get; init; }
        public int TotalQuestions { get; init; }
        public DateTimeOffset? DeadlineUtc { get; init; }
        public ThreatMiniGameQuestionDto? CurrentQuestion { get; init; }
        public ThreatMiniGameScoreDto Score { get; init; } = new();
        public string ResultStatus { get; init; } = "";
        public string Outcome { get; init; } = "";
    }

    public sealed class ThreatMiniGameQuestionDto
    {
        public string QuestionId { get; init; } = "";
        public string Category { get; init; } = "";
        public string Text { get; init; } = "";
        public IReadOnlyList<ThreatMiniGameOptionDto> Options { get; init; } = Array.Empty<ThreatMiniGameOptionDto>();
        public int CurrentIndex { get; init; }
        public int TotalQuestions { get; init; }
        public DateTimeOffset DeadlineUtc { get; init; }
        public string Hint { get; init; } = "";
    }

    public sealed class ThreatMiniGameOptionDto
    {
        public string OptionId { get; init; } = "";
        public string Text { get; init; } = "";
    }

    public sealed class ThreatMiniGameScoreDto
    {
        public int CorrectAnswers { get; init; }
        public int WrongAnswers { get; init; }
        public int Timeouts { get; init; }
        public int CompletedTasks { get; init; }
        public int RequiredForSuccess { get; init; }
        public int AllowedErrors { get; init; }
    }
}
