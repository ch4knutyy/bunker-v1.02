using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Bunker.Controllers
{
	public class BunkerController(IAuthorizationService authorizationService) : Controller
	{
		public async Task<IActionResult> Index()
		{
			await SetDeveloperArenaAccessAsync();
			return View();
		}

		[HttpGet("/room/{roomId}")]
		public async Task<IActionResult> Room(string roomId)
		{
			await SetDeveloperArenaAccessAsync();
			ViewData["InviteRoomId"] = roomId;
			return View("Index");
		}

		private async Task SetDeveloperArenaAccessAsync() =>
			ViewData["CanCreateAiArena"] = (await authorizationService.AuthorizeAsync(User, "DeveloperOnly")).Succeeded;
	}
}
