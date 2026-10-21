using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Bunker.Services;

public sealed record AiTrainingEditorBatch(string Key, string SessionId, int Round, string EditorVersion,
	string Status, int Selected, int Processed, int InputTokens, int OutputTokens, string? ErrorCode, DateTimeOffset AtUtc);
public sealed record AiTrainingEnhancement(string RawDecisionId, string SessionId, string EditorVersion,
	string OriginalSha256, string Provider, string Model, string PromptVersion, string SchemaVersion,
	string? RewrittenSpeech, double? LanguageScore, double? StrategicScore, string Status,
	string? ErrorCode, DateTimeOffset AtUtc);

public sealed partial class AiTrainingDatasetStore
{
	private string EditorBatchesPath(string id) => Path.Combine(SessionPath(id), "editor-batches.jsonl");
	private string EnhancementsPath(string id) => Path.Combine(SessionPath(id), "enhancements.jsonl");
	public IReadOnlyList<AiTrainingEditorBatch> ReadEditorBatches(string id) =>
		File.Exists(EditorBatchesPath(id)) ? ReadLines<AiTrainingEditorBatch>(EditorBatchesPath(id)).ToArray() : [];
	public IReadOnlyList<AiTrainingEnhancement> ReadEnhancements(string id) =>
		File.Exists(EnhancementsPath(id)) ? ReadLines<AiTrainingEnhancement>(EnhancementsPath(id)).ToArray() : [];
	public bool HasEditorBatch(string id, string key) => ReadEditorBatches(id).Any(item => item.Key == key);
	public void AppendEditorBatch(AiTrainingEditorBatch value) => Append(value.SessionId, "editor-batches.jsonl", value);
	public void AppendEnhancement(AiTrainingEnhancement value)
	{
		lock (WriteGate(value.SessionId))
		{
			if (ReadEnhancements(value.SessionId).Any(item => item.RawDecisionId == value.RawDecisionId &&
				item.EditorVersion == value.EditorVersion)) return;
			Append(value.SessionId, "enhancements.jsonl", value);
		}
	}
	public AiTrainingEnhancement? CuratedVersion(string sessionId, string decisionId) =>
		ReadEnhancements(sessionId).Where(item => item.RawDecisionId == decisionId && item.Status == "Completed")
			.OrderByDescending(item => item.AtUtc).FirstOrDefault();
	public object EditorStatistics(string id)
	{
		if (!Directory.Exists(SessionPath(id))) throw new FileNotFoundException("arena_not_found");
		var batches = ReadEditorBatches(id).GroupBy(item => item.Key).Select(group => group.Last()).ToArray();
		var enhancements = ReadEnhancements(id);
		return new { pending = batches.Count(item => item.Status is "Pending" or "Processing"),
			completed = batches.Count(item => item.Status == "Completed"),
			skipped = batches.Count(item => item.Status == "Skipped") + enhancements.Count(item => item.Status == "Skipped"),
			rejected = enhancements.Count(item => item.Status == "Rejected"),
			failed = batches.Count(item => item.Status == "Failed") + enhancements.Count(item => item.Status == "Failed"),
			improvements = enhancements.Count(item => item.Status == "Completed"),
			requiresReview = enhancements.Count(item => item.Status == "RequiresReview"),
			inputTokens = batches.Sum(item => item.InputTokens), outputTokens = batches.Sum(item => item.OutputTokens) };
	}
	public void RecoverEditorBatches()
	{
		var root = Path.Combine(_root, "sessions");
		if (!Directory.Exists(root)) return;
		foreach (var directory in Directory.GetDirectories(root))
		{
			var id = Path.GetFileName(directory);
			foreach (var batch in ReadEditorBatches(id).GroupBy(item => item.Key).Select(group => group.Last())
				.Where(item => item.Status is "Pending" or "Processing"))
				AppendEditorBatch(batch with { Status = "Failed", ErrorCode = "interrupted_restart", AtUtc = DateTimeOffset.UtcNow });
		}
	}
	public static string OriginalSpeechHash(string speech) =>
		Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(speech))).ToLowerInvariant();
}
