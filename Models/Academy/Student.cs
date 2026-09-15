namespace Bunker.Models.Academy;

public sealed class Student
{
    public int Id { get; init; }
    public string FirstName { get; init; } = "";
    public string LastName { get; init; } = "";
    public int Age { get; init; }
    public string Email { get; init; } = "";
    public string About { get; init; } = "";
}
