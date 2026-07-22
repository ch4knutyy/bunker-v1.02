using System.Text.Json;
using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public class PostGameStoryStateTests
{
    [Fact]
    public void GuestCannotPrepareSubmitOrPublishStory()
    {
        var room = PostGameStoryTestRoom.Create();
        var guest = room.Players["guest-connection"];
        var service = new PostGameStoryService(new(), new(), TimeProvider.System, PostGameStoryTestRoom.CreateAuthority());

        Assert.Throws<UnauthorizedAccessException>(() => service.Prepare(room, guest, PostGameStoryModes.FinalStory, null, "guest-prepare"));
        Assert.Throws<UnauthorizedAccessException>(() => service.Submit(room, guest, PostGameStoryTestRoom.ValidJson(), "guest-submit"));
        Assert.Throws<UnauthorizedAccessException>(() => service.Publish(room, guest, "fingerprint", "guest-publish"));
    }

    [Fact]
    public void PreviewStaysPrivatePublishIsCanonicalAndCommandIsIdempotent()
    {
        var room = PostGameStoryTestRoom.Create();
        var host = room.Players[room.HostConnectionId];
        var service = new PostGameStoryService(new(), new(), TimeProvider.System, PostGameStoryTestRoom.CreateAuthority());

        var prepared = service.Prepare(room, host, PostGameStoryModes.FinalStory, null, "prepare-1");
        var preview = service.Submit(room, host, PostGameStoryTestRoom.ValidJson(), "submit-1");
        Assert.True(preview.IsValid);
        Assert.Empty(service.ToPublicDto(room.PostGameStory).PublishedEntries);
        var publicBefore = JsonSerializer.Serialize(service.ToPublicDto(room.PostGameStory));
        Assert.DoesNotContain("GeneratedPrompt", publicBefore);
        Assert.DoesNotContain("RawResult", publicBefore);

        var entry = service.Publish(room, host, preview.PreviewFingerprint!, "publish-1");
        var duplicate = service.Publish(room, host, preview.PreviewFingerprint!, "publish-1");

        Assert.Equal(entry.Id, duplicate.Id);
        Assert.Single(room.PostGameStory.PublishedEntries);
        Assert.Single(service.ToPublicDto(room.PostGameStory).PublishedEntries);
        Assert.NotEmpty(prepared.GeneratedPrompt!);
        Assert.Null(room.PostGameStory.RawResult);
    }

    [Fact]
    public void StaleFingerprintIsRejectedAndResetClearsStory()
    {
        var room = PostGameStoryTestRoom.Create();
        var host = room.Players[room.HostConnectionId];
        var service = new PostGameStoryService(new(), new(), TimeProvider.System, PostGameStoryTestRoom.CreateAuthority());
        service.Prepare(room, host, PostGameStoryModes.FinalStory, null, "prepare-2");
        service.Submit(room, host, PostGameStoryTestRoom.ValidJson(), "submit-2");

        Assert.Throws<InvalidOperationException>(() => service.Publish(room, host, "stale", "publish-stale"));
        Assert.NotNull(room.PostGameStory.Preview);

        var reset = GameResetService.TryReturnFinishedGameToLobby(room, "reset-1");
        Assert.True(reset.Success);
        Assert.Equal(PostGameStoryStatuses.NotStarted, room.PostGameStory.Status);
        Assert.Empty(room.PostGameStory.PublishedEntries);
    }

    [Fact]
    public void SnapshotRoundTripPreservesPublishedStoryWithoutDuplicatingIt()
    {
        var room = PostGameStoryTestRoom.Create();
        room.PostGameStory.Status = PostGameStoryStatuses.AwaitingNextChoice;
        room.PostGameStory.PublishedEntries.Add(new() { Id = "entry-one", Title = "Хроніка", Opening = "Вступ", FinalSummary = "Фінал" });
        room.PostGameStory.CurrentEntryId = "entry-one";

        var snapshot = RoomSnapshotService.CaptureState(room);
        var restored = PostGameStoryTestRoom.Create();
        RoomSnapshotService.ApplyState(restored, snapshot);

        Assert.Equal("entry-one", restored.PostGameStory.CurrentEntryId);
        Assert.Single(restored.PostGameStory.PublishedEntries);
    }
}
