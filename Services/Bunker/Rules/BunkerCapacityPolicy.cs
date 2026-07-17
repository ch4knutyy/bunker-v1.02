using System.Globalization;

namespace Bunker.Services;

public static class BunkerCapacityPolicy
{
    public static bool TryParse(string? value, out int capacity)
    {
        capacity = 0;
        return !string.IsNullOrWhiteSpace(value) &&
               int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out capacity) &&
               capacity is >= 1 and <= 99;
    }
}
