using System.Security.Claims;
using Bunker.Services.OwnerContent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;

namespace Bunker.UnitTests;

public sealed class OwnerContentAccessTests
{
	[Fact]
	public async Task AnonymousAndAuthenticatedNonOwnerAreDeniedWhileConfiguredOwnerIsAllowed()
	{
		var ownerId = Guid.NewGuid();
		var handler = CreateHandler(ownerId.ToString(), enabled: true);

		Assert.False(await AuthorizeAsync(handler, new ClaimsPrincipal(new ClaimsIdentity())));
		Assert.False(await AuthorizeAsync(handler, Principal(Guid.NewGuid())));
		Assert.True(await AuthorizeAsync(handler, Principal(ownerId)));
	}

	[Theory]
	[InlineData(null)]
	[InlineData("")]
	[InlineData("not-a-guid")]
	[InlineData("00000000-0000-0000-0000-000000000000")]
	public async Task MissingOrInvalidOwnerConfigurationDeniesEveryAuthenticatedUser(
		string? configuredOwner)
	{
		var handler = CreateHandler(configuredOwner, enabled: true);

		Assert.False(await AuthorizeAsync(handler, Principal(Guid.NewGuid())));
	}

	[Fact]
	public async Task DisabledEditorDeniesConfiguredOwner()
	{
		var ownerId = Guid.NewGuid();
		var handler = CreateHandler(ownerId.ToString(), enabled: false);

		Assert.False(await AuthorizeAsync(handler, Principal(ownerId)));
	}

	private static OwnerOnlyAuthorizationHandler CreateHandler(
		string? ownerId,
		bool enabled)
	{
		return new OwnerOnlyAuthorizationHandler(
			new StaticOptionsMonitor<OwnerAccessOptions>(
				new OwnerAccessOptions { UserId = ownerId }),
			new StaticOptionsMonitor<ContentEditorOptions>(
				new ContentEditorOptions { Enabled = enabled }));
	}

	private static async Task<bool> AuthorizeAsync(
		IAuthorizationHandler handler,
		ClaimsPrincipal principal)
	{
		var requirement = new OwnerOnlyRequirement();
		var context = new AuthorizationHandlerContext(
			[requirement],
			principal,
			resource: null);
		await handler.HandleAsync(context);
		return context.HasSucceeded;
	}

	private static ClaimsPrincipal Principal(Guid userId)
	{
		return new ClaimsPrincipal(new ClaimsIdentity(
			[new Claim(ClaimTypes.NameIdentifier, userId.ToString())],
			"Test"));
	}

	private sealed class StaticOptionsMonitor<T> : IOptionsMonitor<T>
	{
		public StaticOptionsMonitor(T value)
		{
			CurrentValue = value;
		}

		public T CurrentValue { get; }
		public T Get(string? name) => CurrentValue;
		public IDisposable? OnChange(Action<T, string?> listener) => null;
	}
}
