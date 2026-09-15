using Bunker.Models.Academy;

namespace Bunker.Services.Academy;

public sealed class AcademicGroupService : IAcademicGroupService
{
    private readonly IReadOnlyList<Student> students = Array.AsReadOnly(new[]
    {
        new Student { Id = 1, FirstName = "Дмитро", LastName = "Лаптєв", Age = 20, Email = "laptevdima40@gmail.com", About = "Вивчає C#, ASP.NET Core та розробку програмного забезпечення." },
        new Student { Id = 2, FirstName = "Олексій", LastName = "Коваль", Age = 22, Email = "oleksii@example.com", About = "Цікавиться базами даних та SQL." },
        new Student { Id = 3, FirstName = "Анна", LastName = "Мельник", Age = 21, Email = "anna@example.com", About = "Вивчає тестування програмного забезпечення." },
        new Student { Id = 4, FirstName = "Максим", LastName = "Бондар", Age = 23, Email = "maksym@example.com", About = "Цікавиться Git та командною розробкою." }
    });

    private readonly IReadOnlyList<Subject> subjects = Array.AsReadOnly(new[]
    {
        new Subject { Id = 1, Name = "C#", Teacher = "Олексій Васильєв", Description = "Основи C#, класи, інтерфейси та колекції.", Hours = 48 },
        new Subject { Id = 2, Name = "ASP.NET Core MVC", Teacher = "Олексій Васильєв", Description = "Контролери, маршрути, Razor Views та Dependency Injection.", Hours = 36 },
        new Subject { Id = 3, Name = "SignalR", Teacher = "Олексій Васильєв", Description = "Обмін повідомленнями в реальному часі.", Hours = 12 },
        new Subject { Id = 4, Name = "SQL", Teacher = "Олексій Васильєв", Description = "Реляційні бази даних та SQL-запити.", Hours = 24 },
        new Subject { Id = 5, Name = "Git", Teacher = "Олексій Васильєв", Description = "Контроль версій та командна робота.", Hours = 12 },
        new Subject { Id = 6, Name = "Testing", Teacher = "Олексій Васильєв", Description = "Модульні та інтеграційні тести.", Hours = 24 }
    });

    public AcademicGroup GetGroupInfo() => new()
    {
        Name = "C# Pro — Bunker Development Group",
        Course = "C# Pro 2024",
        Institution = "Prog Academy",
        StudentCount = students.Count,
        Description = "Навчальна група, яка вивчає C#, ASP.NET Core MVC, SignalR, SQL, Git та тестування на прикладі проєкту Bunker."
    };

    public IReadOnlyList<Student> GetStudents() => students;
    public Student? GetStudent(int id) => students.FirstOrDefault(student => student.Id == id);
    public IReadOnlyList<Subject> GetSubjects() => subjects;
    public Subject? GetSubject(int id) => subjects.FirstOrDefault(subject => subject.Id == id);
}
