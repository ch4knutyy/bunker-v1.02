namespace Bunker.Models.Academy;

public sealed class AcademicGroup
{
    public string Name { get; init; } = "";
    public string Course { get; init; } = "";
    public string Institution { get; init; } = "";
    public int StudentCount { get; init; }
    public string Description { get; init; } = "";
}
