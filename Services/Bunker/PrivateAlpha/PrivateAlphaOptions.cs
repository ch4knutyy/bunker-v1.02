using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;

namespace Bunker.Services.PrivateAlpha;

public sealed class PrivateAlphaOptions
{
    public const string SectionName = "PrivateAlpha";
    public const string AuthenticationScheme = "Bunker.PrivateAlpha";
    public const string VersionClaim = "bunker_private_alpha_version";

    public bool Enabled { get; set; }
    public string PasswordHash { get; set; } = "";

    public string SessionVersion => Convert.ToHexString(
        SHA256.HashData(Encoding.UTF8.GetBytes(PasswordHash)));

    public bool HasValidSession(ClaimsPrincipal? principal) =>
        principal?.Identity?.IsAuthenticated == true &&
        string.Equals(principal.FindFirst(VersionClaim)?.Value, SessionVersion, StringComparison.Ordinal);

    public bool VerifyPassword(string? suppliedPassword)
    {
        if (string.IsNullOrWhiteSpace(PasswordHash) || string.IsNullOrEmpty(suppliedPassword) || suppliedPassword.Length > 256)
            return false;

        try
        {
            return new PasswordHasher<PrivateAlphaOptions>()
                .VerifyHashedPassword(this, PasswordHash, suppliedPassword) != PasswordVerificationResult.Failed;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    public void ValidateForStartup()
    {
        if (!Enabled) return;
        if (string.IsNullOrWhiteSpace(PasswordHash))
            throw new InvalidOperationException("PrivateAlpha is enabled but PrivateAlpha:PasswordHash is missing. Configure appsettings.Local.json or the PrivateAlpha__PasswordHash environment variable before starting the server.");
        try
        {
            var decoded = Convert.FromBase64String(PasswordHash);
            if (decoded.Length < 32 || decoded[0] != 0x01)
                throw new FormatException("Unsupported password hash format.");
        }
        catch (FormatException exception)
        {
            throw new InvalidOperationException("PrivateAlpha:PasswordHash is not a valid ASP.NET Core Identity V3 password hash.", exception);
        }
    }
}
