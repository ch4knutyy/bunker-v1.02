using Bunker.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bunker.Controllers;

[Authorize(Policy = "DeveloperOnly")]
[Route("ai-arena")]
public sealed class AiArenaController(AiTrainingArenaService arenas) : Controller
{
    [HttpGet("")]
    public IActionResult Index() => View();

    [HttpGet("export/{id}")]
    public IActionResult Export(string id)
    {
        try { return File(arenas.Export(id), "application/zip", $"ai-training-arena-{id}.zip"); }
        catch (FileNotFoundException) { return NotFound(); }
    }
}
