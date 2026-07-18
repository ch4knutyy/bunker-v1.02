using System.Collections.Concurrent;
using System.Threading.Channels;
using Bunker.Data.Persistence.Entities;

namespace Bunker.Services;

public interface IRoomRecoveryCoordinator
{
	void QueueSnapshot(string roomCode, string reason);
	void QueueDelete(string roomCode);
}

public sealed class RoomRecoveryCoordinator : BackgroundService, IRoomRecoveryCoordinator
{
	private readonly record struct RecoveryWork(string RoomCode, bool Delete);
	private readonly Channel<RecoveryWork> _channel = Channel.CreateUnbounded<RecoveryWork>(
		new UnboundedChannelOptions { SingleReader = true, SingleWriter = false });
	private readonly ConcurrentDictionary<string, byte> _queuedSnapshots = new(StringComparer.OrdinalIgnoreCase);
	private readonly ConcurrentDictionary<string, string> _fingerprints = new(StringComparer.OrdinalIgnoreCase);
	private readonly RoomService _rooms;
	private readonly RoomRecoveryCaptureService _capture;
	private readonly IRoomRecoverySnapshotStore _store;
	private readonly RoomRecoveryOptions _options;
	private readonly TimeProvider _time;
	private readonly ILogger<RoomRecoveryCoordinator> _logger;

	public RoomRecoveryCoordinator(
		RoomService rooms,
		RoomRecoveryCaptureService capture,
		IRoomRecoverySnapshotStore store,
		Microsoft.Extensions.Options.IOptions<RoomRecoveryOptions> options,
		TimeProvider time,
		ILogger<RoomRecoveryCoordinator> logger)
	{
		_rooms = rooms;
		_capture = capture;
		_store = store;
		_options = options.Value;
		_time = time;
		_logger = logger;
		_rooms.RoomRemoved += QueueDelete;
	}

	public override async Task StartAsync(CancellationToken cancellationToken)
	{
		if (_options.Enabled) await RestoreRoomsAsync(cancellationToken);
		await base.StartAsync(cancellationToken);
	}

	public void QueueSnapshot(string roomCode, string reason)
	{
		if (!_options.Enabled || string.IsNullOrWhiteSpace(roomCode) || !_queuedSnapshots.TryAdd(roomCode, 0)) return;
		_channel.Writer.TryWrite(new(roomCode, false));
	}

	public void QueueDelete(string roomCode)
	{
		if (!_options.Enabled || string.IsNullOrWhiteSpace(roomCode)) return;
		_queuedSnapshots.TryRemove(roomCode, out _);
		_channel.Writer.TryWrite(new(roomCode, true));
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken)
	{
		var periodicTask = RunPeriodicAsync(stoppingToken);
		try
		{
			await foreach (var work in _channel.Reader.ReadAllAsync(stoppingToken))
			{
				if (work.Delete)
				{
					await _store.DeleteAsync(work.RoomCode, stoppingToken);
					_fingerprints.TryRemove(work.RoomCode, out _);
				}
				else
				{
					_queuedSnapshots.TryRemove(work.RoomCode, out _);
					await PersistRoomAsync(work.RoomCode, stoppingToken);
				}
			}
		}
		catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
		{
		}
		finally
		{
			try { await periodicTask; }
			catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
		}
	}

	private async Task RunPeriodicAsync(CancellationToken cancellationToken)
	{
		var interval = TimeSpan.FromSeconds(Math.Clamp(_options.SnapshotIntervalSeconds, 1, 300));
		using var timer = new PeriodicTimer(interval, _time);
		while (await timer.WaitForNextTickAsync(cancellationToken))
		{
			foreach (var room in _rooms.GetActiveRoomsSnapshot()) QueueSnapshot(room.Id, "periodic");
			await _store.DeleteExpiredAsync(_time.GetUtcNow().UtcDateTime, cancellationToken);
		}
	}

	private async Task PersistRoomAsync(string roomCode, CancellationToken cancellationToken)
	{
		var room = _rooms.GetRoom(roomCode);
		if (room == null) return;
		try
		{
			var captured = _capture.Capture(room);
			if (_fingerprints.TryGetValue(roomCode, out var previous) &&
				string.Equals(previous, captured.Fingerprint, StringComparison.OrdinalIgnoreCase)) return;
			long revision;
			lock (room.RecoverySyncRoot) revision = ++room.RecoveryRevision;
			var now = _time.GetUtcNow();
			var entity = new RoomRecoverySnapshotEntity
			{
				RoomCode = captured.RoomCode,
				SchemaVersion = RoomRecoveryCaptureService.CurrentSchemaVersion,
				Revision = revision,
				RoomState = captured.RoomState,
				StateJson = captured.StateJson,
				Fingerprint = captured.Fingerprint,
				UpdatedAtUtc = now.UtcDateTime,
				ExpiresAtUtc = now.AddHours(Math.Clamp(_options.RetentionHours, 1, 24 * 365)).UtcDateTime,
				GameSessionId = captured.GameSessionId
			};
			if (await _store.SaveIfNewerAsync(entity, cancellationToken))
				_fingerprints[roomCode] = captured.Fingerprint;
		}
		catch (Exception exception)
		{
			_logger.LogError(exception, "Failed to persist room recovery snapshot {RoomCode}", roomCode);
		}
	}

	private async Task RestoreRoomsAsync(CancellationToken cancellationToken)
	{
		var restored = 0;
		var skipped = 0;
		IReadOnlyList<RoomRecoverySnapshotEntity> snapshots;
		try
		{
			snapshots = await _store.LoadActiveAsync(_time.GetUtcNow().UtcDateTime, cancellationToken);
		}
		catch (Exception exception)
		{
			_logger.LogError(exception, "Room recovery startup load failed");
			return;
		}

		foreach (var snapshot in snapshots)
		{
			string? error = null;
			if (snapshot.SchemaVersion != RoomRecoveryCaptureService.CurrentSchemaVersion ||
				!RoomRecoveryCaptureService.FingerprintMatches(snapshot.StateJson, snapshot.Fingerprint) ||
				!_capture.TryRestore(snapshot.StateJson, out var room, out error) ||
				room == null)
			{
				skipped++;
				_logger.LogWarning("Skipped room recovery snapshot {RoomCode} revision {Revision}: {Reason}",
					snapshot.RoomCode, snapshot.Revision, error ?? "schema_or_fingerprint_invalid");
				continue;
			}
			room.RecoveryRevision = snapshot.Revision;
			if (_rooms.TryRegisterRecoveredRoom(room))
			{
				_fingerprints[room.Id] = snapshot.Fingerprint;
				restored++;
			}
			else
			{
				skipped++;
				_logger.LogWarning("Skipped duplicate recovered room {RoomCode} revision {Revision}", snapshot.RoomCode, snapshot.Revision);
			}
		}
		_logger.LogInformation("Room recovery startup completed: {Restored} restored, {Skipped} skipped", restored, skipped);
	}

	public override void Dispose()
	{
		_rooms.RoomRemoved -= QueueDelete;
		base.Dispose();
	}
}
