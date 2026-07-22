using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public class PostGameStoryResultParserTests
{
    private readonly PostGameStoryResultParser _parser = new();

    [Fact]
    public void ValidJsonAndMarkdownFenceProduceValidatedPreview()
    {
        var room = PostGameStoryTestRoom.Create();
        var raw = PostGameStoryTestRoom.ValidJson();
        Assert.True(_parser.ParseAndValidate(raw, PostGameStoryModes.FinalStory, room).IsValid);
        Assert.True(_parser.ParseAndValidate("```json\n" + raw + "\n```", PostGameStoryModes.FinalStory, room).IsValid);
    }

    [Theory]
    [InlineData("not json", "story_json_invalid")]
    [InlineData("{}", "story_schema_version_invalid")]
    public void InvalidPayloadIsRejected(string raw, string expectedError)
    {
        var result = _parser.ParseAndValidate(raw, PostGameStoryModes.FinalStory, PostGameStoryTestRoom.Create());
        Assert.False(result.IsValid);
        Assert.Contains(expectedError, result.Errors);
    }

    [Fact]
    public void WrongModeScoreAndHtmlAreRejected()
    {
        var raw = PostGameStoryTestRoom.ValidJson().Replace("\"mode\": \"final_story\"", "\"mode\": \"continuation\"")
            .Replace("\"survivalScore\": 62", "\"survivalScore\": 101")
            .Replace("Двері зачинилися назавжди.", "<script>alert(1)</script>");
        var result = _parser.ParseAndValidate(raw, PostGameStoryModes.FinalStory, PostGameStoryTestRoom.Create());
        Assert.Contains("story_mode_mismatch", result.Errors);
        Assert.Contains("story_survival_score_invalid", result.Errors);
        Assert.Contains("story_html_not_allowed", result.Errors);
    }

    [Fact]
    public void MissingEliminatedFateAndDuplicateSurvivorAreRejected()
    {
        var raw = PostGameStoryTestRoom.ValidJson()
            .Replace("[{\"playerName\":\"Тарас\",\"usefulnessAssessment\":\"Група втратила інженера.\",\"fate\":\"Він знайшов інше укриття.\"}]", "[]")
            .Replace("[{\"playerName\":\"Олена\",\"role\":\"Лікар\",\"fate\":\"Вона втримала медичний сектор.\"}]", "[{\"playerName\":\"Олена\",\"fate\":\"A\"},{\"playerName\":\"Олена\",\"fate\":\"B\"}]");
        var result = _parser.ParseAndValidate(raw, PostGameStoryModes.FinalStory, PostGameStoryTestRoom.Create());
        Assert.Contains("story_survivor_duplicate", result.Errors);
        Assert.Contains(result.Errors, error => error.StartsWith("story_eliminated_missing:"));
    }

    [Fact]
    public void TooManyOrOversizedChaptersAreRejectedWhileUnknownFieldsAreIgnored()
    {
        var validWithUnknown = PostGameStoryTestRoom.ValidJson().Replace("\"schemaVersion\": 1,", "\"schemaVersion\": 1, \"unknownFutureField\": true,");
        Assert.True(_parser.ParseAndValidate(validWithUnknown, PostGameStoryModes.FinalStory, PostGameStoryTestRoom.Create()).IsValid);

        var chapters = string.Join(",", Enumerable.Range(1, 9).Select(index => $"{{\"title\":\"{index}\",\"text\":\"chapter\"}}"));
        var tooMany = PostGameStoryTestRoom.ValidJson().Replace("[{\"title\":\"Перша зима\",\"text\":\"Група вчилася жити в темряві.\"}]", "[" + chapters + "]");
        Assert.Contains("story_chapters_count_invalid", _parser.ParseAndValidate(tooMany, PostGameStoryModes.FinalStory, PostGameStoryTestRoom.Create()).Errors);

        var oversized = PostGameStoryTestRoom.ValidJson().Replace("Група вчилася жити в темряві.", new string('x', 12_001));
        Assert.Contains("story_chapter_text_required_too_large", _parser.ParseAndValidate(oversized, PostGameStoryModes.FinalStory, PostGameStoryTestRoom.Create()).Errors);
    }
}
