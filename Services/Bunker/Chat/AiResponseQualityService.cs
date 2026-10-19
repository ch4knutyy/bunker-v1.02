using System.Text.RegularExpressions;
using Bunker.Models;

namespace Bunker.Services;

public sealed record AiResponseQualityResult(bool IsAccepted, string? Text, string? ErrorCode);

/// <summary>Cheap local safeguards for provider output; it never rewrites an AI's argument.</summary>
public static partial class AiResponseQualityService
{
    public const int MaxResponseLength = 700;

    public static AiResponseQualityResult Validate(string? response, AiChatCompanion companion,
        IReadOnlyList<RoomChatMessage> history, string? canonicalProfession)
    {
        var text = response?.Trim();
        if (string.IsNullOrWhiteSpace(text)) return new(false, null, "ai_empty_response");
        if (text.Length > MaxResponseLength) return new(false, null, "ai_response_too_long");
        if (text.Any(character => char.IsControl(character) && character is not '\r' and not '\n' and not '\t')) return new(false, null, "ai_response_invalid_format");

        var normalized = Normalize(text);
        if (string.IsNullOrWhiteSpace(normalized)) return new(false, null, "ai_response_invalid_format");
        if (history.Where(message => message.SenderType == ChatSenderType.Ai &&
                                     string.Equals(message.SenderId, companion.Id, StringComparison.OrdinalIgnoreCase))
            .TakeLast(3)
            .Any(message => Normalize(message.Text) == normalized))
            return new(false, null, "ai_duplicate_response");

        var professionClaim = ProfessionClaim().Match(text);
        if (professionClaim.Success && !string.IsNullOrWhiteSpace(canonicalProfession) &&
            !professionClaim.Groups["value"].Value.Contains(canonicalProfession, StringComparison.OrdinalIgnoreCase))
            return new(false, null, "ai_self_fact_conflict");

        return new(true, text, null);
    }

    private static string Normalize(string value) => string.Concat(value
        .Where(character => char.IsLetterOrDigit(character) || char.IsWhiteSpace(character))
        .Select(char.ToLowerInvariant))
        .Trim();

    [GeneratedRegex(@"(?:моя\s+професія|моя\s+профессия|my\s+profession)\s*(?:—|-|:)\s*(?<value>[^.!?]+)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ProfessionClaim();
}
