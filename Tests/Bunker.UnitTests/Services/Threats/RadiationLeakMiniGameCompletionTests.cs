using Bunker.Models;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;

namespace Bunker.UnitTests.Services.Threats;

public class RadiationLeakMiniGameCompletionTests
{
    [Fact]
    public void LastWrongAnswerCompletesWithFailedResult()
    {
        var (service, room, state, questionId) = StartSingleQuestionGame();

        var result = service.SubmitAnswer(room, state, "leader", questionId, "not-a-valid-option", "uk");

        Assert.True(result.Success);
        Assert.Equal("completed", result.PublicState?.Status);
        Assert.Equal("failed", result.PublicState?.ResultStatus);
        Assert.Equal(1, result.PublicState?.CurrentIndex);
        Assert.Equal(1, result.PublicState?.TotalQuestions);
    }

    [Fact]
    public void LastQuestionTimeoutCompletesWithFailedResult()
    {
        var (service, room, state, questionId) = StartSingleQuestionGame();
        state.MiniGame.Questions[0].QuestionDeadlineUtc = DateTimeOffset.UtcNow.AddSeconds(-1);

        var result = service.SubmitAnswer(room, state, "leader", questionId, "not-a-valid-option", "uk");

        Assert.False(result.Success);
        Assert.Equal("completed", result.PublicState?.Status);
        Assert.Equal("failed", result.PublicState?.ResultStatus);
        Assert.Equal(1, result.PublicState?.Score.Timeouts);
        Assert.Null(result.PublicState?.CurrentQuestion);
    }

    private static (RadiationLeakMiniGameService Service, Room Room, ThreatInteractionState State, string QuestionId)
        StartSingleQuestionGame()
    {
        var root = FindRepositoryRoot();
        var service = new RadiationLeakMiniGameService(new TestEnvironment(root));
        var room = new Room();
        var state = new ThreatInteractionState
        {
            CurrentThreatId = "radiation_leak",
            OperationScaling = new ThreatOperationScalingState
            {
                IsCalculated = true,
                BaseTaskCount = 1,
                PlayableTaskCount = 1,
                RequiredTasksForSuccess = 1,
                AllowedErrors = 0,
                TaskTimeSeconds = 30
            }
        };

        var started = service.Start(room, state, "leader", "uk");
        return (service, room, state, Assert.IsType<ThreatMiniGameQuestionDto>(started.CurrentQuestion).QuestionId);
    }

    private static string FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !Directory.Exists(Path.Combine(directory.FullName, "Data", "ThreatMiniGames")))
        {
            directory = directory.Parent;
        }
        return directory?.FullName ?? throw new DirectoryNotFoundException("Repository root was not found.");
    }

    private sealed class TestEnvironment(string contentRootPath) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Bunker.UnitTests";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = contentRootPath;
        public string EnvironmentName { get; set; } = "Testing";
        public string ContentRootPath { get; set; } = contentRootPath;
        public IFileProvider ContentRootFileProvider { get; set; } = new PhysicalFileProvider(contentRootPath);
    }
}
