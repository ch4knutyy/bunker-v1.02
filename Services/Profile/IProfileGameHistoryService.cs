using Bunker.Models.ViewModels.Account;

namespace Bunker.Services.Profile;

public interface IProfileGameHistoryService
{
	Task<ProfileGameStatistics> GetStatisticsAsync(
		Guid userId,
		CancellationToken cancellationToken = default);

	Task<ProfileGameHistoryPage> GetHistoryAsync(
		Guid userId,
		int page,
		int pageSize,
		CancellationToken cancellationToken = default);

	Task<ProfileGameOverview> GetOverviewAsync(
		Guid userId,
		int recentCount,
		CancellationToken cancellationToken = default);
}
