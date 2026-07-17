using Microsoft.AspNetCore.Mvc;

namespace Bunker.Controllers
{
	public class SpyController : Controller
	{
		[HttpGet("/Spy")]
		[HttpGet("/Spy/Index")]
		public IActionResult Index()
		{
			return View();
		}

		[HttpGet("/spy/{roomCode}")]
		public IActionResult Room(string roomCode)
		{
			ViewData["InviteSpyRoomCode"] = roomCode;
			return View("Index");
		}
	}
}
