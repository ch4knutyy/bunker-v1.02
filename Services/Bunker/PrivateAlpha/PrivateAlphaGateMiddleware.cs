using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Bunker.Services.PrivateAlpha;

/// <summary>
/// A separate, site-wide alpha admission gate. Existing account authentication
/// and room/GM authorization remain unchanged.
/// This must run BEFORE static files, MVC endpoints and SignalR hubs.
/// </summary>
public sealed class PrivateAlphaGateMiddleware
{
    private static readonly PathString LoginPath = new("/alpha-access");
    private readonly RequestDelegate _next;

    public PrivateAlphaGateMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, IOptions<PrivateAlphaOptions> options)
    {
        var config = options.Value;
        if (!config.Enabled || context.Request.Path.Equals(LoginPath, StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        var ticket = await context.AuthenticateAsync(PrivateAlphaOptions.AuthenticationScheme);
        if (ticket.Succeeded && config.HasValidSession(ticket.Principal))
        {
            await _next(context);
            return;
        }

        context.Response.Headers.CacheControl = "no-store";
        // Browser top-level navigation gets the friendly password page.
        // API, static asset and both SignalR hub requests fail with HTTP 401.
        if (HttpMethods.IsGet(context.Request.Method) &&
            context.Request.Headers.Accept.ToString().Contains("text/html", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.Redirect(LoginPath.Value!);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
    }
}
