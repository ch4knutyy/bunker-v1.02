namespace Bunker.Models;

public sealed record StaleConnectionResult(bool IsStale, bool WasFixed, string Message);
