using Microsoft.AspNetCore.Mvc;

namespace Bunker.Controllers
{
	public class GamesController : Controller
	{
		public IActionResult Index()
		{
			return View();
		}
	}
}
