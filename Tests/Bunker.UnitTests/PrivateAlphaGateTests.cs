using Bunker.Services.PrivateAlpha;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Bunker.UnitTests;

public sealed class PrivateAlphaGateTests
{
    [Fact]
    public async Task AnonymousVisitorsCannotReachPagesOrEitherGameHub()
    {
        var options = new PrivateAlphaOptions
        {
            Enabled = true,
            PasswordHash = new PasswordHasher<PrivateAlphaOptions>()
                .HashPassword(new PrivateAlphaOptions(), "StrongPasswordForAlpha123!")
        };
		var services = new ServiceCollection();

		services.AddLogging();
		services.AddDataProtection();

		services.AddAuthentication()
			.AddCookie(PrivateAlphaOptions.AuthenticationScheme);

		using var provider = services.BuildServiceProvider();
		var reachedApp = false;
        var gate = new PrivateAlphaGateMiddleware(_ =>
        {
            reachedApp = true;
            return Task.CompletedTask;
        });

        async Task<HttpContext> Check(string path, string accept)
        {
            var context = new DefaultHttpContext { RequestServices = provider };
            context.Request.Method = "GET";
            context.Request.Path = path;
            context.Request.Headers.Accept = accept;
            await gate.InvokeAsync(context, Options.Create(options));
            return context;
        }

        var browser = await Check("/", "text/html");
        Assert.Equal(StatusCodes.Status302Found, browser.Response.StatusCode);
        Assert.Equal("/alpha-access", browser.Response.Headers.Location.ToString());
        Assert.Equal(StatusCodes.Status401Unauthorized, (await Check("/api/ScenarioImage", "application/json")).Response.StatusCode);
        Assert.Equal(StatusCodes.Status401Unauthorized, (await Check("/gameHub", "*/*")).Response.StatusCode);
        Assert.Equal(StatusCodes.Status401Unauthorized, (await Check("/spyHub", "*/*")).Response.StatusCode);
        Assert.False(reachedApp);
    }
}
