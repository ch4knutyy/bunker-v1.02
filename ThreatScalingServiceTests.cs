using Bunker.Services.Threats;
using Xunit;

namespace Bunker.UnitTests.Services.Threats;

public class ThreatScalingServiceTests
{
	[Fact]
	public void Calculate_ForSixPlayers_ReturnsExpectedScaling()
	{
		var service = new ThreatScalingService();

		var result = service.Calculate(
			activePlayerCount: 6,
			participantCount: 3,
			additionalAllowedErrors: 1,
			timeBonusSeconds: 10,
			autoCompletedTaskCount: 1);

		Assert.Equal(6, result.ScalingPlayerCount);
		Assert.Equal(1, result.MinParticipants);
		Assert.Equal(3, result.MaxParticipants);

		Assert.Equal(4, result.BaseTaskCount);
		Assert.Equal(3, result.PlayableTaskCount);

		Assert.Equal(22, result.BaseTimeSeconds);
		Assert.Equal(10, result.TimeBonusSeconds);
		Assert.Equal(32, result.TaskTimeSeconds);

		Assert.Equal(2, result.HintTokens);
		Assert.Equal(2, result.AllowedErrors);
		Assert.Equal(3, result.RequiredTasksForSuccess);
	}
}