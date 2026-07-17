using System.Collections.Concurrent;

namespace Bunker.Services;

public sealed class OmniscientRequestRateLimitService(TimeProvider timeProvider)
{
    private const int MaximumRequests = 12;
    private static readonly TimeSpan RequestWindow = TimeSpan.FromSeconds(5);

    private sealed record RequestWindowState(DateTimeOffset[] Requests);

    private readonly ConcurrentDictionary<string, RequestWindowState> _requestWindows =
        new(StringComparer.Ordinal);

    public bool TryConsume(string key)
    {
        var now = timeProvider.GetUtcNow();
        RemoveExpiredWindows(now);

        while (true)
        {
            var current = _requestWindows.GetOrAdd(key, static _ => new RequestWindowState([]));
            var activeRequests = current.Requests
                .Where(requestedAt => now - requestedAt <= RequestWindow)
                .ToArray();

            if (activeRequests.Length >= MaximumRequests)
            {
                var currentState = activeRequests.Length == current.Requests.Length
                    ? current
                    : new RequestWindowState(activeRequests);

                if (ReferenceEquals(currentState, current) ||
                    _requestWindows.TryUpdate(key, currentState, current))
                {
                    return false;
                }

                continue;
            }

            var updated = new RequestWindowState([.. activeRequests, now]);
            if (_requestWindows.TryUpdate(key, updated, current))
            {
                return true;
            }
        }
    }

    private void RemoveExpiredWindows(DateTimeOffset now)
    {
        foreach (var entry in _requestWindows)
        {
            var activeRequests = entry.Value.Requests
                .Where(requestedAt => now - requestedAt <= RequestWindow)
                .ToArray();

            if (activeRequests.Length == entry.Value.Requests.Length)
            {
                continue;
            }

            if (activeRequests.Length == 0)
            {
                ((ICollection<KeyValuePair<string, RequestWindowState>>)_requestWindows).Remove(entry);
                continue;
            }

            _requestWindows.TryUpdate(entry.Key, new RequestWindowState(activeRequests), entry.Value);
        }
    }
}
