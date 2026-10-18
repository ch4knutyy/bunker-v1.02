using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class AiProviderRateLimitServiceTests
{
    [Fact]
    public async Task Rate_limit_enters_cooldown_without_blocking_the_game_thread()
    {
        var service = new AiProviderRateLimitService(TimeProvider.System);
        using var firstLease = await service.TryEnterAsync(CancellationToken.None);
        Assert.NotNull(firstLease);

        service.RecordRateLimit(TimeSpan.FromSeconds(1));

        Assert.True(service.IsCoolingDown);
        Assert.Null(await service.TryEnterAsync(CancellationToken.None));
    }
}
