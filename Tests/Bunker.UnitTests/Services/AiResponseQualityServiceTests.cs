using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class AiResponseQualityServiceTests
{
    [Fact]
    public void Rejects_empty_long_duplicate_and_explicitly_conflicting_answers_without_rewriting_valid_text()
    {
        var companion = new AiChatCompanion { Id = "ai", PlayerStableId = "ai", Name = "Марія" };
        var history = new[] { new RoomChatMessage("m", "room", "ai", "Марія", DateTimeOffset.UtcNow, ChatSenderType.Ai, "Я оцінюю факти обережно.") };

        var valid = AiResponseQualityService.Validate("Я оцінюю факти обережно, але хочу уточнення.", companion, history, "Лікар");
        var empty = AiResponseQualityService.Validate("  ", companion, history, "Лікар");
        var longReply = AiResponseQualityService.Validate(new string('а', AiResponseQualityService.MaxResponseLength + 1), companion, history, "Лікар");
        var duplicate = AiResponseQualityService.Validate("Я оцінюю факти обережно!", companion, history, "Лікар");
        var conflict = AiResponseQualityService.Validate("Моя професія: Інженер.", companion, history, "Лікар");

        Assert.True(valid.IsAccepted);
        Assert.Equal("ai_empty_response", empty.ErrorCode);
        Assert.Equal("ai_response_too_long", longReply.ErrorCode);
        Assert.Equal("ai_duplicate_response", duplicate.ErrorCode);
        Assert.Equal("ai_self_fact_conflict", conflict.ErrorCode);
    }
}
