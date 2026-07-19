using Bunker.Models;

namespace Bunker.Services;

public enum BunkerResourceKind
{
    Food,
    Water
}

public sealed record BunkerResourceMutation(
    BunkerResourceKind Resource,
    int RequestedMonths,
    int AppliedMonths,
    int PreviousTotalMonths,
    int TotalMonths);

public sealed class BunkerResourceService
{
    public const int MinMutationMonths = 1;
    public const int MaxMonths = 120;

    public bool IsValidMutationAmount(int months) =>
        months is >= MinMutationMonths and <= MaxMonths;

    public BunkerResourceMutation Add(BunkerInfo bunker, BunkerResourceKind resource, int months)
    {
        ArgumentNullException.ThrowIfNull(bunker);
        EnsureValidAmount(months);

        var previous = GetTotal(bunker, resource);
        var total = Math.Min(MaxMonths, previous + months);
        SetTotal(bunker, resource, total);
        return new(resource, months, total - previous, previous, total);
    }

    public BunkerResourceMutation Remove(BunkerInfo bunker, BunkerResourceKind resource, int months)
    {
        ArgumentNullException.ThrowIfNull(bunker);
        EnsureValidAmount(months);

        var previous = GetTotal(bunker, resource);
        var total = Math.Max(0, previous - months);
        SetTotal(bunker, resource, total);
        return new(resource, months, previous - total, previous, total);
    }

    private static int GetTotal(BunkerInfo bunker, BunkerResourceKind resource) =>
        resource == BunkerResourceKind.Water
            ? bunker.WaterMonths
            : bunker.SuppliesMonths;

    private static void SetTotal(BunkerInfo bunker, BunkerResourceKind resource, int total)
    {
        if (resource == BunkerResourceKind.Water)
        {
            bunker.WaterMonths = total;
            return;
        }

        bunker.SuppliesMonths = total;
    }

    private void EnsureValidAmount(int months)
    {
        if (!IsValidMutationAmount(months))
        {
            throw new ArgumentOutOfRangeException(
                nameof(months),
                months,
                $"Mutation amount must be between {MinMutationMonths} and {MaxMonths}.");
        }
    }
}
