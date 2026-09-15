using Bunker.Models.Academy;

namespace Bunker.Services.Academy;

public interface IAcademicGroupService
{
    AcademicGroup GetGroupInfo();
    IReadOnlyList<Student> GetStudents();
    Student? GetStudent(int id);
    IReadOnlyList<Subject> GetSubjects();
    Subject? GetSubject(int id);
}
