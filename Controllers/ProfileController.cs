using Bunker.Data.Persistence.Identity;
using Bunker.Models.ViewModels.Account;
using Bunker.Services.Profile;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Bunker.Controllers;

[Authorize]
[Route("profile")]
public sealed class ProfileController : Controller
{
	private readonly UserManager<ApplicationUser> _userManager;
	private readonly IProfileGameHistoryService _gameHistoryService;

	public ProfileController(
		UserManager<ApplicationUser> userManager,
		IProfileGameHistoryService gameHistoryService)
	{
		_userManager = userManager;
		_gameHistoryService = gameHistoryService;
	}

	[HttpGet("")]
	public async Task<IActionResult> Index()
	{
		var user = await _userManager.GetUserAsync(User);
		if (user is null)
		{
			return Challenge();
		}

		var overview = await _gameHistoryService.GetOverviewAsync(user.Id, recentCount: 8);

		return View(new ProfileViewModel
		{
			DisplayName = user.DisplayName,
			Email = user.Email ?? string.Empty,
			CreatedAtUtc = user.CreatedAtUtc,
			Statistics = overview.Statistics,
			RecentGames = overview.RecentGames
		});
	}

	[HttpGet("history")]
	public async Task<IActionResult> History(int page = 1)
	{
		var user = await _userManager.GetUserAsync(User);
		if (user is null)
		{
			return Challenge();
		}

		const int pageSize = 20;
		var history = await _gameHistoryService.GetHistoryAsync(user.Id, page, pageSize);

		return View(new ProfileGameHistoryPageViewModel
		{
			Items = history.Items,
			CurrentPage = history.CurrentPage,
			TotalPages = history.TotalPages,
			TotalItems = history.TotalItems,
			HasPreviousPage = history.HasPreviousPage,
			HasNextPage = history.HasNextPage
		});
	}

	[HttpGet("edit")]
	public async Task<IActionResult> Edit()
	{
		var user = await _userManager.GetUserAsync(User);
		if (user is null)
		{
			return Challenge();
		}

		return View(new EditProfileViewModel { DisplayName = user.DisplayName });
	}

	[HttpPost("edit")]
	[ValidateAntiForgeryToken]
	public async Task<IActionResult> Edit(EditProfileViewModel model)
	{
		model.DisplayName = model.DisplayName.Trim();
		if (model.DisplayName.Length is < 2 or > 32)
		{
			ModelState.AddModelError(nameof(model.DisplayName), "Ім’я має містити від 2 до 32 символів.");
		}

		if (!ModelState.IsValid)
		{
			return View(model);
		}

		var user = await _userManager.GetUserAsync(User);
		if (user is null)
		{
			return Challenge();
		}

		user.DisplayName = model.DisplayName;
		var result = await _userManager.UpdateAsync(user);
		if (!result.Succeeded)
		{
			foreach (var error in result.Errors)
			{
				ModelState.AddModelError(string.Empty, error.Description);
			}

			return View(model);
		}

		TempData["ProfileUpdated"] = "Ім’я профілю оновлено.";
		return RedirectToAction(nameof(Index));
	}
}
