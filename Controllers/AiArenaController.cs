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
}
