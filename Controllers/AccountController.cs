using Bunker.Data.Persistence.Identity;
using Bunker.Models.ViewModels.Account;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Bunker.Controllers;

[Route("account")]
public sealed class AccountController : Controller
{
	private readonly UserManager<ApplicationUser> _userManager;
	private readonly SignInManager<ApplicationUser> _signInManager;
	private readonly ILogger<AccountController> _logger;

	public AccountController(
		UserManager<ApplicationUser> userManager,
		SignInManager<ApplicationUser> signInManager,
		ILogger<AccountController> logger)
	{
		_userManager = userManager;
		_signInManager = signInManager;
		_logger = logger;
	}

	[AllowAnonymous]
	[HttpGet("register")]
	public IActionResult Register(string? returnUrl = null)
	{
		if (User.Identity?.IsAuthenticated == true)
		{
			return RedirectToAction("Index", "Profile");
		}

		return View(new RegisterViewModel { ReturnUrl = GetLocalReturnUrl(returnUrl) });
	}

	[AllowAnonymous]
	[HttpPost("register")]
	[ValidateAntiForgeryToken]
	public async Task<IActionResult> Register(RegisterViewModel model)
	{
		model.DisplayName = model.DisplayName.Trim();
		model.Email = model.Email.Trim();
		model.ReturnUrl = GetLocalReturnUrl(model.ReturnUrl);
		if (model.DisplayName.Length is < 2 or > 32)
		{
			ModelState.AddModelError(nameof(model.DisplayName), "Ім’я має містити від 2 до 32 символів.");
		}

		if (!ModelState.IsValid)
		{
			return View(model);
		}

		var user = new ApplicationUser
		{
			Id = Guid.NewGuid(),
			UserName = model.Email,
			Email = model.Email,
			DisplayName = model.DisplayName,
			CreatedAtUtc = DateTime.UtcNow,
			LockoutEnabled = true
		};

		var result = await _userManager.CreateAsync(user, model.Password);
		if (result.Succeeded)
		{
			_logger.LogInformation("Identity account {UserId} registered.", user.Id);
			await _signInManager.SignInAsync(user, isPersistent: false);
			return RedirectToLocal(model.ReturnUrl, "Profile", "Index");
		}

		foreach (var error in result.Errors)
		{
			ModelState.AddModelError(string.Empty, error.Description);
		}

		return View(model);
	}

	[AllowAnonymous]
	[HttpGet("login")]
	public IActionResult Login(string? returnUrl = null)
	{
		if (User.Identity?.IsAuthenticated == true)
		{
			return RedirectToAction("Index", "Profile");
		}

		return View(new LoginViewModel { ReturnUrl = GetLocalReturnUrl(returnUrl) });
	}

	[AllowAnonymous]
	[HttpPost("login")]
	[ValidateAntiForgeryToken]
	public async Task<IActionResult> Login(LoginViewModel model)
	{
		model.Email = model.Email.Trim();
		model.ReturnUrl = GetLocalReturnUrl(model.ReturnUrl);

		if (!ModelState.IsValid)
		{
			return View(model);
		}

		var result = await _signInManager.PasswordSignInAsync(
			model.Email,
			model.Password,
			model.RememberMe,
			lockoutOnFailure: true);

		if (result.Succeeded)
		{
			return RedirectToLocal(model.ReturnUrl, "Profile", "Index");
		}

		ModelState.AddModelError(
			string.Empty,
			result.IsLockedOut
				? "Акаунт тимчасово заблоковано через велику кількість невдалих спроб."
				: "Неправильний email або пароль.");

		return View(model);
	}

	[Authorize]
	[HttpPost("logout")]
	[ValidateAntiForgeryToken]
	public async Task<IActionResult> Logout()
	{
		await _signInManager.SignOutAsync();
		return RedirectToAction("Index", "Home");
	}

	[AllowAnonymous]
	[HttpGet("access-denied")]
	public IActionResult AccessDenied()
	{
		return View();
	}

	private string? GetLocalReturnUrl(string? returnUrl)
	{
		return !string.IsNullOrWhiteSpace(returnUrl) && Url.IsLocalUrl(returnUrl)
			? returnUrl
			: null;
	}

	private IActionResult RedirectToLocal(string? returnUrl, string controller, string action)
	{
		return returnUrl is not null
			? LocalRedirect(returnUrl)
			: RedirectToAction(action, controller)!;
	}
}
