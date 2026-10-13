using System.Security.Claims;
using Bunker.Services.PrivateAlpha;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Bunker.Controllers;

[AllowAnonymous]
[Route("alpha-access")]
public sealed class PrivateAlphaController : Controller
{
    private readonly PrivateAlphaOptions _options;

    public PrivateAlphaController(IOptions<PrivateAlphaOptions> options) => _options = options.Value;

    [HttpGet("")]
    public async Task<IActionResult> Index()
    {
        if (!_options.Enabled) return Redirect("/");
        var ticket = await HttpContext.AuthenticateAsync(PrivateAlphaOptions.AuthenticationScheme);
        if (ticket.Succeeded && _options.HasValidSession(ticket.Principal)) return Redirect("/");
        Response.Headers.CacheControl = "no-store";
        Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        return View();
    }

    [HttpPost("")]
    [ValidateAntiForgeryToken]
    [EnableRateLimiting("private-alpha-login")]
    public async Task<IActionResult> Enter([FromForm] string? password)
    {
        if (!_options.Enabled) return Redirect("/");
        Response.Headers.CacheControl = "no-store";
        Response.Headers["X-Robots-Tag"] = "noindex, nofollow";

        if (!_options.VerifyPassword(password))
        {
            Response.StatusCode = StatusCodes.Status401Unauthorized;
            ViewData["InvalidPassword"] = true;
            return View("Index");
        }

        var identity = new ClaimsIdentity(
            [new Claim(PrivateAlphaOptions.VersionClaim, _options.SessionVersion)],
            PrivateAlphaOptions.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);
        await HttpContext.SignInAsync(
            PrivateAlphaOptions.AuthenticationScheme,
            principal,
            new AuthenticationProperties
            {
                IsPersistent = true,
                ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7)
            });

        return Redirect("/");
    }
}
