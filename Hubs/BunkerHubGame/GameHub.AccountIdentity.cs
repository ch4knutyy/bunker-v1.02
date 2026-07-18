using System.Security.Claims;

namespace Bunker.Hubs;

public partial class GameHub
{
	private Guid? GetCallerAccountUserId()
	{
		return ParseAccountUserId(Context.User);
	}

	internal static Guid? ParseAccountUserId(ClaimsPrincipal? principal)
	{
		var value = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
		return Guid.TryParse(value, out var userId) ? userId : null;
	}
}
