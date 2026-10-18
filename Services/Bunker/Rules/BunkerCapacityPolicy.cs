using System.Globalization;

namespace Bunker.Services;

public static class BunkerCapacityPolicy
{
    /// <summary>
    /// Canonical capacity locked at the actual game start. It intentionally counts only
    /// gameplay participants, so AI participants are included and spectator/GM roles are not.
    /// </summary>
    public static int ResolveForGameplayPlayerCount(int playerCount) => playerCount switch
    {
        <= 2 => 1,
        3 => 2,
        _ => playerCount / 2
    };

    public static bool TryParse(string? value, out int capacity)
    {
        capacity = 0;
        return !string.IsNullOrWhiteSpace(value) &&
               int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out capacity) &&
               capacity is >= 1 and <= 99;
    }
}
