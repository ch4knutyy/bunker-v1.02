using Bunker.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bunker.Controllers;

[Authorize(Policy = "DeveloperOnly")]
[Route("ai-arena")]
public sealed class AiArenaController(AiTrainingArenaService arenas) : Controller
{
    [HttpGet("")]
    public IActionResult Index(string? session = null)
    {
        ViewData["InitialArenaId"] = session;
        return View();
    }

    [HttpGet("configuration")]
    public IActionResult Configuration() => Ok(arenas.Configuration());

    [HttpPost("check-provider")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> CheckProvider(CancellationToken cancellationToken) => Ok(await arenas.CheckProviderAsync(cancellationToken));

    [HttpPost("create")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create([FromForm] AiTrainingArenaRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var arena = await arenas.CreateAsync(request, cancellationToken);
            return Ok(new { arenaId = arena.Id, redirectUrl = $"/ai-arena?session={Uri.EscapeDataString(arena.Id)}" });
        }
        catch (InvalidOperationException exception)
        {
            return Conflict(new { error = exception.Message });
        }
    }

    [HttpGet("export/{id}")]
    public IActionResult Export(string id)
    {
        try { return File(arenas.Export(id), "application/zip", $"ai-training-arena-{id}.zip"); }
        catch (FileNotFoundException) { return NotFound(); }
    }

    [HttpGet("dataset-stats/{id}")]
    public IActionResult DatasetStatistics(string id)
    {
        try { return Ok(arenas.DatasetStatistics(id)); }
        catch (FileNotFoundException) { return NotFound(); }
    }

    [HttpGet("editor-stats/{id}")]
    public IActionResult EditorStatistics(string id)
    {
        try { return Ok(arenas.EditorStatistics(id)); }
        catch (FileNotFoundException) { return NotFound(); }
    }

    [HttpGet("export-curated")]
    public IActionResult ExportCurated(string? sessionId, DateTimeOffset? fromUtc, DateTimeOffset? toUtc,
        string? status, string? quality, string? split, int seed = 17)
    {
        try
        {
            if (split != null && split is not ("train" or "validation" or "test"))
                return BadRequest(new { error = "arena_invalid_split" });
            var data = arenas.ExportCurated(new AiTrainingExportFilter(sessionId, fromUtc, toUtc, status, quality, split, seed));
            return File(data, "application/zip", "ai-arena-curated.zip");
        }
        catch (FileNotFoundException) { return NotFound(); }
        catch (InvalidOperationException exception) when (exception.Message == "arena_export_too_large_filter_sessions")
        { return StatusCode(413, new { error = exception.Message }); }
    }

    [HttpPost("preferences")]
    [ValidateAntiForgeryToken]
    public IActionResult AddPreference([FromBody] AiTrainingPreferenceInput input)
    {
        if (input == null) return BadRequest(new { error = "arena_preference_invalid" });
        try { return Ok(arenas.AddPreference(input)); }
        catch (FileNotFoundException) { return NotFound(); }
        catch (InvalidOperationException exception) { return BadRequest(new { error = exception.Message }); }
    }

    [HttpPost("evaluate-offline")]
    [ValidateAntiForgeryToken]
    public IActionResult EvaluateOffline([FromBody] List<AiTrainingOfflinePrediction> predictions, int seed = 17)
    {
        if (predictions == null) return BadRequest(new { error = "arena_evaluation_invalid_prediction" });
        try { return Ok(arenas.EvaluateOffline(predictions, seed)); }
        catch (InvalidOperationException exception) { return BadRequest(new { error = exception.Message }); }
    }

    [HttpGet("export-raw")]
    public IActionResult ExportRaw(string? sessionId, DateTimeOffset? fromUtc, DateTimeOffset? toUtc, string? status, string? quality,
        string? split, int seed = 17, string? reviewSignal = null) =>
        ExportDataset(false, sessionId, fromUtc, toUtc, status, quality, split, seed, reviewSignal);

    [HttpGet("export-sft")]
    public IActionResult ExportSft(string? sessionId, DateTimeOffset? fromUtc, DateTimeOffset? toUtc, string? status, string? quality,
        string? split, int seed = 17, string? reviewSignal = null) =>
        ExportDataset(true, sessionId, fromUtc, toUtc, status, quality, split, seed, reviewSignal);

    private IActionResult ExportDataset(bool sft, string? sessionId, DateTimeOffset? fromUtc, DateTimeOffset? toUtc, string? status,
        string? quality, string? split, int seed, string? reviewSignal)
    {
        try
        {
            if (split != null && split is not ("train" or "validation" or "test"))
                return BadRequest(new { error = "arena_invalid_split" });
            var data = arenas.ExportDataset(sft, new AiTrainingExportFilter(sessionId, fromUtc, toUtc, status, quality,
                split, seed, reviewSignal));
            return File(data, "application/zip", sft ? "ai-arena-sft.zip" : "ai-arena-raw.zip");
        }
        catch (FileNotFoundException) { return NotFound(); }
        catch (InvalidOperationException exception) when (exception.Message == "arena_export_too_large_filter_sessions")
        { return StatusCode(413, new { error = exception.Message }); }
    }
}
