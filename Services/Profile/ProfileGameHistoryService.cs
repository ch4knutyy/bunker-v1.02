using Bunker.Data.Persistence;
using Bunker.Models.ViewModels.Account;
using Bunker.Services.Bunker.GameSessions;
using Microsoft.EntityFrameworkCore;

namespace Bunker.Services.Profile;

public sealed class ProfileGameHistoryService : IProfileGameHistoryService
{
	private const int MaximumPageSize = 50;
	private readonly BunkerDbContext _dbContext;

	public ProfileGameHistoryService(BunkerDbContext dbContext)
	{
		_dbContext = dbContext;
	}

	public async Task<ProfileGameStatistics> GetStatisticsAsync(
		Guid userId,
		CancellationToken cancellationToken = default)
	{
		var counts = await UserSessions(userId)
			.GroupBy(_ => 1)
			.Select(group => new
			{
				CompletedGames = group.Count(item =>
					item.GameSession.Status == GameSessionStatuses.Completed &&
					item.LeftAtUtc == null),
				ActiveGames = group.Count(item =>
					item.GameSession.Status == GameSessionStatuses.Started &&
					item.LeftAtUtc == null),
				Wins = group.Count(item =>
					item.GameSession.Status == GameSessionStatuses.Completed &&
					item.LeftAtUtc == null && item.IsWinner),
				Losses = group.Count(item =>
					item.GameSession.Status == GameSessionStatuses.Completed &&
					item.LeftAtUtc == null && !item.IsWinner),
				HostedGames = group.Count(item => item.IsHost)
			})
			.SingleOrDefaultAsync(cancellationToken);

		if (counts is null)
		{
			return new ProfileGameStatistics(0, 0, 0, 0, 0, 0);
		}

		var winRate = counts.CompletedGames == 0
			? 0
			: Math.Round(
				(decimal)counts.Wins / counts.CompletedGames * 100,
				1,
				MidpointRounding.AwayFromZero);

		return new ProfileGameStatistics(
			counts.CompletedGames,
			counts.ActiveGames,
			counts.Wins,
			counts.Losses,
			counts.HostedGames,
			winRate);
	}

	public async Task<ProfileGameHistoryPage> GetHistoryAsync(
		Guid userId,
		int page,
		int pageSize,
		CancellationToken cancellationToken = default)
	{
		page = Math.Max(1, page);
		pageSize = Math.Clamp(pageSize, 1, MaximumPageSize);

		var query = OrderedHistory(userId);
		var totalItems = await query.CountAsync(cancellationToken);
		var rows = await ProjectHistory(query)
			.Skip((page - 1) * pageSize)
			.Take(pageSize)
			.ToListAsync(cancellationToken);

		return new ProfileGameHistoryPage
		{
			Items = rows.Select(WithDuration).ToArray(),
			CurrentPage = page,
			TotalPages = (int)Math.Ceiling(totalItems / (double)pageSize),
			TotalItems = totalItems
		};
	}

	public async Task<ProfileGameOverview> GetOverviewAsync(
		Guid userId,
		int recentCount,
		CancellationToken cancellationToken = default)
	{
		recentCount = Math.Clamp(recentCount, 1, MaximumPageSize);
		var statistics = await GetStatisticsAsync(userId, cancellationToken);
		var rows = await ProjectHistory(OrderedHistory(userId))
			.Take(recentCount)
			.ToListAsync(cancellationToken);

		return new ProfileGameOverview(
			statistics,
			rows.Select(WithDuration).ToArray());
	}

	private IQueryable<Data.Persistence.Entities.GameSessionPlayerEntity> UserSessions(Guid userId)
	{
		return _dbContext.GameSessionPlayers
			.AsNoTracking()
			.Where(item => item.UserId == userId);
	}

	private IOrderedQueryable<Data.Persistence.Entities.GameSessionPlayerEntity> OrderedHistory(Guid userId)
	{
		return UserSessions(userId)
			.OrderByDescending(item =>
				item.GameSession.StartedAtUtc ?? item.GameSession.CreatedAtUtc)
			.ThenByDescending(item => item.GameSession.CreatedAtUtc);
	}

	private static IQueryable<ProfileGameHistoryItem> ProjectHistory(
		IQueryable<Data.Persistence.Entities.GameSessionPlayerEntity> query)
	{
		return query.Select(item => new ProfileGameHistoryItem(
			item.GameSessionId,
			item.GameSession.RoomCode,
			item.GameSession.Status,
			item.GameSession.StartedAtUtc,
			item.GameSession.EndedAtUtc,
			null,
			item.GameSession.PlayerCount,
			item.IsHost,
			item.IsWinner,
			item.WasEliminated,
			item.EliminatedAtRound,
			item.LeftAtUtc,
			item.GameSession.ApocalypseId,
			item.GameSession.BunkerId));
	}

	private static ProfileGameHistoryItem WithDuration(ProfileGameHistoryItem item)
	{
		TimeSpan? duration =
			(item.Status == GameSessionStatuses.Completed ||
			 item.Status == GameSessionStatuses.Abandoned) &&
			item.StartedAtUtc.HasValue &&
			item.EndedAtUtc.HasValue
				? item.EndedAtUtc.Value - item.StartedAtUtc.Value
				: null;

		return item with { Duration = duration };
	}
}
