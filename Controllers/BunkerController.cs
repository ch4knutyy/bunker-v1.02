using Microsoft.AspNetCore.Mvc;

namespace Bunker.Controllers
{
	public class BunkerController : Controller
	{
		public IActionResult Index()
		{
			return View();
		}

		[HttpGet("/room/{roomId}")]
		public IActionResult Room(string roomId)
		{
			ViewData["InviteRoomId"] = roomId;
			return View("Index");
		}
	}
}
