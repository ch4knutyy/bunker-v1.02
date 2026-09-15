using Bunker.Services.Academy;
using Microsoft.AspNetCore.Mvc;

namespace Bunker.Controllers;

[Route("academy")]
public sealed class AcademyController : Controller
{
    private readonly IAcademicGroupService academicGroupService;

    public AcademyController(IAcademicGroupService academicGroupService)
    {
        this.academicGroupService = academicGroupService;
    }

    [HttpGet("")]
    public IActionResult Index() => View(academicGroupService.GetGroupInfo());

    [HttpGet("students")]
    public IActionResult Students() => View(academicGroupService.GetStudents());

    [HttpGet("students/{id:int}")]
    public IActionResult StudentDetails(int id)
    {
        var student = academicGroupService.GetStudent(id);
        return student is null ? NotFound() : View(student);
    }

    [HttpGet("subjects")]
    public IActionResult Subjects() => View(academicGroupService.GetSubjects());

    [HttpGet("subjects/{id:int}")]
    public IActionResult SubjectDetails(int id)
    {
        var subject = academicGroupService.GetSubject(id);
        return subject is null ? NotFound() : View(subject);
    }
}
