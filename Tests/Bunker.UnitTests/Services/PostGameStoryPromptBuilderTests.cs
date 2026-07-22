using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public class PostGameStoryPromptBuilderTests
{
    [Fact]
    public void PromptContainsCanonicalWorldPlayersAndSeparateSupplies()
    {
        var room = PostGameStoryTestRoom.Create();
        var prompt = new PostGameStoryPromptBuilder().Build(room, PostGameStoryModes.FinalStory);

        Assert.Contains("Ядерна зима", prompt.Text);
        Assert.Contains("Сховище 7", prompt.Text);
        Assert.Contains("foodMonths", prompt.Text);
        Assert.Contains("waterMonths", prompt.Text);
        Assert.Contains("Медпункт", prompt.Text);
        Assert.Contains("Генератор", prompt.Text);
        Assert.Contains("Тріщина", prompt.Text);
        Assert.Contains("Олена", prompt.Text);
        Assert.Contains("Тарас", prompt.Text);
        Assert.Contains("Пошкоджена рука", prompt.Text);
        Assert.Contains("Аптечка", prompt.Text);
    }

    [Fact]
    public void PromptExcludesTechnicalSecretsAndIsDeterministicAndBounded()
    {
        var room = PostGameStoryTestRoom.Create();
        room.HostToken = "SUPER_SECRET_HOST_TOKEN";
        room.Players["host-connection"].RecoveryReconnectTokenHash = "SUPER_SECRET_RECONNECT_TOKEN";
        room.ThreatAuditLog.Add(new() { CommandId = "PRIVATE_COMMAND_ID", EventType = ThreatAuditEventType.Revealed });
        var builder = new PostGameStoryPromptBuilder();

        var first = builder.Build(room, PostGameStoryModes.FinalStory);
        var second = builder.Build(room, PostGameStoryModes.FinalStory);

        Assert.Equal(first.Fingerprint, second.Fingerprint);
        Assert.True(first.Text.Length <= PostGameStoryPromptBuilder.MaxPromptLength);
        Assert.DoesNotContain("host-connection", first.Text);
        Assert.DoesNotContain("SUPER_SECRET_HOST_TOKEN", first.Text);
        Assert.DoesNotContain("SUPER_SECRET_RECONNECT_TOKEN", first.Text);
        Assert.DoesNotContain("PRIVATE_COMMAND_ID", first.Text);
        Assert.DoesNotContain("visualModifierIds", first.Text, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void FollowUpContainsPublishedSummaryAndModeInstructions()
    {
        var room = PostGameStoryTestRoom.Create();
        room.PostGameStory.PublishedEntries.Add(new() { Id = "entry-1", Mode = PostGameStoryModes.FinalStory, Title = "Перша хроніка", FinalSummary = "Бункер пережив перший рік." });

        var prompt = new PostGameStoryPromptBuilder().Build(room, PostGameStoryModes.HumanityOutcome, "entry-1");

        Assert.Contains("Перша хроніка", prompt.Text);
        Assert.Contains("Бункер пережив перший рік", prompt.Text);
        Assert.Contains("як людство пережило апокаліпсис", prompt.Text, StringComparison.OrdinalIgnoreCase);
    }
}
