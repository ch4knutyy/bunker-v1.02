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
    AiPresentationCharacteristicSelector characteristicSelector,
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
        if (room.State != RoomState.Playing || room.CurrentPhase != GamePhase.RoundReveal || participants.Count == 0 ||
            !string.Equals(characteristicKey, "Auto", StringComparison.OrdinalIgnoreCase) &&
            !GmPlayerStateMutator.PublicCharacteristicKeys.Contains(characteristicKey, StringComparer.Ordinal))
            return false;

        lock (room.SnapshotSyncRoot)
        {
            if (room.Presentation.Status is AiPresentationStatus.Running or AiPresentationStatus.Paused ||
                room.Presentation.RoundNumber == room.CurrentRound &&
                room.Presentation.Status is (AiPresentationStatus.ReadyForDiscussion or AiPresentationStatus.Discussion)) return false;
            var automaticSelection = string.Equals(characteristicKey, "Auto", StringComparison.OrdinalIgnoreCase);
            if (!room.ProfessionPresentationCompleted) characteristicKey = "Profession";
            else if (automaticSelection)
                characteristicKey = characteristicSelector.Select(room, participants);
            room.Presentation = new AiPresentationState
            {
                Status = AiPresentationStatus.Running,
                CharacteristicKey = characteristicKey,
                UsesAutomaticCharacteristicSelection = automaticSelection && room.ProfessionPresentationCompleted,
                ParticipantStablePlayerIds = participants,
                CurrentIndex = 0,
                CurrentSpeakerStablePlayerId = participants[0],
                CurrentSpeakerStatus = "Waiting",
                GenerationToken = room.Presentation.GenerationToken + 1,
                PresentationId = ++room.NextPresentationId,
                RoundNumber = room.CurrentRound
            };
        }
        await AddSystemAsync(room, "Presentation started.", "presentation_started", new Dictionary<string, string> { ["characteristic"] = characteristicKey }, PresentationEventId(room, "start"), cancellationToken);
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
            room.Presentation.CurrentSpeakerStatus = "Paused";
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
            room.Presentation.CurrentSpeakerStatus = "Waiting";
            room.Presentation.GenerationToken++;
        }
        await PublishStateAsync(room, cancellationToken);
        await PresentCurrentAsync(room, cancellationToken);
        return true;
    }

    public async Task<bool> NextAsync(Room room, bool skipped, CancellationToken cancellationToken)
    {
        string? skippedId;
        lock (room.SnapshotSyncRoot)
        {
            if (room.Presentation.Status != AiPresentationStatus.Running) return false;
            skippedId = room.Presentation.CurrentSpeakerStablePlayerId;
            if (string.IsNullOrWhiteSpace(skippedId)) return false;
            room.Presentation.CompletedSpeakerStablePlayerIds.Add(skippedId);
            room.Presentation.CurrentSpeakerStatus = skipped ? "Skipped" : "Finished";
            room.Presentation.GenerationToken++;
            room.Presentation.CurrentIndex++;
            if (room.Presentation.CurrentIndex >= room.Presentation.ParticipantStablePlayerIds.Count)
            {
                room.Presentation.Status = AiPresentationStatus.ReadyForDiscussion;
                room.Presentation.CurrentSpeakerStablePlayerId = null;
            }
            else
            {
                room.Presentation.CurrentSpeakerStablePlayerId = room.Presentation.ParticipantStablePlayerIds[room.Presentation.CurrentIndex];
                room.Presentation.CurrentSpeakerStatus = "Waiting";
            }
        }
        Cancel(room.Id);
        if (skipped && skippedId != null) await AddSystemAsync(room, "Speaker skipped.", "presentation_skipped", new Dictionary<string, string> { ["playerId"] = skippedId }, PresentationEventId(room, $"skip:{skippedId}"), cancellationToken);
        await PublishStateAsync(room, cancellationToken);
        if (room.Presentation.Status == AiPresentationStatus.ReadyForDiscussion)
        {
            if (room.Presentation.CharacteristicKey == "Profession") room.ProfessionPresentationCompleted = true;
            await AddSystemAsync(room, "Presentations complete. GM may start discussion.", "presentations_complete", null, PresentationEventId(room, "complete"), cancellationToken);
        }
        else await PresentCurrentAsync(room, cancellationToken);
        return true;
    }

    public async Task<bool> CompleteHumanTurnAsync(Room room, string stablePlayerId, CancellationToken cancellationToken)
    {
        var isCurrentHuman = false;
        lock (room.SnapshotSyncRoot)
        {
            if (room.Presentation.Status != AiPresentationStatus.Running ||
                !string.Equals(room.Presentation.CurrentSpeakerStablePlayerId, stablePlayerId, StringComparison.OrdinalIgnoreCase) ||
                room.Presentation.CompletedSpeakerStablePlayerIds.Contains(stablePlayerId)) return false;
            isCurrentHuman = RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value)
                .Any(player => !player.IsAi && string.Equals(RoomService.GetPlayerKey(player), stablePlayerId, StringComparison.OrdinalIgnoreCase));
        }
        return isCurrentHuman && await NextAsync(room, false, cancellationToken);
    }

    public async Task<bool> BeginDiscussionAsync(Room room, CancellationToken cancellationToken)
    {
        lock (room.SnapshotSyncRoot)
        {
            if (room.Presentation.Status != AiPresentationStatus.ReadyForDiscussion) return false;
            room.Presentation.Status = AiPresentationStatus.Discussion;
            room.Presentation.CurrentSpeakerStatus = "Discussion";
            room.Presentation.GenerationToken++;
        }
        await AddSystemAsync(room, "Discussion started.", "discussion_started", null, PresentationEventId(room, "discussion"), cancellationToken);
        await PublishStateAsync(room, cancellationToken);
        return true;
    }

    public void CancelRoom(string roomId) => Cancel(roomId);

    public async Task<bool> EndAsync(Room room, CancellationToken cancellationToken)
    {
        lock (room.SnapshotSyncRoot)
        {
            if (room.Presentation.Status is AiPresentationStatus.Inactive or AiPresentationStatus.Discussion or AiPresentationStatus.ReadyForDiscussion) return false;
            room.Presentation.Status = AiPresentationStatus.ReadyForDiscussion;
            room.Presentation.CurrentSpeakerStablePlayerId = null;
            room.Presentation.CurrentSpeakerStatus = "Finished";
            room.Presentation.GenerationToken++;
        }
        Cancel(room.Id);
        if (room.Presentation.CharacteristicKey == "Profession") room.ProfessionPresentationCompleted = true;
        await AddSystemAsync(room, "Presentations ended. GM may start discussion.", "presentations_complete", null, PresentationEventId(room, "complete"), cancellationToken);
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
        if (state.CompletedSpeakerStablePlayerIds.Contains(speakerId)) return;
        var speaker = RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value).FirstOrDefault(p => RoomService.GetPlayerKey(p) == speakerId);
        if (speaker == null) { await NextAsync(room, true, cancellationToken); return; }
        await AddSystemAsync(room, "Now speaking.", "presentation_speaker", new Dictionary<string, string> { ["playerId"] = speakerId, ["name"] = speaker.Name }, PresentationEventId(room, $"speaker:{speakerId}"), cancellationToken);
        if (!speaker.IsAi)
        {
            lock (room.SnapshotSyncRoot) room.Presentation.CurrentSpeakerStatus = "WaitingForHuman";
            await PublishStateAsync(room, cancellationToken);
            return;
        }

        lock (room.SnapshotSyncRoot) room.Presentation.CurrentSpeakerStatus = "Revealing";
        await PublishStateAsync(room, cancellationToken);

        var key = state.UsesAutomaticCharacteristicSelection
            ? state.SelectedCharacteristicKeysByPlayer.GetValueOrDefault(speakerId) ?? characteristicSelector.SelectForPlayer(room, speaker, state.SelectedCharacteristicKeys)
            : state.CharacteristicKey;
        if (string.IsNullOrWhiteSpace(key))
        {
            await AddSystemAsync(room, "No characteristic is available.", "presentation_no_characteristic", new Dictionary<string, string> { ["playerId"] = speakerId, ["name"] = speaker.Name }, PresentationEventId(room, $"no-choice:{speakerId}"), cancellationToken);
            await NextAsync(room, false, cancellationToken);
            return;
        }
        if (state.UsesAutomaticCharacteristicSelection)
        {
            state.CharacteristicKey = key;
            if (state.SelectedCharacteristicKeysByPlayer.TryAdd(speakerId, key))
            {
                state.SelectedCharacteristicKeys.Add(key);
                await AddSystemAsync(room, "AI selected a characteristic.", "ai_characteristic_selected", new Dictionary<string, string> { ["playerId"] = speakerId, ["name"] = speaker.Name, ["characteristic"] = key }, PresentationEventId(room, $"choice:{speakerId}:{key}"), cancellationToken);
                await PublishStateAsync(room, cancellationToken);
            }
        }
        var result = reveal.RevealAiPresentation(room, speaker, speakerId, key, presentationAuthorized: true);
        if (result.Success)
        {
            var data = PublicData(speaker, key);
            await synchronization.DispatchAsync(room, speaker, result, data, cancellationToken);
            await AddSystemAsync(room, "Characteristic revealed.", "characteristic_revealed", new Dictionary<string, string> { ["playerId"] = speakerId, ["name"] = speaker.Name, ["characteristic"] = key, ["value"] = PublicValue(speaker, key) }, PresentationEventId(room, $"reveal:{speakerId}:{key}"), cancellationToken);
        }
        else if (result.ErrorCode != "already_revealed")
        {
            lock (room.SnapshotSyncRoot)
            {
                room.Presentation.LastGenerationError = result.ErrorCode ?? "characteristic_reveal_failed";
                room.Presentation.CurrentSpeakerStatus = "Failed";
            }
            await PublishStateAsync(room, cancellationToken);
            return;
        }

        var companion = chat.GetCompanions(room.Id).FirstOrDefault(x => x.PlayerStableId == speakerId);
        if (companion == null)
        {
            lock (room.SnapshotSyncRoot)
            {
                room.Presentation.LastGenerationError = "ai_companion_missing";
                room.Presentation.CurrentSpeakerStatus = "Failed";
            }
            await PublishStateAsync(room, cancellationToken);
            return;
        }
        var generationToken = state.GenerationToken;
        var correlationId = $"{room.Id}:{room.Presentation.PresentationId}:{speakerId}:{generationToken}";
        var source = _cancellations.AddOrUpdate(room.Id, _ => CancellationTokenSource.CreateLinkedTokenSource(cancellationToken), (_, old) => { old.Cancel(); old.Dispose(); return CancellationTokenSource.CreateLinkedTokenSource(cancellationToken); });
        try
        {
            lock (room.SnapshotSyncRoot) room.Presentation.CurrentSpeakerStatus = "Generating";
            await PublishStateAsync(room, cancellationToken);
            await hub.Clients.Group(room.Id).SendAsync("RoomChatAiStatus", new { playerStableId = speakerId, name = speaker.Name, state = "typing" }, source.Token);
            var reply = await provider.GenerateReplyAsync(companion, context.Build(room, companion, chat.GetHistory(room.Id)), source.Token);
            if (room.Presentation.Status != AiPresentationStatus.Running || room.Presentation.GenerationToken != generationToken || room.Presentation.CurrentSpeakerStablePlayerId != speakerId) return;
            if (string.IsNullOrWhiteSpace(reply.Text))
            {
                lock (room.SnapshotSyncRoot)
                {
                    room.Presentation.LastGenerationError = reply.ErrorCode ?? "ai_empty_response";
                    room.Presentation.CurrentSpeakerStatus = "Failed";
                }
                logger.LogWarning("AI presentation failed {RoomId} {PlayerId} {Provider} {Model} {Phase} {TurnId} {CorrelationId} {Error}", room.Id, speakerId, companion.Provider, companion.Model, room.CurrentPhase, room.Presentation.PresentationId, correlationId, reply.ErrorCode);
                await PublishStateAsync(room, cancellationToken);
                return;
            }
            var message = chat.AddAiMessage(room.Id, companion, reply.Text);
            await hub.Clients.Group(room.Id).SendAsync("RoomChatMessageReceived", message, cancellationToken);
            lock (room.SnapshotSyncRoot) room.Presentation.CurrentSpeakerStatus = "Finished";
            await NextAsync(room, false, cancellationToken);
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            logger.LogError(ex, "AI presentation generation failed {RoomId} {PlayerId} {Provider} {Model} {Phase} {TurnId} {CorrelationId}", room.Id, speakerId, companion.Provider, companion.Model, room.CurrentPhase, room.Presentation.PresentationId, correlationId);
            lock (room.SnapshotSyncRoot)
            {
                room.Presentation.LastGenerationError = "ai_provider_failed";
                room.Presentation.CurrentSpeakerStatus = "Failed";
            }
            await PublishStateAsync(room, cancellationToken);
        }
        finally { await hub.Clients.Group(room.Id).SendAsync("RoomChatAiStatus", new { playerStableId = speakerId, name = speaker.Name, state = "idle" }, CancellationToken.None); }
    }

    private async Task AddSystemAsync(Room room, string text, string eventType, IReadOnlyDictionary<string, string>? eventData, string eventId, CancellationToken token)
    {
        if (chat.TryAddSystemMessage(room.Id, text, eventId, eventType, eventData, out var message))
            await hub.Clients.Group(room.Id).SendAsync("RoomChatMessageReceived", message, token);
    }
    private Task PublishStateAsync(Room room, CancellationToken token) => hub.Clients.Group(room.Id).SendAsync("AiPresentationUpdated", new
    {
        room.Presentation.Status,
        room.Presentation.CharacteristicKey,
        room.Presentation.UsesAutomaticCharacteristicSelection,
        room.Presentation.CurrentSpeakerStablePlayerId,
        room.Presentation.LastGenerationError,
        room.Presentation.CurrentSpeakerStatus,
        room.Presentation.CurrentIndex,
        room.Presentation.RoundNumber,
        participantCount = room.Presentation.ParticipantStablePlayerIds.Count,
        completedCount = room.Presentation.CompletedSpeakerStablePlayerIds.Count
    }, token);
    private void Cancel(string roomId) { if (_cancellations.TryRemove(roomId, out var source)) { source.Cancel(); source.Dispose(); } }
    private static string PresentationEventId(Room room, string eventName) => $"presentation:{room.GameRunId}:{room.Presentation.PresentationId}:{eventName}";
    private static object PublicData(Player p, string key) => new
    {
        label = key,
        value = PublicValue(p, key)
    };

    private static string PublicValue(Player p, string key) => key switch
    {
        "Personality" => $"{p.Personality?.Age}; {p.Personality?.Sex}; {p.Personality?.SexOrientation}",
        "Body" => $"{p.Body?.Height}; {p.Body?.Weight}; {p.Body?.BodyType}",
        "Profession" => p.Profession?.Name ?? "",
        "Hobby" => p.Hobby?.Name ?? "",
        "CharacterTrait" => p.CharacterTrait?.Name ?? "",
        "Phobia" => p.Phobia?.Name ?? "",
        "Fact" => p.Fact?.Name ?? "",
        "PhysicalHealth" => p.PhysicalHealth?.Name ?? "",
        "MentalHealth" => p.MentalHealth?.Name ?? "",
        "Inventory" => string.Join(", ", p.Inventory?.Items?.Select(x => x.Name) ?? []),
        "Property" => p.Property?.GetDisplayText("uk") ?? "",
        _ => ""
    };
}
