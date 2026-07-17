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
		[HttpGet("/Home/Game")]
		public IActionResult Game()
		{
			return RedirectToAction("Index", "Bunker");
		}

		[HttpGet("/play")]
		[HttpGet("/Home/Play")]
		public IActionResult Play()
		{
			return RedirectToAction("Index", "Games");
		}

		[HttpGet("/rules")]
		public IActionResult Rules()
		{
			return View();
		}

		[HttpGet("/Home/Spy")]
		public IActionResult Spy()
		{
			return RedirectToAction("Index", "Spy");
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
