using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

Console.Write("Create a strong private-alpha password (input hidden): ");
var characters = new List<char>();
while (true)
{
    var key = Console.ReadKey(intercept: true);
    if (key.Key == ConsoleKey.Enter) break;
    if (key.Key == ConsoleKey.Backspace)
    {
        if (characters.Count > 0) characters.RemoveAt(characters.Count - 1);
        continue;
    }
    if (!char.IsControl(key.KeyChar)) characters.Add(key.KeyChar);
}
Console.WriteLine();
var password = new string(characters.ToArray());
if (password.Length < 9 || password.Length > 256)
{
    Console.Error.WriteLine("Use a password between 9 and 256 characters.");
    return 1;
}
var hasher = new PasswordHasher<object>(Options.Create(new PasswordHasherOptions
{
    CompatibilityMode = PasswordHasherCompatibilityMode.IdentityV3,
    IterationCount = 210_000
}));
var hash = hasher.HashPassword(new object(), password);
Console.WriteLine("Copy this value to PrivateAlpha:PasswordHash in the LOCAL config (never commit it):");
Console.WriteLine(hash);
return 0;
