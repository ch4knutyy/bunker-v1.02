using Bunker.Controllers;
using Bunker.Models.Academy;
using Bunker.Services.Academy;
using Microsoft.AspNetCore.Mvc;

namespace Bunker.UnitTests;

public sealed class AcademyControllerTests
{
    [Fact]
    public void AcademyReturnsTypedModelsAndNotFoundForUnknownIds()
    {
        var service = new AcademicGroupService();
        var controller = new AcademyController(service);

        Assert.Equal(service.GetStudents().Count, ((AcademicGroup)((ViewResult)controller.Index()).Model!).StudentCount);
        Assert.Same(service.GetStudents(), ((ViewResult)controller.Students()).Model);
        var student = (Student)((ViewResult)controller.StudentDetails(1)).Model!;
        Assert.Equal(("Дмитро", "Лаптєв", 20, "laptevdima40@gmail.com"), (student.FirstName, student.LastName, student.Age, student.Email));
        Assert.Same(service.GetSubjects(), ((ViewResult)controller.Subjects()).Model);
        Assert.Equal("C#", ((Subject)((ViewResult)controller.SubjectDetails(1)).Model!).Name);
        Assert.IsType<NotFoundResult>(controller.StudentDetails(999));
        Assert.IsType<NotFoundResult>(controller.SubjectDetails(999));
    }
}
