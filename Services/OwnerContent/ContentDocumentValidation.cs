using System.Text.Json;

namespace Bunker.Services.OwnerContent;

public interface IContentDocumentValidator
{
	ContentValidationResult Validate(
		ContentDocumentDescriptor descriptor,
		string proposedContent);
}

public sealed class GenericContentDocumentValidator : IContentDocumentValidator
{
	private const int MaximumDepth = 128;

	public ContentValidationResult Validate(
		ContentDocumentDescriptor descriptor,
		string proposedContent)
	{
		try
		{
			using var document = JsonDocument.Parse(
				proposedContent,
				new JsonDocumentOptions
				{
					AllowTrailingCommas = false,
					CommentHandling = JsonCommentHandling.Disallow,
					MaxDepth = MaximumDepth
				});
			if (document.RootElement.ValueKind is not (
				JsonValueKind.Object or JsonValueKind.Array))
			{
				return Invalid(
					"invalid_root",
					"Кореневий JSON-елемент повинен бути object або array.");
			}

			var errors = new List<ContentValidationIssue>();
			var warnings = new List<ContentValidationIssue>();
			InspectIdentifiers(document.RootElement, "$", errors, warnings);
			return new ContentValidationResult(errors.Count == 0, errors, warnings);
		}
		catch (JsonException exception)
		{
			return new ContentValidationResult(
				false,
				[
					new ContentValidationIssue(
						"invalid_json",
						"JSON має синтаксичну помилку.",
						null,
						exception.LineNumber,
						exception.BytePositionInLine)
				],
				[]);
		}
	}

	private static void InspectIdentifiers(
		JsonElement element,
		string path,
		List<ContentValidationIssue> errors,
		List<ContentValidationIssue> warnings)
	{
		if (element.ValueKind == JsonValueKind.Array)
		{
			var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
			var index = 0;
			foreach (var item in element.EnumerateArray())
			{
				var itemPath = $"{path}[{index}]";
				if (item.ValueKind == JsonValueKind.Object &&
					TryGetId(item, out var id))
				{
					if (string.IsNullOrWhiteSpace(id))
					{
						errors.Add(new ContentValidationIssue(
							"empty_id",
							"Ідентифікатор запису не може бути порожнім.",
							$"{itemPath}.id"));
					}
					else if (!seenIds.Add(id))
					{
						errors.Add(new ContentValidationIssue(
							"duplicate_id",
							$"Повторюваний ідентифікатор: {id}",
							$"{itemPath}.id"));
					}
				}

				InspectIdentifiers(item, itemPath, errors, warnings);
				index++;
			}
		}
		else if (element.ValueKind == JsonValueKind.Object)
		{
			foreach (var property in element.EnumerateObject())
			{
				InspectIdentifiers(
					property.Value,
					$"{path}.{property.Name}",
					errors,
					warnings);
			}
		}
	}

	private static bool TryGetId(JsonElement element, out string id)
	{
		foreach (var property in element.EnumerateObject())
		{
			if (string.Equals(property.Name, "id", StringComparison.OrdinalIgnoreCase))
			{
				id = property.Value.ValueKind == JsonValueKind.String
					? property.Value.GetString() ?? string.Empty
					: property.Value.ToString();
				return true;
			}
		}

		id = string.Empty;
		return false;
	}

	private static ContentValidationResult Invalid(string code, string message)
	{
		return new ContentValidationResult(
			false,
			[new ContentValidationIssue(code, message)],
			[]);
	}
}
