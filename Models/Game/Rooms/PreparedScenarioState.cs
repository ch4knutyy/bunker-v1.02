namespace Bunker.Models;

/// <summary>
/// Server-authoritative scenario selected in the lobby for a Developer-host preview.
/// Content details never belong in the public lobby projection.
/// </summary>
public sealed class PreparedScenarioState
{
	public string ApocalypseId { get; init; } = "";
	public string BunkerId { get; init; } = "";
	public string GenerationId { get; init; } = Guid.NewGuid().ToString("N");
	public DateTimeOffset PreparedAtUtc { get; init; } = DateTimeOffset.UtcNow;
	public string Status { get; set; } = "Prepared";
	public string SelectionFingerprint { get; init; } = "";
}

public sealed record PreparedScenarioPreviewDto(
	string GenerationId,
	DateTimeOffset PreparedAtUtc,
	string Status,
	object? Apocalypse,
	object? Bunker);
