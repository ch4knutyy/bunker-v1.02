using System;

namespace Bunker.Services.Threats
{
	public sealed class ThreatScalingService
	{
		public ThreatScalingResult Calculate(
			int activePlayerCount,
			int participantCount,
			int additionalAllowedErrors,
			int timeBonusSeconds,
			int autoCompletedTaskCount)
		{
			if (activePlayerCount < 1)
			{
				throw new ArgumentOutOfRangeException(
					nameof(activePlayerCount),
					"Active player count must be at least 1.");
			}

			if (participantCount < 1)
			{
				throw new ArgumentOutOfRangeException(
					nameof(participantCount),
					"Participant count must be at least 1.");
			}

			if (additionalAllowedErrors < 0)
			{
				throw new ArgumentOutOfRangeException(
					nameof(additionalAllowedErrors),
					"Additional allowed errors cannot be negative.");
			}

			if (timeBonusSeconds < 0)
			{
				throw new ArgumentOutOfRangeException(
					nameof(timeBonusSeconds),
					"Time bonus cannot be negative.");
			}

			if (autoCompletedTaskCount < 0)
			{
				throw new ArgumentOutOfRangeException(
					nameof(autoCompletedTaskCount),
					"Auto-completed task count cannot be negative.");
			}

			int maxParticipants;

			if (activePlayerCount == 1)
			{
				maxParticipants = 1;
			}
			else
			{
				maxParticipants = (int)Math.Ceiling(activePlayerCount / 2.0);
				maxParticipants = Math.Clamp(maxParticipants, 2, 5);
			}

			if (participantCount > maxParticipants)
			{
				throw new ArgumentOutOfRangeException(
					nameof(participantCount),
					$"Participant count cannot exceed {maxParticipants}.");
			}

			int baseTimeSeconds;

			if (activePlayerCount <= 4)
			{
				baseTimeSeconds = 25;
			}
			else if (activePlayerCount <= 7)
			{
				baseTimeSeconds = 22;
			}
			else
			{
				baseTimeSeconds = 20;
			}

			int limitedTimeBonus = Math.Clamp(timeBonusSeconds, 0, 20);

			int taskTimeSeconds =
				Math.Clamp(baseTimeSeconds + limitedTimeBonus, 15, 45);

			int baseTaskCount =
				(int)Math.Ceiling(activePlayerCount / 2.0) + 1;

			baseTaskCount = Math.Clamp(baseTaskCount, 2, 7);

			int playableTaskCount =
				Math.Max(1, baseTaskCount - autoCompletedTaskCount);

			int hintTokens =
				Math.Clamp(participantCount - 1, 0, 3);

			int participantsRequiredForTeamBonus =
				(int)Math.Ceiling(maxParticipants / 2.0);

			int teamErrorBonus =
				participantCount > 1 &&
				participantCount >= participantsRequiredForTeamBonus
					? 1
					: 0;

			int allowedErrors =
				Math.Clamp(teamErrorBonus + additionalAllowedErrors, 0, 2);

			int requiredTasksForSuccess =
				(int)Math.Ceiling(baseTaskCount * 0.7);

			return new ThreatScalingResult
			{
				ScalingPlayerCount = activePlayerCount,
				MinParticipants = 1,
				MaxParticipants = maxParticipants,

				BaseTaskCount = baseTaskCount,
				PlayableTaskCount = playableTaskCount,

				BaseTimeSeconds = baseTimeSeconds,
				TimeBonusSeconds = limitedTimeBonus,
				TaskTimeSeconds = taskTimeSeconds,

				HintTokens = hintTokens,
				AllowedErrors = allowedErrors,
				RequiredTasksForSuccess = requiredTasksForSuccess
			};
		}
	}

	public sealed class ThreatScalingResult
	{
		public int ScalingPlayerCount { get; init; }

		public int MinParticipants { get; init; }
		public int MaxParticipants { get; init; }

		public int BaseTaskCount { get; init; }
		public int PlayableTaskCount { get; init; }

		public int BaseTimeSeconds { get; init; }
		public int TimeBonusSeconds { get; init; }
		public int TaskTimeSeconds { get; init; }

		public int HintTokens { get; init; }
		public int AllowedErrors { get; init; }
		public int RequiredTasksForSuccess { get; init; }
	}
}
