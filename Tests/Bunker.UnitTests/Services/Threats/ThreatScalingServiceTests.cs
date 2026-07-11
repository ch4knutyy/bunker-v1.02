using System;
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

	[Fact]
	public void Calculate_ForOnePlayer_ReturnsMinimumScaling()
	{
		var service = new ThreatScalingService();

		var result = service.Calculate(
			activePlayerCount: 1,
			participantCount: 1,
			additionalAllowedErrors: 0,
			timeBonusSeconds: 0,
			autoCompletedTaskCount: 0);

		Assert.Equal(1, result.ScalingPlayerCount);
		Assert.Equal(1, result.MinParticipants);
		Assert.Equal(1, result.MaxParticipants);

		Assert.Equal(2, result.BaseTaskCount);
		Assert.Equal(2, result.PlayableTaskCount);

		Assert.Equal(25, result.BaseTimeSeconds);
		Assert.Equal(0, result.TimeBonusSeconds);
		Assert.Equal(25, result.TaskTimeSeconds);

		Assert.Equal(0, result.HintTokens);
		Assert.Equal(0, result.AllowedErrors);
		Assert.Equal(2, result.RequiredTasksForSuccess);
	}

	[Fact]
	public void Calculate_ForTenPlayers_ReturnsMaximumScaling()
	{
		var service = new ThreatScalingService();

		var result = service.Calculate(
			activePlayerCount: 10,
			participantCount: 5,
			additionalAllowedErrors: 0,
			timeBonusSeconds: 0,
			autoCompletedTaskCount: 2);

		Assert.Equal(10, result.ScalingPlayerCount);
		Assert.Equal(1, result.MinParticipants);
		Assert.Equal(5, result.MaxParticipants);

		Assert.Equal(6, result.BaseTaskCount);
		Assert.Equal(4, result.PlayableTaskCount);

		Assert.Equal(20, result.BaseTimeSeconds);
		Assert.Equal(0, result.TimeBonusSeconds);
		Assert.Equal(20, result.TaskTimeSeconds);

		Assert.Equal(3, result.HintTokens);
		Assert.Equal(1, result.AllowedErrors);
		Assert.Equal(5, result.RequiredTasksForSuccess);
	}

	[Fact]
	public void Calculate_WhenTimeBonusExceedsMaximum_ClampsTimeBonus()
	{
		var service = new ThreatScalingService();

		var result = service.Calculate(
			activePlayerCount: 4,
			participantCount: 2,
			additionalAllowedErrors: 0,
			timeBonusSeconds: 100,
			autoCompletedTaskCount: 0);

		Assert.Equal(25, result.BaseTimeSeconds);
		Assert.Equal(20, result.TimeBonusSeconds);
		Assert.Equal(45, result.TaskTimeSeconds);
	}

	[Fact]
	public void Calculate_WhenParticipantCountExceedsMaximum_ThrowsArgumentOutOfRangeException()
	{
		var service = new ThreatScalingService();

		Assert.Throws<ArgumentOutOfRangeException>(() =>
			service.Calculate(
				activePlayerCount: 4,
				participantCount: 3,
				additionalAllowedErrors: 0,
				timeBonusSeconds: 0,
				autoCompletedTaskCount: 0));
	}
}
