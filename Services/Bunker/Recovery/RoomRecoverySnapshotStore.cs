using Bunker.Data.Persistence;
using Bunker.Data.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Bunker.Services;

public interface IRoomRecoverySnapshotStore
{
	Task<IReadOnlyList<RoomRecoverySnapshotEntity>> LoadActiveAsync(DateTime utcNow, CancellationToken cancellationToken);
	Task<bool> SaveIfNewerAsync(RoomRecoverySnapshotEntity snapshot, CancellationToken cancellationToken);
	Task DeleteAsync(string roomCode, CancellationToken cancellationToken);
	Task DeleteExpiredAsync(DateTime utcNow, CancellationToken cancellationToken);
}

public sealed class RoomRecoverySnapshotStore : IRoomRecoverySnapshotStore
{
	private readonly IServiceScopeFactory _scopeFactory;

	public RoomRecoverySnapshotStore(IServiceScopeFactory scopeFactory)
	{
		_scopeFactory = scopeFactory;
	}

	public async Task<IReadOnlyList<RoomRecoverySnapshotEntity>> LoadActiveAsync(DateTime utcNow, CancellationToken cancellationToken)
	{
		await using var scope = _scopeFactory.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<BunkerDbContext>();
		return await db.RoomRecoverySnapshots.AsNoTracking()
			.Where(snapshot => snapshot.ExpiresAtUtc == null || snapshot.ExpiresAtUtc > utcNow)
			.OrderBy(snapshot => snapshot.RoomCode)
			.ToListAsync(cancellationToken);
	}

	public async Task<bool> SaveIfNewerAsync(RoomRecoverySnapshotEntity snapshot, CancellationToken cancellationToken)
	{
		await using var scope = _scopeFactory.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<BunkerDbContext>();
		var current = await db.RoomRecoverySnapshots.SingleOrDefaultAsync(
			entry => entry.RoomCode == snapshot.RoomCode, cancellationToken);
		if (current != null && (current.Revision >= snapshot.Revision ||
			string.Equals(current.Fingerprint, snapshot.Fingerprint, StringComparison.OrdinalIgnoreCase)))
		{
			return false;
		}

		if (current == null)
		{
			db.RoomRecoverySnapshots.Add(snapshot);
		}
		else
		{
			current.SchemaVersion = snapshot.SchemaVersion;
			current.Revision = snapshot.Revision;
			current.RoomState = snapshot.RoomState;
			current.StateJson = snapshot.StateJson;
			current.Fingerprint = snapshot.Fingerprint;
			current.UpdatedAtUtc = snapshot.UpdatedAtUtc;
			current.ExpiresAtUtc = snapshot.ExpiresAtUtc;
			current.GameSessionId = snapshot.GameSessionId;
		}
		await db.SaveChangesAsync(cancellationToken);
		return true;
	}

	public async Task DeleteAsync(string roomCode, CancellationToken cancellationToken)
	{
		await using var scope = _scopeFactory.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<BunkerDbContext>();
		await db.RoomRecoverySnapshots.Where(snapshot => snapshot.RoomCode == roomCode)
			.ExecuteDeleteAsync(cancellationToken);
	}

	public async Task DeleteExpiredAsync(DateTime utcNow, CancellationToken cancellationToken)
	{
		await using var scope = _scopeFactory.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<BunkerDbContext>();
		await db.RoomRecoverySnapshots.Where(snapshot => snapshot.ExpiresAtUtc != null && snapshot.ExpiresAtUtc <= utcNow)
			.ExecuteDeleteAsync(cancellationToken);
	}
}
