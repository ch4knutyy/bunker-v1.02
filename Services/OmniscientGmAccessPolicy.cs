using System.Security.Cryptography;
using System.Text;
using Bunker.Models;
using Microsoft.Extensions.Options;

namespace Bunker.Services;

public sealed class OmniscientGmAccessPolicy(IHostEnvironment environment, IOptions<OmniscientGmOptions> options)
{
    public bool FeatureEnabled => environment.IsDevelopment() && options.Value.Enabled;
    public bool CanBootstrap(string? key)
    {
        var configured = options.Value.DevelopmentBootstrapKey;
        if (!FeatureEnabled || configured.Length < 16 || string.IsNullOrEmpty(key)) return false;
        return CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(configured)), SHA256.HashData(Encoding.UTF8.GetBytes(key)));
    }
    public bool CanEnter(GmMode mode, string? bootstrapKey) =>
        GmCapabilities.Allows(mode, GmCapability.EnterOmniscientGm) || CanBootstrap(bootstrapKey);
}
