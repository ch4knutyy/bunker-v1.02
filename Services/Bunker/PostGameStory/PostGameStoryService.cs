using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services;

public sealed class PostGameStoryService
{
    public const int MaxEntries = 10;
    public const int MaxPublishedCharacters = 150_000;
    public const int MaxProcessedCommandIds = 200;
    private readonly PostGameStoryPromptBuilder _promptBuilder;
    private readonly PostGameStoryResultParser _parser;
    private readonly TimeProvider _timeProvider;
    private readonly DeveloperAuthorityService _developerAuthority;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public PostGameStoryService(PostGameStoryPromptBuilder promptBuilder, PostGameStoryResultParser parser, TimeProvider timeProvider,
        DeveloperAuthorityService developerAuthority)
    {
        _promptBuilder = promptBuilder;
        _parser = parser;
        _timeProvider = timeProvider;
        _developerAuthority = developerAuthority;
    }

    public PostGameStoryHostDto Prepare(Room room, Player actor, string mode, string? parentEntryId, string commandId)
    {
        lock (room.GameSettingsSyncRoot)
        {
            EnsureEligible(room, actor, commandId);
            var state = room.PostGameStory ??= new();
            if (state.ProcessedCommandIds.Contains(commandId)) return ToHostDto(state);
            if (mode != PostGameStoryModes.FinalStory && state.PublishedEntries.Count == 0) throw new InvalidOperationException("story_initial_entry_required");
            if (state.PublishedEntries.Count >= MaxEntries) throw new InvalidOperationException("story_entry_limit_reached");
            if (!string.IsNullOrWhiteSpace(parentEntryId) && state.PublishedEntries.All(x => x.Id != parentEntryId)) throw new InvalidOperationException("story_parent_not_found");
            var prompt = _promptBuilder.Build(room, mode, parentEntryId);
            RememberCommand(state, commandId);
            var now = _timeProvider.GetUtcNow();
            state.Status = PostGameStoryStatuses.PromptReady;
            state.CurrentMode = mode;
            state.ParentEntryId = parentEntryId;
            state.GeneratedPrompt = prompt.Text;
            state.GeneratedPromptFingerprint = prompt.Fingerprint;
            state.RawResult = null;
            state.Preview = null;
            state.PreviewFingerprint = null;
            state.ValidationErrors = [];
            state.ValidationWarnings = [];
            state.CreatedAtUtc ??= now;
            state.UpdatedAtUtc = now;
            state.CreatedByPlayerId ??= RoomService.GetPlayerKey(actor);
            return ToHostDto(state);
        }
    }

    public PostGameStoryValidationResult Submit(Room room, Player actor, string rawResult, string commandId)
    {
        lock (room.GameSettingsSyncRoot)
        {
            EnsureEligible(room, actor, commandId);
            var state = room.PostGameStory ??= new();
            if (state.ProcessedCommandIds.Contains(commandId))
                return new(state.Preview != null, Clone(state.Preview), state.ValidationErrors, state.ValidationWarnings, state.PreviewFingerprint);
            if (string.IsNullOrWhiteSpace(state.CurrentMode) || string.IsNullOrWhiteSpace(state.GeneratedPromptFingerprint)) throw new InvalidOperationException("story_prompt_required");
            var result = _parser.ParseAndValidate(rawResult, state.CurrentMode, room);
            RememberCommand(state, commandId);
            state.RawResult = rawResult[..Math.Min(rawResult.Length, 100_000)];
            state.ValidationErrors = result.Errors.ToList();
            state.ValidationWarnings = result.Warnings.ToList();
            state.Preview = Clone(result.Entry);
            state.PreviewFingerprint = result.PreviewFingerprint;
            state.Status = result.IsValid ? PostGameStoryStatuses.PreviewReady : PostGameStoryStatuses.AwaitingResult;
            state.UpdatedAtUtc = _timeProvider.GetUtcNow();
            return result;
        }
    }

    public void SaveDraft(Room room, Player actor, string rawResult)
    {
        lock (room.GameSettingsSyncRoot)
        {
            EnsureEligible(room, actor, "autosave");
            var state = room.PostGameStory ??= new();
            if (string.IsNullOrWhiteSpace(state.GeneratedPromptFingerprint))
                throw new InvalidOperationException("story_prompt_required");
            state.RawResult = (rawResult ?? "")[..Math.Min((rawResult ?? "").Length, 100_000)];
            state.UpdatedAtUtc = _timeProvider.GetUtcNow();
        }
    }

    public PostGameStoryEntry Publish(Room room, Player actor, string previewFingerprint, string commandId)
    {
        lock (room.GameSettingsSyncRoot)
        {
            EnsureEligible(room, actor, commandId);
            var state = room.PostGameStory ??= new();
            if (state.PublishedCommandEntryIds.TryGetValue(commandId, out var publishedEntryId))
                return Clone(state.PublishedEntries.FirstOrDefault(entry => entry.Id == publishedEntryId)) ?? throw new InvalidOperationException("story_entry_not_found");
            if (state.ProcessedCommandIds.Contains(commandId)) throw new InvalidOperationException("story_command_conflict");
            if (state.Preview == null || string.IsNullOrWhiteSpace(state.PreviewFingerprint)) throw new InvalidOperationException("story_preview_required");
            if (!string.Equals(state.PreviewFingerprint, previewFingerprint, StringComparison.Ordinal)) throw new InvalidOperationException("story_preview_stale");
            if (state.PublishedEntries.Count >= MaxEntries) throw new InvalidOperationException("story_entry_limit_reached");
            var entry = Clone(state.Preview)!;
            entry.Id = Guid.NewGuid().ToString("N");
            entry.ParentEntryId = state.ParentEntryId;
            entry.PublishedAtUtc = _timeProvider.GetUtcNow();
            entry.PublishedByPlayerId = RoomService.GetPlayerKey(actor);
            entry.SourcePromptFingerprint = state.GeneratedPromptFingerprint ?? "";
            var projectedSize = state.PublishedEntries.Sum(x => JsonSerializer.Serialize(x).Length) + JsonSerializer.Serialize(entry).Length;
            if (projectedSize > MaxPublishedCharacters) throw new InvalidOperationException("story_total_size_limit_reached");
            RememberCommand(state, commandId);
            state.PublishedCommandEntryIds[commandId] = entry.Id;
            state.PublishedEntries.Add(entry);
            state.CurrentEntryId = entry.Id;
            state.Status = PostGameStoryStatuses.AwaitingNextChoice;
            state.Preview = null;
            state.PreviewFingerprint = null;
            state.RawResult = null;
            state.GeneratedPrompt = null;
            state.UpdatedAtUtc = entry.PublishedAtUtc;
            return Clone(entry)!;
        }
    }

    public void CancelDraft(Room room, Player actor, string commandId)
    {
        lock (room.GameSettingsSyncRoot)
        {
            EnsureEligible(room, actor, commandId);
            var state = room.PostGameStory ??= new();
            if (state.ProcessedCommandIds.Contains(commandId)) return;
            RememberCommand(state, commandId);
            state.GeneratedPrompt = null; state.GeneratedPromptFingerprint = null; state.RawResult = null;
            state.Preview = null; state.PreviewFingerprint = null; state.ValidationErrors = []; state.ValidationWarnings = [];
            state.Status = state.PublishedEntries.Count > 0 ? PostGameStoryStatuses.AwaitingNextChoice : PostGameStoryStatuses.NotStarted;
            state.CurrentMode = null; state.ParentEntryId = null; state.UpdatedAtUtc = _timeProvider.GetUtcNow();
        }
    }

    public void Finish(Room room, Player actor, string commandId)
    {
        lock (room.GameSettingsSyncRoot)
        {
            EnsureEligible(room, actor, commandId);
            var state = room.PostGameStory ??= new();
            if (state.ProcessedCommandIds.Contains(commandId)) return;
            RememberCommand(state, commandId);
            state.Status = PostGameStoryStatuses.Completed;
            state.GeneratedPrompt = null; state.RawResult = null; state.Preview = null; state.PreviewFingerprint = null;
            state.UpdatedAtUtc = _timeProvider.GetUtcNow();
        }
    }

    public PostGameStoryPublicDto ToPublicDto(PostGameStoryState? state)
    {
        state ??= new();
        return new(state.Version, state.Status, state.CurrentMode, Clone(state.PublishedEntries) ?? [], state.CurrentEntryId, WaitingState(state.Status));
    }

    public PostGameStoryHostDto ToHostDto(PostGameStoryState? state)
    {
        state ??= new();
        return new(state.Version, state.Status, state.CurrentMode, Clone(state.PublishedEntries) ?? [], state.CurrentEntryId,
            WaitingState(state.Status), state.GeneratedPrompt, state.GeneratedPromptFingerprint, state.RawResult, Clone(state.Preview), state.PreviewFingerprint,
            state.ValidationErrors.ToList(), state.ValidationWarnings.ToList());
    }

    private static string WaitingState(string status) => status switch
    {
        PostGameStoryStatuses.PromptReady or PostGameStoryStatuses.AwaitingResult => "host_preparing",
        PostGameStoryStatuses.PreviewReady => "host_previewing",
        PostGameStoryStatuses.AwaitingNextChoice or PostGameStoryStatuses.Published => "host_next_choice",
        _ => "host_deciding"
    };

    private void EnsureEligible(Room room, Player actor, string commandId)
    {
        if (!_developerAuthority.IsDeveloper(actor)) throw new UnauthorizedAccessException("developer_required");
        if (string.IsNullOrWhiteSpace(commandId) || commandId.Length > 100) throw new ArgumentException("command_id_required");
        if (room.State != RoomState.Finished || room.CurrentPhase != GamePhase.Finished || room.Completion == null) throw new InvalidOperationException("game_not_finished");
        if (!room.ApocalypseRevealed || room.Apocalypse == null) throw new InvalidOperationException("apocalypse_not_revealed");
        if (room.Bunker == null) throw new InvalidOperationException("bunker_required");
    }

    private static void RememberCommand(PostGameStoryState state, string commandId)
    {
        while (state.ProcessedCommandIds.Count >= MaxProcessedCommandIds)
        {
            var removable = state.ProcessedCommandIds.FirstOrDefault(id => !state.PublishedCommandEntryIds.ContainsKey(id));
            if (removable == null) break;
            state.ProcessedCommandIds.Remove(removable);
        }
        state.ProcessedCommandIds.Add(commandId);
    }

    private static T? Clone<T>(T? value) => value == null ? default : JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value, JsonOptions), JsonOptions);
}
