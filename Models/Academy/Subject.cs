namespace Bunker.Models.Academy;

public sealed class Subject
{
    public int Id { get; init; }
    public string Name { get; init; } = "";
    public string Teacher { get; init; } = "";
    public string Description { get; init; } = "";
    public int Hours { get; init; }
}
