using System.Text.Json;
using System.Text.RegularExpressions;
using System.Text.Encodings.Web;
using Bunker.Models;

namespace Bunker.Services;

public sealed class PostGameStoryResultParser
{
	private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
	private static readonly Regex Html = new("<\\s*/?\\s*(script|iframe|style|a|img|object|embed|[^>\\s]+)[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);

	public PostGameStoryValidationResult ParseAndValidate(string rawResult, string expectedMode, Room room)
	{
		var errors = new List<string>();
		var warnings = new List<string>();
		if (string.IsNullOrWhiteSpace(rawResult) || rawResult.Length > 100_000)
			return Invalid("story_result_empty_or_too_large");
		var json = StripFence(rawResult.Trim());
		PostGameStoryEntry? entry;
		bool hasSchemaVersion;
		try
		{
			using var document = JsonDocument.Parse(json);
			hasSchemaVersion = document.RootElement.TryGetProperty("schemaVersion", out _) || document.RootElement.TryGetProperty("SchemaVersion", out _);
			entry = JsonSerializer.Deserialize<PostGameStoryEntry>(json, JsonOptions);
		}
		catch (JsonException exception)
		{
			var line = (exception.LineNumber ?? 0) + 1;
			var position = (exception.BytePositionInLine ?? 0) + 1;

			return new PostGameStoryValidationResult(
				false,
				null,
				[
					"story_json_invalid",
			$"JSON-помилка: рядок {line}, позиція {position}.",
			exception.Message
				],
				[],
				null);
		}
		if (entry == null) return Invalid("story_json_invalid");

		if (!hasSchemaVersion || entry.SchemaVersion != 1) errors.Add("story_schema_version_invalid");
		if (!string.Equals(entry.Mode, expectedMode, StringComparison.Ordinal)) errors.Add("story_mode_mismatch");
		Required(entry.Title, "story_title_required", errors, 200);
		Required(entry.Opening, "story_opening_required", errors, 8_000);
		Required(entry.VerdictText, "story_verdict_required", errors, 2_000);
		Required(entry.FinalSummary, "story_final_summary_required", errors, 8_000);
		if (entry.SurvivalScore is < 0 or > 100) errors.Add("story_survival_score_invalid");
		if (entry.Chapters.Count is < 1 or > 8) errors.Add("story_chapters_count_invalid");
		foreach (var chapter in entry.Chapters)
		{
			Required(chapter.Title, "story_chapter_title_required", errors, 200);
			Required(chapter.Text, "story_chapter_text_required", errors, 12_000);
		}
		if (entry.SurvivorEpilogues.Count > 24 || entry.EliminatedPlayerFates.Count > 24) errors.Add("story_epilogue_count_invalid");
		foreach (var epilogue in entry.SurvivorEpilogues)
		{
			Required(epilogue.PlayerName, "story_survivor_name_required", errors, 100);
			Required(epilogue.Fate, "story_survivor_fate_required", errors, 5_000);
			if (epilogue.Role.Length > 500) errors.Add("story_survivor_role_too_large");
		}
		foreach (var fate in entry.EliminatedPlayerFates)
		{
			Required(fate.PlayerName, "story_eliminated_name_required", errors, 100);
			Required(fate.Fate, "story_eliminated_fate_required", errors, 5_000);
			if (fate.UsefulnessAssessment.Length > 2_000) errors.Add("story_eliminated_assessment_too_large");
		}
		if (entry.Strengths.Count > 20 || entry.CriticalRisks.Count > 20 || entry.ContinuationHooks.Count > 20 ||
			entry.WorldTimeline.Count > 30 || entry.KeyContributors.Count > 30 || entry.GroupLosses.Count > 30)
			errors.Add("story_list_count_invalid");
		if (entry.Strengths.Concat(entry.CriticalRisks).Concat(entry.ContinuationHooks).Concat(entry.KeyContributors).Concat(entry.GroupLosses)
			.Any(value => string.IsNullOrWhiteSpace(value) || value.Length > 2_000))
			errors.Add("story_list_item_invalid");
		foreach (var item in entry.WorldTimeline)
		{
			Required(item.Period, "story_timeline_period_required", errors, 200);
			Required(item.Event, "story_timeline_event_required", errors, 4_000);
		}
		if (ContainsHtml(entry)) errors.Add("story_html_not_allowed");

		var survivors = NarrativePlayers(room).Where(x => !x.IsEliminated).Select(x => x.Name).ToList();
		var eliminated = NarrativePlayers(room).Where(x => x.IsEliminated).Select(x => x.Name).ToList();
		ValidateUniqueNames(entry.SurvivorEpilogues.Select(x => x.PlayerName), "story_survivor_duplicate", errors);
		ValidateUniqueNames(entry.EliminatedPlayerFates.Select(x => x.PlayerName), "story_eliminated_duplicate", errors);
		if (expectedMode == PostGameStoryModes.FinalStory)
		{
			foreach (var name in survivors.Where(name => !entry.SurvivorEpilogues.Any(x => SameName(x.PlayerName, name)))) errors.Add($"story_survivor_missing:{name}");
			foreach (var name in eliminated.Where(name => !entry.EliminatedPlayerFates.Any(x => SameName(x.PlayerName, name)))) errors.Add($"story_eliminated_missing:{name}");
		}

		if (expectedMode == PostGameStoryModes.HumanityOutcome)
		{
			Required(entry.HumanityOutcome, "story_humanity_outcome_required", errors, 12_000);
			Required(entry.BunkerRole, "story_bunker_role_required", errors, 4_000);
		}
		else if (expectedMode == PostGameStoryModes.BunkerContribution)
		{
			Required(entry.BunkerContribution, "story_bunker_contribution_required", errors, 12_000);
			Required(entry.Legacy, "story_legacy_required", errors, 4_000);
		}
		else if (expectedMode == PostGameStoryModes.EliminatedFates)
		{
			foreach (var name in eliminated.Where(name => !entry.EliminatedPlayerFates.Any(x => SameName(x.PlayerName, name)))) errors.Add($"story_eliminated_missing:{name}");
			Required(entry.DecisionAssessment, "story_decision_assessment_required", errors, 5_000);
			if (entry.GroupLosses.Count == 0) errors.Add("story_group_losses_required");
		}
		if (json.Length > 75_000) errors.Add("story_entry_too_large");
		if (errors.Count > 0) return new(false, null, errors, warnings, null);
		return new(true, entry, errors, warnings, PostGameStoryPromptBuilder.Fingerprint(Canonical(entry)));
	}

	private static IEnumerable<Player> NarrativePlayers(Room room) => RoomService.GetPlayersSnapshot(room).Select(x => x.Value)
		.Where(x => !x.IsLobbySpectator && !x.IsSpectatorGm && x.GmRole != GmMode.TechnicalGm);
	private static bool SameName(string left, string right) => string.Equals(left?.Trim(), right?.Trim(), StringComparison.OrdinalIgnoreCase);
	private static void ValidateUniqueNames(IEnumerable<string> names, string error, List<string> errors)
	{
		if (names.Where(x => !string.IsNullOrWhiteSpace(x)).GroupBy(x => x.Trim(), StringComparer.OrdinalIgnoreCase).Any(x => x.Count() > 1)) errors.Add(error);
	}
	private static void Required(string? value, string code, List<string> errors, int max)
	{
		if (string.IsNullOrWhiteSpace(value)) errors.Add(code);
		else if (value.Length > max) errors.Add(code + "_too_large");
	}
	private static bool ContainsHtml(PostGameStoryEntry entry) => Html.IsMatch(Canonical(entry));
	private static string Canonical(PostGameStoryEntry entry) => JsonSerializer.Serialize(entry, JsonOptions);
	private static PostGameStoryValidationResult Invalid(string code) => new(false, null, [code], [], null);
	internal static string StripFence(string value)
	{
		value = value
			.Trim()
			.TrimStart('\uFEFF');

		if (!value.StartsWith("```", StringComparison.Ordinal))
			return value;

		var firstBreak = value.IndexOf('\n');
		var lastFence = value.LastIndexOf(
			"```",
			StringComparison.Ordinal);

		if (firstBreak < 0 || lastFence <= firstBreak)
			return value;

		return value[(firstBreak + 1)..lastFence]
			.Trim()
			.TrimStart('\uFEFF');
	}
}
