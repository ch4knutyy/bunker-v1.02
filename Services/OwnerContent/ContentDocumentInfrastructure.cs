using System.Collections.Concurrent;

namespace Bunker.Services.OwnerContent;

public interface IContentReloadCoordinator
{
	Task<string> InvalidateAsync(
		string fileKey,
		string relativePath,
		CancellationToken cancellationToken = default);
}

public sealed class ContentReloadCoordinator : IContentReloadCoordinator
{
	public Task<string> InvalidateAsync(
		string fileKey,
		string relativePath,
		CancellationToken cancellationToken = default)
	{
		return Task.FromResult("restart_required");
	}
}

public sealed class ContentFileLockManager
{
	private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks =
		new(StringComparer.Ordinal);

	public async Task<IDisposable> AcquireAsync(
		string fileKey,
		CancellationToken cancellationToken)
	{
		var semaphore = _locks.GetOrAdd(fileKey, _ => new SemaphoreSlim(1, 1));
		await semaphore.WaitAsync(cancellationToken);
		return new Releaser(semaphore);
	}

	private sealed class Releaser : IDisposable
	{
		private SemaphoreSlim? _semaphore;

		public Releaser(SemaphoreSlim semaphore)
		{
			_semaphore = semaphore;
		}

		public void Dispose()
		{
			Interlocked.Exchange(ref _semaphore, null)?.Release();
		}
	}
}

public sealed class ContentEditorCommandRegistry
{
	private const int MaximumEntries = 1_000;
	private readonly object _sync = new();
	private readonly Dictionary<string, ContentMutationResult> _results =
		new(StringComparer.Ordinal);
	private readonly Queue<string> _order = new();

	public bool TryGet(string key, out ContentMutationResult result)
	{
		lock (_sync)
		{
			if (_results.TryGetValue(key, out var stored))
			{
				result = stored with { IdempotentReplay = true };
				return true;
			}
		}

		result = null!;
		return false;
	}

	public void Store(string key, ContentMutationResult result)
	{
		lock (_sync)
		{
			if (_results.ContainsKey(key))
			{
				return;
			}

			_results[key] = result;
			_order.Enqueue(key);
			while (_order.Count > MaximumEntries)
			{
				_results.Remove(_order.Dequeue());
			}
		}
	}
}

public sealed class ContentDocumentServiceFaults
{
	public bool FailBeforeReplace { get; set; }
}
