using Bunker.Hubs;
using Bunker.Models;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Services;

/// <summary>
/// Coordinates a GM-controlled presentation without creating game rounds or synthetic connections.
/// Generation is cancellable; state changes happen before any provider I/O.
/// </summary>
public sealed class AiPresentationCoordinator(
    RoomChatService chat,
    CharacterRevealService reveal,
    CharacterRevealSynchronizationService synchronization,
    AiChatContextBuilder context,
    IAiProvider provider,
    IHubContext<GameHub> hub,
    ILogger<AiPresentationCoordinator> logger)
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, CancellationTokenSource> _cancellations = new(StringComparer.OrdinalIgnoreCase);

    public async Task<bool> StartAsync(Room room, string characteristicKey, CancellationToken cancellationToken)
    {
        var participants = RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value)
            .OrderBy(player => player.SeatNumber).Select(RoomService.GetPlayerKey).ToList();
        if (room.State != RoomState.Playing || participants.Count == 0 || !GmPlayerStateMutator.PublicCharacteristicKeys.Contains(characteristicKey, StringComparer.Ordinal))
            return false;

        lock (room.SnapshotSyncRoot)
        {
            if (room.Presentation.Status is AiPresentationStatus.Running or AiPresentationStatus.Paused) return false;
            room.Presentation = new AiPresentationState
            {
                Status = AiPresentationStatus.Running,
                CharacteristicKey = characteristicKey,
                ParticipantStablePlayerIds = participants,
                CurrentIndex = 0,
                CurrentSpeakerStablePlayerId = participants[0],
                GenerationToken = room.Presentation.GenerationToken + 1
            };
        }
        await AddSystemAsync(room, $"Presentation started: {characteristicKey}.", $"presentation:start:{room.PublicRevealRevision}:{characteristicKey}", cancellationToken);
        await PublishStateAsync(room, cancellationToken);
        await PresentCurrentAsync(room, cancellationToken);
        return true;
    }

    public async Task<bool> PauseAsync(Room room, CancellationToken cancellationToken)
    {
        lock (room.SnapshotSyncRoot)
        {
            if (room.Presentation.Status != AiPresentationStatus.Running) return false;
            room.Presentation.Status = AiPresentationStatus.Paused;
            room.Presentation.GenerationToken++;
        }
        Cancel(room.Id);
        await PublishStateAsync(room, cancellationToken);
        return true;
    }

    public async Task<bool> ResumeAsync(Room room, CancellationToken cancellationToken)
    {
        lock (room.SnapshotSyncRoot)
        {
            if (room.Presentation.Status != AiPresentationStatus.Paused) return false;
            room.Presentation.Status = AiPresentationStatus.Running;
            room.Presentation.GenerationToken++;
        }
        await PublishStateAsync(room, cancellationToken);
        await PresentCurrentAsync(room, cancellationToken);
        return true;
    }

    public async Task<bool> NextAsync(Room room, bool skipped, CancellationToken cancellationToken)
    {
        string? skippedId = null;
        lock (room.SnapshotSyncRoot)
        {
            if (room.Presentation.Status != AiPresentationStatus.Running) return false;
            skippedId = room.Presentation.CurrentSpeakerStablePlayerId;
            room.Presentation.GenerationToken++;
            room.Presentation.CurrentIndex++;
            if (room.Presentation.CurrentIndex >= room.Presentation.ParticipantStablePlayerIds.Count)
            {
                room.Presentation.Status = AiPresentationStatus.Discussion;
                room.Presentation.CurrentSpeakerStablePlayerId = null;
            }
            else room.Presentation.CurrentSpeakerStablePlayerId = room.Presentation.ParticipantStablePlayerIds[room.Presentation.CurrentIndex];
        }
        Cancel(room.Id);
        if (skipped && skippedId != null) await AddSystemAsync(room, "Speaker skipped.", $"presentation:skip:{room.PublicRevealRevision}:{skippedId}", cancellationToken);
        await PublishStateAsync(room, cancellationToken);
        if (room.Presentation.Status == AiPresentationStatus.Discussion)
            await AddSystemAsync(room, "Presentations complete. Open discussion begins.", $"presentation:discussion:{room.PublicRevealRevision}", cancellationToken);
        else await PresentCurrentAsync(room, cancellationToken);
        return true;
    }

    public async Task<bool> EndAsync(Room room, CancellationToken cancellationToken)
    {
        lock (room.SnapshotSyncRoot)
        {
            if (room.Presentation.Status is AiPresentationStatus.Inactive or AiPresentationStatus.Discussion) return false;
            room.Presentation.Status = AiPresentationStatus.Discussion;
            room.Presentation.CurrentSpeakerStablePlayerId = null;
            room.Presentation.GenerationToken++;
        }
        Cancel(room.Id);
        await AddSystemAsync(room, "Presentations complete. Open discussion begins.", $"presentation:discussion:{room.PublicRevealRevision}", cancellationToken);
        await PublishStateAsync(room, cancellationToken);
        return true;
    }

    public async Task<bool> RetryAsync(Room room, CancellationToken cancellationToken)
    {
        lock (room.SnapshotSyncRoot)
        {
            if (room.Presentation.Status != AiPresentationStatus.Running ||
                string.IsNullOrWhiteSpace(room.Presentation.CurrentSpeakerStablePlayerId)) return false;
            room.Presentation.LastGenerationError = null;
            room.Presentation.GenerationToken++;
        }
        await PublishStateAsync(room, cancellationToken);
        await PresentCurrentAsync(room, cancellationToken);
        return true;
    }

    private async Task PresentCurrentAsync(Room room, CancellationToken cancellationToken)
    {
        var state = room.Presentation;
        var speakerId = state.CurrentSpeakerStablePlayerId;
        if (state.Status != AiPresentationStatus.Running || string.IsNullOrWhiteSpace(speakerId)) return;
        var speaker = RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value).FirstOrDefault(p => RoomService.GetPlayerKey(p) == speakerId);
        if (speaker == null) { await NextAsync(room, true, cancellationToken); return; }
        await AddSystemAsync(room, $"Now speaking: {speaker.Name}.", $"presentation:speaker:{room.PublicRevealRevision}:{speakerId}", cancellationToken);
        if (!speaker.IsAi) return; // Humans retain their normal reveal and speech controls.

        var key = state.CharacteristicKey!;
        var result = reveal.RevealAiPresentation(room, speaker, speakerId, key, presentationAuthorized: true);
        if (result.Success)
        {
            var data = PublicData(speaker, key);
            await synchronization.DispatchAsync(room, speaker, result, data, cancellationToken);
            await AddSystemAsync(room, $"{speaker.Name} revealed {key}.", $"presentation:reveal:{result.RevealRevision}:{speakerId}:{key}", cancellationToken);
        }
        else if (result.ErrorCode != "already_revealed") return;

        var companion = chat.GetCompanions(room.Id).FirstOrDefault(x => x.PlayerStableId == speakerId);
        if (companion == null) return;
        var generationToken = state.GenerationToken;
        var source = _cancellations.AddOrUpdate(room.Id, _ => CancellationTokenSource.CreateLinkedTokenSource(cancellationToken), (_, old) => { old.Cancel(); old.Dispose(); return CancellationTokenSource.CreateLinkedTokenSource(cancellationToken); });
        try
        {
            await hub.Clients.Group(room.Id).SendAsync("RoomChatAiStatus", new { playerStableId = speakerId, name = speaker.Name, state = "typing" }, source.Token);
            var reply = await provider.GenerateReplyAsync(context.Build(room, companion, chat.GetHistory(room.Id)), source.Token);
            if (room.Presentation.Status != AiPresentationStatus.Running || room.Presentation.GenerationToken != generationToken || room.Presentation.CurrentSpeakerStablePlayerId != speakerId) return;
            if (string.IsNullOrWhiteSpace(reply.Text)) { room.Presentation.LastGenerationError = reply.ErrorCode ?? "ai_empty_response"; await PublishStateAsync(room, cancellationToken); return; }
            var message = chat.AddAiMessage(room.Id, companion, reply.Text);
            await hub.Clients.Group(room.Id).SendAsync("RoomChatMessageReceived", message, cancellationToken);
            await NextAsync(room, false, cancellationToken);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { logger.LogError(ex, "AI presentation generation failed for {RoomId}", room.Id); room.Presentation.LastGenerationError = "ai_provider_failed"; await PublishStateAsync(room, cancellationToken); }
        finally { await hub.Clients.Group(room.Id).SendAsync("RoomChatAiStatus", new { playerStableId = speakerId, name = speaker.Name, state = "idle" }, CancellationToken.None); }
    }

    private async Task AddSystemAsync(Room room, string text, string eventId, CancellationToken token)
    {
        var message = chat.AddSystemMessage(room.Id, text, eventId);
        await hub.Clients.Group(room.Id).SendAsync("RoomChatMessageReceived", message, token);
    }
    private Task PublishStateAsync(Room room, CancellationToken token) => hub.Clients.Group(room.Id).SendAsync("AiPresentationUpdated", new { room.Presentation.Status, room.Presentation.CharacteristicKey, room.Presentation.CurrentSpeakerStablePlayerId, room.Presentation.LastGenerationError }, token);
    private void Cancel(string roomId) { if (_cancellations.TryRemove(roomId, out var source)) { source.Cancel(); source.Dispose(); } }
    private static object PublicData(Player p, string key) => new { label = key, value = key switch { "Profession" => p.Profession?.Name, "Hobby" => p.Hobby?.Name, "CharacterTrait" => p.CharacterTrait?.Name, "Phobia" => p.Phobia?.Name, "Fact" => p.Fact?.Name, "PhysicalHealth" => p.PhysicalHealth?.Name, "MentalHealth" => p.MentalHealth?.Name, "Inventory" => string.Join(", ", p.Inventory?.Items?.Select(x => x.Name) ?? []), _ => key } };
}
