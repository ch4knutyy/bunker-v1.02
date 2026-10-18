using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class AiSynergyEvaluatorTests
{
    [Fact]
    public void Public_health_need_and_doctor_skill_are_one_sided_dependency_not_an_automatic_alliance()
    {
        var room = new Room { State = RoomState.Playing, ResolvedBunkerCapacity = 2 };
        var doctor = new Player { Name = "Doctor", StablePlayerId = "doctor", ConnectionId = "doctor", IsAi = true, Profession = new Profession { Name = "Doctor" } };
        var patient = new Player { Name = "Patient", StablePlayerId = "patient", ConnectionId = "patient", PhysicalHealth = new PhysicalHealth { Name = "private diagnosis" } };
        patient.Revealed.RevealedValues["PhysicalHealth"] = new RevealedData { Value = "Public condition" };
        room.Players[doctor.ConnectionId] = doctor;
        room.Players[patient.ConnectionId] = patient;
        room.Players["competitor"] = new Player { Name = "Competitor", StablePlayerId = "competitor", ConnectionId = "competitor" };

        var assessment = Assert.Single(new AiSynergyEvaluator().Evaluate(room, doctor), item => item.PlayerId == "patient");

        Assert.Equal(AiSynergyKind.OneSidedDependency, assessment.Kind);
        Assert.Contains("Public", string.Join(' ', assessment.Evidence));
        Assert.Contains("consume", assessment.Caution, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("competitors", assessment.Caution, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("private diagnosis", string.Join(' ', assessment.Evidence));
    }
}
