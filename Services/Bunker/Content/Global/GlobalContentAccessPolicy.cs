using Bunker.Models;
using Microsoft.Extensions.Options;
using System.Security.Cryptography;
using System.Text;

namespace Bunker.Services;

public sealed class GlobalContentAccessPolicy(
    IHostEnvironment environment,
    IOptions<GlobalContentCatalogOptions> options)
{
    public bool FeatureEnabled => environment.IsDevelopment() && options.Value.Enabled;
    public bool IsDevelopment => environment.IsDevelopment();

    public bool CanAccess(GmMode mode) =>
        FeatureEnabled && GmCapabilities.Allows(mode, GmCapability.ManageGlobalContent);

    public bool ValidateDevelopmentBootstrap(string? key)
    {
        var configured = options.Value.DevelopmentBootstrapKey;
        if (!FeatureEnabled || configured.Length < 16 || string.IsNullOrEmpty(key)) return false;
        return CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(configured)),
            SHA256.HashData(Encoding.UTF8.GetBytes(key)));
    }

    public GlobalContentAccessDto GetAccess(GmMode mode)
    {
        var allowed = CanAccess(mode);
        var reason = allowed ? "available" :
            !environment.IsDevelopment() ? "production_disabled" :
            !options.Value.Enabled ? "feature_disabled" : "capability_required";
        return new(allowed, FeatureEnabled, IsDevelopment, reason);
    }
}
