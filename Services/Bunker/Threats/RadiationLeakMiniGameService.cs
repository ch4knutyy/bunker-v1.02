using System.Text.Json;
using System.Text.Json.Serialization;
using Bunker.Models;

namespace Bunker.Services.Threats
{
    public sealed class RadiationLeakMiniGameService : IThreatMiniGameService
    {
        private const string ActiveStatus = "active";
        private const string CompletedStatus = "completed";
        private readonly List<RadiationLeakQuestion> _questions;

        public RadiationLeakMiniGameService(IWebHostEnvironment environment)
        {
            var path = Path.Combine(environment.ContentRootPath, "Data", "ThreatMiniGames", "radiation_leak.json");
            var json = File.ReadAllText(path);
            var bank = JsonSerializer.Deserialize<RadiationLeakQuestionBank>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            _questions = bank?.Questions?.Where(question =>
                    !string.IsNullOrWhiteSpace(question.QuestionId) &&
                    !string.IsNullOrWhiteSpace(question.Category) &&
                    !string.IsNullOrWhiteSpace(question.CorrectOptionId))
                .ToList() ?? new();
        }

        public string ThreatId => "radiation_leak";

        public ThreatMiniGamePublicState Start(Room room, ThreatInteractionState threatState, string leaderPlayerId, string language)
        {
            if (threatState.MiniGame.Status == ActiveStatus || IsCompletedStatus(threatState.MiniGame.Status))
            {
                return GetPublicState(threatState, language);
            }

            if (!threatState.OperationScaling.IsCalculated)
            {
                throw new InvalidOperationException("Threat scaling snapshot must be calculated before starting the mini-game.");
            }

            var selectedQuestions = SelectQuestions(threatState.OperationScaling.BaseTaskCount);
            var autoCompletedCount = threatState.OperationBonuses.StrongAutoResolve
                ? threatState.OperationScaling.BaseTaskCount
                : Math.Min(threatState.OperationScaling.BaseTaskCount, threatState.OperationBonuses.AutoCompletedTaskCount);
            var playableLimit = Math.Max(0, threatState.OperationScaling.BaseTaskCount - autoCompletedCount);
            var playableQuestions = selectedQuestions
                .Take(Math.Min(threatState.OperationScaling.PlayableTaskCount, playableLimit))
                .ToList();
            var now = DateTimeOffset.UtcNow;

            threatState.MiniGame = new ThreatMiniGameState
            {
                ThreatId = ThreatId,
                Status = ActiveStatus,
                LeaderPlayerId = leaderPlayerId,
                StartedAtUtc = now,
                CurrentIndex = 0,
                AutoCompletedTaskCount = autoCompletedCount,
                Questions = playableQuestions.Select(question => new ThreatMiniGameQuestionState
                {
                    QuestionId = question.QuestionId,
                    Category = question.Category
                }).ToList()
            };

            if (threatState.MiniGame.Questions.Count == 0)
            {
                Complete(threatState, now);
            }
            else
            {
                StartCurrentQuestion(threatState, now);
            }

            return GetPublicState(threatState, language);
        }

        public ThreatMiniGamePublicState GetPublicState(ThreatInteractionState threatState, string language)
        {
            ApplyTimeoutIfNeeded(threatState, DateTimeOffset.UtcNow);

            var current = string.Equals(threatState.MiniGame.Status, ActiveStatus, StringComparison.OrdinalIgnoreCase)
                ? GetCurrentQuestionState(threatState)
                : null;
            var currentQuestion = current == null ? null : FindQuestion(current.QuestionId);
            var totalQuestions = threatState.MiniGame.Questions.Count;
            var deadline = current?.QuestionDeadlineUtc;

            return new ThreatMiniGamePublicState
            {
                ThreatId = threatState.MiniGame.ThreatId,
                Status = threatState.MiniGame.Status,
                LeaderPlayerId = threatState.MiniGame.LeaderPlayerId,
                CurrentIndex = totalQuestions == 0 ? 0 : Math.Min(threatState.MiniGame.CurrentIndex + 1, totalQuestions),
                TotalQuestions = totalQuestions,
                DeadlineUtc = deadline,
                CurrentQuestion = currentQuestion == null || current == null || deadline == null
                    ? null
                    : new ThreatMiniGameQuestionDto
                    {
                        QuestionId = currentQuestion.QuestionId,
                        Category = currentQuestion.Category,
                        Text = Localize(currentQuestion.Text, language),
                        Options = currentQuestion.Options
                            .Select(option => new ThreatMiniGameOptionDto
                            {
                                OptionId = option.OptionId,
                                Text = Localize(option.Text, language)
                            })
                            .ToList(),
                        CurrentIndex = Math.Min(threatState.MiniGame.CurrentIndex + 1, totalQuestions),
                        TotalQuestions = totalQuestions,
                        DeadlineUtc = deadline.Value,
                        Hint = current.AppliedHint
                    },
                Score = BuildScore(threatState),
                ResultStatus = threatState.MiniGame.ResultStatus,
                Outcome = threatState.MiniGame.Outcome
            };
        }

        public ThreatMiniGameAnswerResult ApplyHint(ThreatInteractionState threatState, string language)
        {
            if (!string.Equals(threatState.MiniGame.Status, ActiveStatus, StringComparison.OrdinalIgnoreCase))
            {
                return Failure("Мінігра зараз не активна.", GetPublicState(threatState, language));
            }

            if (threatState.MiniGame.HintsUsed >= threatState.OperationScaling.HintTokens + threatState.OperationBonuses.HintTokens)
            {
                return Failure("Підказки вже вичерпано.", GetPublicState(threatState, language));
            }

            var current = GetCurrentQuestionState(threatState);
            if (current == null)
            {
                return Failure("Немає активного питання.", GetPublicState(threatState, language));
            }

            if (string.IsNullOrWhiteSpace(current.AppliedHint))
            {
                var question = FindQuestion(current.QuestionId);
                current.AppliedHint = question == null ? "" : Localize(question.Hint, language);
                threatState.MiniGame.HintsUsed++;
            }

            return new ThreatMiniGameAnswerResult
            {
                Success = true,
                PublicState = GetPublicState(threatState, language)
            };
        }

        public ThreatMiniGameAnswerResult SubmitAnswer(Room room, ThreatInteractionState threatState, string playerId, string questionId, string optionId, string language)
        {
            if (!string.Equals(threatState.MiniGame.Status, ActiveStatus, StringComparison.OrdinalIgnoreCase))
            {
                return Failure("Мінігра зараз не активна.");
            }

            if (!string.Equals(threatState.MiniGame.LeaderPlayerId, playerId, StringComparison.OrdinalIgnoreCase))
            {
                return Failure("Тільки керівник операції може зафіксувати відповідь.");
            }

            var now = DateTimeOffset.UtcNow;
            var timeoutBeforeAnswer = ApplyTimeoutIfNeeded(threatState, now);
            if (timeoutBeforeAnswer)
            {
                return Failure("Час на відповідь вичерпано.", GetPublicState(threatState, language));
            }

            var current = GetCurrentQuestionState(threatState);
            if (current == null)
            {
                return Failure("Немає активного питання.", GetPublicState(threatState, language));
            }

            if (!string.Equals(current.QuestionId, questionId, StringComparison.OrdinalIgnoreCase))
            {
                return Failure("Це питання вже не активне.", GetPublicState(threatState, language));
            }

            if (current.AnsweredAtUtc != null || current.IsTimedOut)
            {
                return Failure("На це питання вже зараховано результат.", GetPublicState(threatState, language));
            }

            if (current.QuestionDeadlineUtc != null && now > current.QuestionDeadlineUtc.Value)
            {
                MarkTimeoutAndAdvance(threatState, current, now);
                return Failure("Час на відповідь вичерпано.", GetPublicState(threatState, language));
            }

            var question = FindQuestion(current.QuestionId);
            if (question == null)
            {
                return Failure("Питання не знайдено.", GetPublicState(threatState, language));
            }

            var isCorrect = string.Equals(question.CorrectOptionId, optionId, StringComparison.OrdinalIgnoreCase);
            if (!isCorrect &&
                string.Equals(question.Category, "repair", StringComparison.OrdinalIgnoreCase) &&
                threatState.OperationBonuses.RepairRetryTokens > 0)
            {
                threatState.OperationBonuses.RepairRetryTokens--;
                return new ThreatMiniGameAnswerResult
                {
                    Success = true,
                    PublicState = GetPublicState(threatState, language)
                };
            }

            current.SelectedOptionId = optionId;
            current.IsCorrect = isCorrect;
            current.AnsweredAtUtc = now;

            if (isCorrect)
            {
                threatState.MiniGame.CorrectAnswers++;
            }
            else
            {
                threatState.MiniGame.WrongAnswers++;
            }

            AdvanceAfterQuestion(threatState, now);
            return new ThreatMiniGameAnswerResult
            {
                Success = true,
                PublicState = GetPublicState(threatState, language)
            };
        }

        private List<RadiationLeakQuestion> SelectQuestions(int baseTaskCount)
        {
            var targetCount = Math.Clamp(baseTaskCount, 1, _questions.Count);
            var selected = new List<RadiationLeakQuestion>();

            if (targetCount >= 3)
            {
                AddOneByCategory(selected, "detection");
                AddOneByCategory(selected, "isolation");
                AddOneByCategory(selected, "repair");
            }

            foreach (var question in _questions
                         .OrderBy(_ => Random.Shared.Next())
                         .Where(question => selected.All(item => item.QuestionId != question.QuestionId)))
            {
                if (selected.Count >= targetCount)
                {
                    break;
                }

                selected.Add(question);
            }

            return selected;
        }

        private void AddOneByCategory(List<RadiationLeakQuestion> selected, string category)
        {
            var question = _questions
                .Where(item => string.Equals(item.Category, category, StringComparison.OrdinalIgnoreCase))
                .OrderBy(_ => Random.Shared.Next())
                .FirstOrDefault();

            if (question != null && selected.All(item => item.QuestionId != question.QuestionId))
            {
                selected.Add(question);
            }
        }

        private void StartCurrentQuestion(ThreatInteractionState threatState, DateTimeOffset now)
        {
            var current = GetCurrentQuestionState(threatState);
            if (current == null || current.QuestionStartedAtUtc != null)
            {
                return;
            }

            current.QuestionStartedAtUtc = now;
            current.QuestionDeadlineUtc = now.AddSeconds(Math.Max(1, threatState.OperationScaling.TaskTimeSeconds));
        }

        private bool ApplyTimeoutIfNeeded(ThreatInteractionState threatState, DateTimeOffset now)
        {
            var current = GetCurrentQuestionState(threatState);
            if (current?.QuestionDeadlineUtc == null ||
                current.AnsweredAtUtc != null ||
                current.IsTimedOut ||
                now <= current.QuestionDeadlineUtc.Value)
            {
                return false;
            }

            MarkTimeoutAndAdvance(threatState, current, now);
            return true;
        }

        private void MarkTimeoutAndAdvance(ThreatInteractionState threatState, ThreatMiniGameQuestionState current, DateTimeOffset now)
        {
            current.IsTimedOut = true;
            current.AnsweredAtUtc = now;
            threatState.MiniGame.Timeouts++;
            AdvanceAfterQuestion(threatState, now);
        }

        private void AdvanceAfterQuestion(ThreatInteractionState threatState, DateTimeOffset now)
        {
            threatState.MiniGame.CurrentIndex++;
            var errors = threatState.MiniGame.WrongAnswers + threatState.MiniGame.Timeouts;
            if (threatState.MiniGame.CurrentIndex >= threatState.MiniGame.Questions.Count ||
                errors > threatState.OperationScaling.AllowedErrors)
            {
                Complete(threatState, now);
                return;
            }

            StartCurrentQuestion(threatState, now);
        }

        private void Complete(ThreatInteractionState threatState, DateTimeOffset now)
        {
            if (string.Equals(threatState.MiniGame.Status, CompletedStatus, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            threatState.MiniGame.Status = CompletedStatus;
            threatState.MiniGame.CompletedAtUtc = now;
            var current = GetCurrentQuestionState(threatState);
            if (current != null)
            {
                current.QuestionStartedAtUtc = null;
                current.QuestionDeadlineUtc = null;
            }
            var completedTasks = threatState.MiniGame.CorrectAnswers + threatState.MiniGame.AutoCompletedTaskCount;
            var allBaseTasksCompleted = completedTasks >= threatState.OperationScaling.BaseTaskCount;
            var hasNoFailures = threatState.MiniGame.WrongAnswers == 0 && threatState.MiniGame.Timeouts == 0;
            var errors = threatState.MiniGame.WrongAnswers + threatState.MiniGame.Timeouts;

            threatState.MiniGame.ResultStatus = allBaseTasksCompleted && hasNoFailures
                ? "perfect_success"
                : completedTasks >= threatState.OperationScaling.RequiredTasksForSuccess &&
                  errors <= threatState.OperationScaling.AllowedErrors
                    ? "success_with_consequences"
                    : "failed";
        }

        private static bool IsCompletedStatus(string status) =>
            string.Equals(status, CompletedStatus, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(status, "resolved_safely", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(status, "resolved_with_casualty", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(status, "failed", StringComparison.OrdinalIgnoreCase);

        private ThreatMiniGameQuestionState? GetCurrentQuestionState(ThreatInteractionState threatState) =>
            threatState.MiniGame.CurrentIndex >= 0 &&
            threatState.MiniGame.CurrentIndex < threatState.MiniGame.Questions.Count
                ? threatState.MiniGame.Questions[threatState.MiniGame.CurrentIndex]
                : null;

        private ThreatMiniGameScoreDto BuildScore(ThreatInteractionState threatState) =>
            new()
            {
                CorrectAnswers = threatState.MiniGame.CorrectAnswers,
                WrongAnswers = threatState.MiniGame.WrongAnswers,
                Timeouts = threatState.MiniGame.Timeouts,
                CompletedTasks = threatState.MiniGame.CorrectAnswers + threatState.MiniGame.AutoCompletedTaskCount,
                RequiredForSuccess = threatState.OperationScaling.RequiredTasksForSuccess,
                AllowedErrors = threatState.OperationScaling.AllowedErrors
            };

        private RadiationLeakQuestion? FindQuestion(string questionId) =>
            _questions.FirstOrDefault(question => string.Equals(question.QuestionId, questionId, StringComparison.OrdinalIgnoreCase));

        private static string Localize(Dictionary<string, string> values, string language)
        {
            var normalized = string.IsNullOrWhiteSpace(language) ? "uk" : language.Trim().ToLowerInvariant();
            return values.TryGetValue(normalized, out var value) && !string.IsNullOrWhiteSpace(value)
                ? value
                : values.TryGetValue("uk", out var fallback)
                    ? fallback
                    : values.Values.FirstOrDefault() ?? "";
        }

        private static ThreatMiniGameAnswerResult Failure(string error, ThreatMiniGamePublicState? publicState = null) =>
            new()
            {
                Success = false,
                Error = error,
                PublicState = publicState
            };

        private sealed class RadiationLeakQuestionBank
        {
            [JsonPropertyName("questions")]
            public List<RadiationLeakQuestion> Questions { get; set; } = new();
        }

        private sealed class RadiationLeakQuestion
        {
            [JsonPropertyName("questionId")]
            public string QuestionId { get; set; } = "";

            [JsonPropertyName("category")]
            public string Category { get; set; } = "";

            [JsonPropertyName("text")]
            public Dictionary<string, string> Text { get; set; } = new();

            [JsonPropertyName("options")]
            public List<RadiationLeakOption> Options { get; set; } = new();

            [JsonPropertyName("correctOptionId")]
            public string CorrectOptionId { get; set; } = "";

            [JsonPropertyName("hint")]
            public Dictionary<string, string> Hint { get; set; } = new();
        }

        private sealed class RadiationLeakOption
        {
            [JsonPropertyName("optionId")]
            public string OptionId { get; set; } = "";

            [JsonPropertyName("text")]
            public Dictionary<string, string> Text { get; set; } = new();
        }
    }
}
