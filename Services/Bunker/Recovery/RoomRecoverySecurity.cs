using System.Security.Cryptography;
using System.Text;

namespace Bunker.Services;

internal static class RoomRecoverySecurity
{
	private const int PasswordIterations = 100_000;

	public static string HashReconnectToken(string token) =>
		Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token ?? ""))).ToLowerInvariant();

	public static bool VerifyReconnectToken(string token, string expectedHash)
	{
		if (string.IsNullOrWhiteSpace(token) || expectedHash.Length != 64) return false;
		try
		{
			var actual = SHA256.HashData(Encoding.UTF8.GetBytes(token));
			var expected = Convert.FromHexString(expectedHash);
			return expected.Length == actual.Length && CryptographicOperations.FixedTimeEquals(actual, expected);
		}
		catch (FormatException)
		{
			return false;
		}
	}

	public static string HashPassword(string password)
	{
		var salt = RandomNumberGenerator.GetBytes(16);
		var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, PasswordIterations, HashAlgorithmName.SHA256, 32);
		return $"pbkdf2-sha256${PasswordIterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
	}

	public static bool VerifyPassword(string? password, string? encoded)
	{
		if (password == null || string.IsNullOrWhiteSpace(encoded)) return false;
		var parts = encoded.Split('$');
		if (parts.Length != 4 || parts[0] != "pbkdf2-sha256" || !int.TryParse(parts[1], out var iterations)) return false;
		try
		{
			var salt = Convert.FromBase64String(parts[2]);
			var expected = Convert.FromBase64String(parts[3]);
			var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
			return CryptographicOperations.FixedTimeEquals(actual, expected);
		}
		catch (FormatException)
		{
			return false;
		}
	}
}
