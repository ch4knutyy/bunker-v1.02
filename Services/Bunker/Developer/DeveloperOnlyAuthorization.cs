using System.Security.Claims;
using Bunker.Services.OwnerContent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;

namespace Bunker.Services;

public sealed class DeveloperOnlyRequirement : IAuthorizationRequirement;

/// <summary>Authorization policy for developer diagnostics that must not depend on optional content-editor features.</summary>
public sealed class DeveloperOnlyAuthorizationHandler(IOptionsMonitor<OwnerAccessOptions> ownerOptions)
    : AuthorizationHandler<DeveloperOnlyRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, DeveloperOnlyRequirement requirement)
    {
        if (context.User.Identity?.IsAuthenticated == true && ownerOptions.CurrentValue.TryGetOwnerId(out var ownerId) &&
            Guid.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var callerId) && callerId == ownerId)
            context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
