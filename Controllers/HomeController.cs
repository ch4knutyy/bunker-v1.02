using Bunker.Models;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;

namespace Bunker.Controllers
{
	public class HomeController : Controller
	{
		public IActionResult Index()
		{
			return View();
		}

		[HttpGet("/game")]
		public IActionResult Game()
		{
			return View();
		}

		[HttpGet("/play")]
		public IActionResult Play()
		{
			return View();
		}

		[HttpGet("/rules")]
		public IActionResult Rules()
		{
			return View();
		}

		[HttpGet("/spy")]
		public IActionResult Spy()
		{
			return View();
		}

		[HttpGet("/spy/{roomCode}")]
		public IActionResult SpyRoom(string roomCode)
		{
			ViewData["InviteSpyRoomCode"] = roomCode;
			return View("Spy");
		}

		[HttpGet("/room/{roomId}")]
		public IActionResult Room(string roomId)
		{
			ViewData["InviteRoomId"] = roomId;
			return View("Game");
		}

		public IActionResult Privacy()
		{
			return View();
		}

		[ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
		public IActionResult Error()
		{
			return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
		}
	}
}
