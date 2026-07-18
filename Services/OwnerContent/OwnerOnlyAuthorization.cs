using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;

namespace Bunker.Services.OwnerContent;

public sealed class OwnerOnlyRequirement : IAuthorizationRequirement;

public sealed class OwnerOnlyAuthorizationHandler : AuthorizationHandler<OwnerOnlyRequirement>
{
	private readonly IOptionsMonitor<OwnerAccessOptions> _ownerOptions;
	private readonly IOptionsMonitor<ContentEditorOptions> _editorOptions;

	public OwnerOnlyAuthorizationHandler(
		IOptionsMonitor<OwnerAccessOptions> ownerOptions,
		IOptionsMonitor<ContentEditorOptions> editorOptions)
	{
		_ownerOptions = ownerOptions;
		_editorOptions = editorOptions;
	}

	protected override Task HandleRequirementAsync(
		AuthorizationHandlerContext context,
		OwnerOnlyRequirement requirement)
	{
		if (!_editorOptions.CurrentValue.Enabled ||
			!_ownerOptions.CurrentValue.TryGetOwnerId(out var configuredOwnerId))
		{
			return Task.CompletedTask;
		}

		var claimValue = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
		if (context.User.Identity?.IsAuthenticated == true &&
			Guid.TryParse(claimValue, out var currentUserId) &&
			currentUserId == configuredOwnerId)
		{
			context.Succeed(requirement);
		}

		return Task.CompletedTask;
	}
}
