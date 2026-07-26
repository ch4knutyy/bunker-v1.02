using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Models.Сharacteristics;

namespace Bunker.Services;

public sealed class CatalogItemService(GameDataService gameData)
{
    public const int MaximumPageSize = 50;
    private static readonly string[] SeverityOrder = ["light", "medium", "hard", "veryHard", "critical"];
    private static readonly HashSet<string> ReplaceCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "profession", "physicalHealth", "mentalHealth", "hobby", "phobia",
        "characterTrait", "fact", "inventory", "property", "specialCard",
        "additionalPhysicalCondition"
    };
    private static readonly HashSet<string> CopyExchangeCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "profession", "physicalHealth", "mentalHealth", "hobby", "phobia", "characterTrait", "fact"
    };

    public static bool IsCatalogCategory(string category) =>
        ReplaceCategories.Contains(NormalizeCategory(category));

    public IReadOnlyList<CatalogPickerCategoryDto> GetCategories(string? language)
    {
        var lang = Language(language);
        return
        [
            Category("profession", lang, true, false, "replace", "exchange", "copy", "transfer", "steal"),
            Category("physicalHealth", lang, true, true, "replace", "exchange", "copy", "transfer", "steal"),
            Category("mentalHealth", lang, true, true, "replace", "exchange", "copy", "transfer", "steal"),
            Category("hobby", lang, true, false, "replace", "exchange", "copy", "transfer", "steal"),
            Category("phobia", lang, true, false, "replace", "exchange", "copy", "transfer", "steal"),
            Category("characterTrait", lang, true, false, "replace", "exchange", "copy", "transfer", "steal"),
            Category("fact", lang, true, false, "replace", "exchange", "copy", "transfer", "steal"),
            Category("inventory", lang, true, false, "add", "replace", "remove"),
            Category("property", lang, false, false, "propertyEditor"),
            Category("specialCard", lang, true, false, "issue", "replace", "remove", "markUsed", "restoreUsed"),
            Category("additionalPhysicalCondition", lang, true, true, "add", "remove")
        ];
    }

    public CatalogPickerPageDto GetPage(
        string category,
        Player? target,
        string? language,
        int page,
        int pageSize,
        string? search,
        bool includeTechnicalMetadata)
    {
        category = NormalizeCategory(category);
        if (!ReplaceCategories.Contains(category))
            throw new CatalogItemRequestException("catalog_category_not_supported");

        var lang = Language(language);
        var all = BuildItems(category, lang, includeTechnicalMetadata);
        var query = (search ?? "").Trim();
        if (query.Length > 0)
        {
            all = all.Where(item =>
                Search(item.Title, query) ||
                Search(item.Description, query) ||
                item.Tags.Any(tag => Search(tag, query)) ||
                includeTechnicalMetadata && Search(item.RecordId, query)).ToList();
        }

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, MaximumPageSize);
        var items = all.Skip((page - 1) * pageSize).Take(pageSize).ToArray();
        return new(
            category,
            target is null ? null : RoomService.GetPlayerKey(target),
            target is null ? null : CurrentRecordId(target, category),
            page,
            pageSize,
            all.Count,
            Version(category, all),
            items);
    }

    public CatalogMutationPreviewDto PreviewReplacement(Player target, CatalogReplacementCommand command, string? language)
    {
        var category = NormalizeCategory(command.Category);
        var current = CurrentRecordId(target, category);
        if (!string.IsNullOrWhiteSpace(command.ExpectedCurrentRecordId) &&
            !string.Equals(command.ExpectedCurrentRecordId, current, StringComparison.OrdinalIgnoreCase))
            return Denied("stale_catalog_state", command.ActionType, category, target, null);

        var item = FindItem(category, command.RecordId, language, true);
        var actionWithoutRecord = category == "specialCard" &&
            command.ActionType is "remove" or "markUsed" or "restoreUsed";
        if (item is null && !actionWithoutRecord)
            return Denied("catalog_record_not_found", command.ActionType, category, target, null);
        if (!ValidateAction(category, command.ActionType))
            return Denied("catalog_action_not_supported", command.ActionType, category, target, null);
        if (!ValidateSeverity(category, command.RecordId, command.SeverityCode))
            return Denied("invalid_severity", command.ActionType, category, target, null);

        return new(
            true,
            "available",
            command.ActionType,
            category,
            RoomService.GetPlayerKey(target),
            null,
            CurrentDisplay(target, category),
            item?.Title ?? command.ActionType,
            null,
            null,
            Fingerprint(command.ActionType, category, current, command.RecordId, command.SeverityCode));
    }

    public CatalogMutationResult ApplyReplacement(Player target, CatalogReplacementCommand command)
    {
        var category = NormalizeCategory(command.Category);
        var preview = PreviewReplacement(target, command, "uk");
        if (!preview.Allowed)
            return new(false, preview.Code, category, command.ActionType, RoomService.GetPlayerKey(target), null);

        var success = category switch
        {
            "profession" => ApplyProfession(target, command.RecordId),
            "physicalHealth" => ApplyPhysicalHealth(target, command.RecordId, command.SeverityCode),
            "mentalHealth" => ApplyMentalHealth(target, command.RecordId, command.SeverityCode),
            "hobby" => ApplyHobby(target, command.RecordId),
            "phobia" => ApplyPhobia(target, command.RecordId),
            "characterTrait" => ApplyTrait(target, command.RecordId),
            "fact" => ApplyFact(target, command.RecordId),
            "inventory" => ApplyInventory(target, command.RecordId, command.ActionType),
            "specialCard" => ApplySpecialCard(target, command.RecordId, command.ActionType),
            "additionalPhysicalCondition" => ApplyAdditionalCondition(
                target, command.RecordId, command.ActionType, command.SeverityCode),
            _ => false
        };
        return new(
            success,
            success ? "success" : "catalog_apply_failed",
            category,
            command.ActionType,
            RoomService.GetPlayerKey(target),
            null);
    }

    public CatalogMutationPreviewDto PreviewOperation(
        Player source,
        Player? target,
        CharacteristicOperationCommand command)
    {
        var operation = command.Operation.Trim().ToLowerInvariant();
        var category = NormalizeCategory(command.Category);
        if (operation == "oppositesex")
        {
            var opposite = OppositeSex(source.Personality.Sex);
            return opposite is null
                ? Denied("explicit_sex_selection_required", operation, category, source, null)
                : AllowedOperation(operation, "personalitySex", source, null, source.Personality.Sex, opposite);
        }
        if (!CopyExchangeCategories.Contains(category))
            return Denied("catalog_operation_not_supported", operation, category, source, target);
        if (target is null || ReferenceEquals(source, target) ||
            RoomService.GetPlayerKey(source) == RoomService.GetPlayerKey(target))
            return Denied("distinct_players_required", operation, category, source, target);

        var sourceId = CurrentRecordId(source, category);
        var targetId = CurrentRecordId(target, category);
        if (!MatchesExpected(command.ExpectedSourceRecordId, sourceId) ||
            !MatchesExpected(command.ExpectedTargetRecordId, targetId))
            return Denied("stale_catalog_state", operation, category, source, target);

        return operation switch
        {
            "exchange" => AllowedOperation(
                operation, category, source, target,
                CurrentDisplay(source, category), CurrentDisplay(target, category),
                CurrentDisplay(target, category), CurrentDisplay(source, category)),
            "copy" => AllowedOperation(
                operation, category, source, target,
                CurrentDisplay(source, category), CurrentDisplay(source, category),
                CurrentDisplay(target, category), CurrentDisplay(source, category)),
            "transfer" or "steal" when
                !string.IsNullOrWhiteSpace(command.SourceReplacementRecordId) &&
                FindItem(category, command.SourceReplacementRecordId, "uk", true) is { } replacement =>
                AllowedOperation(
                    operation, category, source, target,
                    CurrentDisplay(source, category), replacement.Title,
                    CurrentDisplay(target, category), CurrentDisplay(source, category)),
            "transfer" or "steal" =>
                Denied("source_replacement_required", operation, category, source, target),
            _ => Denied("catalog_operation_not_supported", operation, category, source, target)
        };
    }

    public CatalogMutationResult ApplyOperation(
        Player source,
        Player? target,
        CharacteristicOperationCommand command)
    {
        var preview = PreviewOperation(source, target, command);
        if (!preview.Allowed)
            return new(false, preview.Code, preview.Category, preview.Operation,
                RoomService.GetPlayerKey(source), target is null ? null : RoomService.GetPlayerKey(target));

        var operation = command.Operation.Trim().ToLowerInvariant();
        if (operation == "oppositesex")
        {
            source.Personality.Sex = OppositeSex(source.Personality.Sex)!;
            return Result(true, operation, "personalitySex", source, null);
        }

        var category = NormalizeCategory(command.Category);
        var sourceValue = CloneValue(source, category);
        var targetValue = CloneValue(target!, category);
        var success = operation switch
        {
            "exchange" => AssignValue(source, category, targetValue) &&
                          AssignValue(target!, category, sourceValue),
            "copy" => AssignValue(target!, category, sourceValue),
            "transfer" or "steal" =>
                ApplyCatalogValue(source, category, command.SourceReplacementRecordId!, command.SeverityCode) &&
                AssignValue(target!, category, sourceValue),
            _ => false
        };
        return Result(success, operation, category, source, target);
    }

    public static string CurrentRecordId(Player player, string category) =>
        NormalizeCategory(category) switch
        {
            "profession" => player.Profession.Id,
            "physicalHealth" => player.PhysicalHealth.Id,
            "mentalHealth" => player.MentalHealth.Id,
            "hobby" => player.Hobby.Id,
            "phobia" => player.Phobia.Id,
            "characterTrait" => player.CharacterTrait.Id,
            "fact" => player.Fact.Id,
            "property" => player.Property?.DefinitionId ?? "",
            "specialCard" => player.SpecialCard.Id,
            _ => ""
        };

    private List<CatalogPickerItemDto> BuildItems(
        string category,
        string language,
        bool technical) => category switch
    {
        "profession" => gameData.Professions.Select(item => new CatalogPickerItemDto(
            ProfessionId(item), Localized(item.I18n, "profession", language, CleanProfession(item.Profession)),
            Localized(item.I18n, "bonus", language, item.Bonus), item.Type,
            item.Skills.Concat(item.CapabilityTags).ToArray(), [], null)).ToList(),
        "physicalHealth" or "additionalPhysicalCondition" => gameData.PhysicalConditions.Select(item =>
            HealthItem(item.Id, item.Name, item.Category, item.Tags, item.Localization, item.HasSeverity == true, language)).ToList(),
        "mentalHealth" => gameData.MentalConditions.Select(item =>
            HealthItem(item.Id, item.Name, item.Category, item.Tags, item.Localization, item.HasSeverity == true, language)).ToList(),
        "hobby" => gameData.Hobbies.Select(item => new CatalogPickerItemDto(
            HobbyId(item), Localized(item.I18n, "hobby", language, item.Hobby),
            Localized(item.I18n, "bonus", language, item.Bonus), item.Type,
            item.CapabilityTags.ToArray(), [], null)).ToList(),
        "phobia" => gameData.Phobias.Select(item => new CatalogPickerItemDto(
            item.Id, Localized(item.I18n, "name", language, item.Name),
            Localized(item.I18n, "description", language, item.Description), "phobia", [], [], null)).ToList(),
        "characterTrait" => gameData.CharacterTraits.Select(item => new CatalogPickerItemDto(
            TraitId(item), Localized(item.I18n, "trait", language, item.Trait),
            "", item.Type, [], [], null)).ToList(),
        "fact" => gameData.Facts.Select(item => new CatalogPickerItemDto(
            item.Id, Localized(item.I18n, "fact", language, item.Fact),
            Localized(item.I18n, "description", language, item.Description), item.Category,
            [item.Type, item.Source], [], null)).ToList(),
        "inventory" => gameData.Items.Select(item => new CatalogPickerItemDto(
            item.Id, Localized(item.I18n, "item", language, item.Item),
            Localized(item.I18n, "description", language, item.Category), item.Category,
            item.ResourceTags.Concat(item.ProtectionTags).ToArray(), [], null)).ToList(),
        "property" => gameData.Properties.Select(item => new CatalogPickerItemDto(
            item.Id, Localized(item.I18n.Item, language, item.Item), "",
            Localized(item.I18n.Category, language, item.Category),
            item.ResourceTags.Concat(item.ProtectionTags).ToArray(), [], null)).ToList(),
        "specialCard" => gameData.SpecialCards.Select(item => new CatalogPickerItemDto(
            item.Id, Localized(item.I18n, "name", language, item.Name),
            Localized(item.I18n, "description", language, item.Description),
            item.IsSecret ? "secret" : "public",
            [item.Phase, item.IsOneTimeUse ? "oneTime" : "reusable"],
            [], technical ? item.EffectType : null)).ToList(),
        _ => []
    };

    private CatalogPickerItemDto? FindItem(
        string category,
        string recordId,
        string? language,
        bool technical) =>
        BuildItems(category, Language(language), technical)
            .FirstOrDefault(item => string.Equals(item.RecordId, recordId, StringComparison.OrdinalIgnoreCase));

    private bool ApplyProfession(Player player, string id)
    {
        var data = gameData.Professions.FirstOrDefault(item =>
            string.Equals(ProfessionId(item), id, StringComparison.OrdinalIgnoreCase));
        if (data is null) return false;
        var experience = player.Profession.ExperienceYears;
        var level = player.Profession.ProfessionalLevel;
        var selectedItem = data.Items.FirstOrDefault() ?? ParsedProfessionItem(data.Profession);
        player.Profession = new()
        {
            Id = ProfessionId(data),
            Name = CleanProfession(data.Profession),
            ExperienceYears = experience,
            ProfessionalLevel = level,
            Type = data.Type,
            Skills = data.Skills.ToList(),
            AllItems = data.Items.ToList(),
            SelectedItem = selectedItem,
            SelectedItemIndex = data.Items.Count > 0 ? 0 : null,
            Bonus = data.Bonus,
            CapabilityTags = data.CapabilityTags.ToList(),
            Tooltip = data.Bonus,
            I18n = data.I18n
        };
        player.ProfessionItem = CreateItem(
            gameData.Items.FirstOrDefault(item =>
                string.Equals(item.Item, selectedItem, StringComparison.OrdinalIgnoreCase)),
            selectedItem,
            "profession");
        return true;
    }

    private bool ApplyPhysicalHealth(Player player, string id, string? severity)
    {
        var data = gameData.PhysicalConditions.FirstOrDefault(item =>
            string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        if (data is null) return false;
        var code = NormalizeSeverity(data.HasSeverity == true, data.Localization, severity);
        if (code is null) return false;
        var localized = ConditionText(data.Localization, "uk", code);
        var level = code == "none" ? SeverityLevel.None : SeverityHelper.GetSeverityLevelFromCode(code);
        player.PhysicalHealth = new()
        {
            Id = data.Id, BaseName = localized.Name, Name = code == "none" ? localized.Name :
                SeverityHelper.FormatNameWithSeverity(localized.Name, level),
            Category = data.Category, Tone = data.Tone, Rarity = data.Rarity, BaseSeverity = data.Severity,
            SeverityCode = code, SeverityLevel = code == "none" ? null : SeverityHelper.GetSeverityName(level),
            AllowsSeverity = code != "none", Visibility = data.Visibility, Description = localized.Description,
            SurvivalImpact = data.SurvivalImpact, SocialImpact = data.SocialImpact,
            MovementImpact = data.MovementImpact, PainLevel = data.PainLevel,
            TreatmentDifficulty = data.TreatmentDifficulty, IsFictional = data.IsFictional,
            Tags = data.Tags.ToList(), Tooltip = localized.Description,
            I18n = data.I18n, Localization = data.Localization
        };
        return true;
    }

    private bool ApplyMentalHealth(Player player, string id, string? severity)
    {
        var data = gameData.MentalConditions.FirstOrDefault(item =>
            string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        if (data is null) return false;
        var code = NormalizeSeverity(data.HasSeverity == true, data.Localization, severity);
        if (code is null) return false;
        var localized = ConditionText(data.Localization, "uk", code);
        var level = code == "none" ? SeverityLevel.None : SeverityHelper.GetSeverityLevelFromCode(code);
        player.MentalHealth = new()
        {
            Id = data.Id, BaseName = localized.Name, Name = code == "none" ? localized.Name :
                SeverityHelper.FormatNameWithSeverity(localized.Name, level),
            Category = data.Category, Tone = data.Tone, Rarity = data.Rarity, BaseSeverity = data.Severity,
            SeverityCode = code, SeverityLevel = code == "none" ? "" : SeverityHelper.GetSeverityName(level),
            AllowsSeverity = code != "none", Visibility = data.Visibility, Description = localized.Description,
            SurvivalImpact = data.SurvivalImpact, SocialImpact = data.SocialImpact,
            TreatmentDifficulty = data.TreatmentDifficulty, IsFictional = data.IsFictional,
            Tags = data.Tags.ToList(), Tooltip = localized.Description,
            I18n = data.I18n, Localization = data.Localization
        };
        return true;
    }

    private bool ApplyHobby(Player player, string id)
    {
        var data = gameData.Hobbies.FirstOrDefault(item =>
            string.Equals(HobbyId(item), id, StringComparison.OrdinalIgnoreCase));
        if (data is null) return false;
        player.Hobby = new()
        {
            Id = HobbyId(data), Name = data.Hobby, Type = data.Type, Item = data.Item,
            Bonus = data.Bonus, CapabilityTags = data.CapabilityTags.ToList(),
            Tooltip = string.Join(". ", new[] { data.Bonus, data.Item }.Where(value => !string.IsNullOrWhiteSpace(value))),
            I18n = data.I18n
        };
        return true;
    }

    private bool ApplyPhobia(Player player, string id)
    {
        var data = gameData.Phobias.FirstOrDefault(item =>
            string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        if (data is null) return false;
        player.Phobia = new()
        {
            Id = data.Id, Name = data.Name, Description = data.Description,
            BunkerEffect = data.BunkerEffect, I18n = data.I18n
        };
        return true;
    }

    private bool ApplyTrait(Player player, string id)
    {
        var data = gameData.CharacterTraits.FirstOrDefault(item =>
            string.Equals(TraitId(item), id, StringComparison.OrdinalIgnoreCase));
        if (data is null) return false;
        player.CharacterTrait = new() { Id = TraitId(data), Name = data.Trait, Type = data.Type, I18n = data.I18n };
        return true;
    }

    private bool ApplyFact(Player player, string id)
    {
        var data = gameData.Facts.FirstOrDefault(item =>
            string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        if (data is null) return false;
        player.Fact = new()
        {
            Id = data.Id, Source = data.Source, Type = data.Type, Category = data.Category,
            Name = data.Fact, Description = data.Description, Tooltip = data.Description, I18n = data.I18n
        };
        return true;
    }

    private bool ApplyInventory(Player player, string id, string action)
    {
        var data = gameData.Items.FirstOrDefault(item =>
            string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        if (action == "remove")
            return player.Inventory.Items.RemoveAll(item =>
                string.Equals(item.DefinitionId, id, StringComparison.OrdinalIgnoreCase)) > 0;
        if (data is null) return false;
        var created = CreateItem(data, data.Item, "inventory");
        if (action == "add")
        {
            player.Inventory.Items.Add(created);
            return true;
        }
        if (action != "replace") return false;
        var index = player.Inventory.Items.FindIndex(item =>
            !string.Equals(item.Source, "profession", StringComparison.OrdinalIgnoreCase));
        if (index < 0) player.Inventory.Items.Add(created);
        else player.Inventory.Items[index] = created;
        return true;
    }

    private bool ApplySpecialCard(Player player, string id, string action)
    {
        if (action == "remove")
        {
            var removedId = player.SpecialCard.Id;
            player.SpecialCards.RemoveAll(card =>
                string.Equals(card.Id, removedId, StringComparison.OrdinalIgnoreCase));
            player.SpecialCard = player.SpecialCards.FirstOrDefault() ?? new();
            return true;
        }
        if (action == "markUsed")
        {
            if (string.IsNullOrWhiteSpace(player.SpecialCard.Id)) return false;
            player.SpecialCard.IsUsed = true;
            var listed = player.SpecialCards.FirstOrDefault(card =>
                string.Equals(card.Id, player.SpecialCard.Id, StringComparison.OrdinalIgnoreCase));
            if (listed is not null) listed.IsUsed = true;
            return true;
        }
        if (action == "restoreUsed")
        {
            if (string.IsNullOrWhiteSpace(player.SpecialCard.Id)) return false;
            player.SpecialCard.IsUsed = false;
            player.SpecialCard.IsActive = false;
            var listed = player.SpecialCards.FirstOrDefault(card =>
                string.Equals(card.Id, player.SpecialCard.Id, StringComparison.OrdinalIgnoreCase));
            if (listed is not null)
            {
                listed.IsUsed = false;
                listed.IsActive = false;
            }
            return true;
        }
        var data = gameData.SpecialCards.FirstOrDefault(item =>
            string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        if (data is null || action is not ("issue" or "replace")) return false;
        var created = new SpecialCard
        {
            Id = data.Id, Name = data.Name, Description = data.Description,
            IsSecret = data.IsSecret, IsOneTimeUse = data.IsOneTimeUse,
            Phase = data.Phase, EffectType = data.EffectType, RequiresTarget = data.RequiresTarget,
            EffectDuration = string.IsNullOrWhiteSpace(data.EffectDuration) ? "instant" : data.EffectDuration,
            I18n = data.I18n
        };
        if (action == "issue")
        {
            if (player.SpecialCards.Any(card =>
                    string.Equals(card.Id, data.Id, StringComparison.OrdinalIgnoreCase)))
                return false;
            player.SpecialCards.Add(created);
            if (string.IsNullOrWhiteSpace(player.SpecialCard.Id))
                player.SpecialCard = created;
        }
        else
        {
            var index = player.SpecialCards.FindIndex(card =>
                string.Equals(card.Id, player.SpecialCard.Id, StringComparison.OrdinalIgnoreCase));
            if (index < 0) player.SpecialCards.Insert(0, created);
            else player.SpecialCards[index] = created;
            player.SpecialCard = created;
        }
        return true;
    }

    private bool ApplyAdditionalCondition(Player player, string id, string action, string? severity)
    {
        if (action == "remove")
            return player.AdditionalConditionEffects.RemoveAll(effect =>
                string.Equals(effect.ConditionId, id, StringComparison.OrdinalIgnoreCase)) > 0;
        if (action != "add" || player.AdditionalConditionEffects.Any(effect =>
                string.Equals(effect.ConditionId, id, StringComparison.OrdinalIgnoreCase)))
            return false;
        var data = gameData.PhysicalConditions.FirstOrDefault(item =>
            string.Equals(item.Id, id, StringComparison.OrdinalIgnoreCase));
        if (data is null) return false;
        var code = NormalizeSeverity(data.HasSeverity == true, data.Localization, severity);
        if (code is null) return false;
        var text = ConditionText(data.Localization, "uk", code);
        player.AdditionalConditionEffects.Add(new()
        {
            Id = $"gm:{Guid.NewGuid():N}", ConditionId = data.Id, BaseName = text.Name,
            Name = text.Name, SeverityCode = code,
            SeverityLevel = code == "none" ? "" :
                SeverityHelper.GetSeverityName(SeverityHelper.GetSeverityLevelFromCode(code)),
            Description = text.Description, Localization = data.Localization
        });
        return true;
    }

    private bool ApplyCatalogValue(Player player, string category, string id, string? severity) =>
        category switch
        {
            "profession" => ApplyProfession(player, id),
            "physicalHealth" => ApplyPhysicalHealth(player, id, severity),
            "mentalHealth" => ApplyMentalHealth(player, id, severity),
            "hobby" => ApplyHobby(player, id),
            "phobia" => ApplyPhobia(player, id),
            "characterTrait" => ApplyTrait(player, id),
            "fact" => ApplyFact(player, id),
            _ => false
        };

    private static object CloneValue(Player player, string category) => category switch
    {
        "profession" => new ProfessionSlot(Clone(player.Profession), Clone(player.ProfessionItem)),
        "physicalHealth" => Clone(player.PhysicalHealth),
        "mentalHealth" => Clone(player.MentalHealth),
        "hobby" => Clone(player.Hobby),
        "phobia" => Clone(player.Phobia),
        "characterTrait" => Clone(player.CharacterTrait),
        "fact" => Clone(player.Fact),
        _ => new object()
    };

    private static bool AssignValue(Player player, string category, object value)
    {
        switch (category)
        {
            case "profession":
                var profession = (ProfessionSlot)value;
                player.Profession = Clone(profession.Profession);
                player.ProfessionItem = Clone(profession.Item);
                return true;
            case "physicalHealth": player.PhysicalHealth = Clone((PhysicalHealth)value); return true;
            case "mentalHealth": player.MentalHealth = Clone((MentalHealth)value); return true;
            case "hobby": player.Hobby = Clone((Hobby)value); return true;
            case "phobia": player.Phobia = Clone((Phobia)value); return true;
            case "characterTrait": player.CharacterTrait = Clone((CharacterTrait)value); return true;
            case "fact": player.Fact = Clone((Fact)value); return true;
            default: return false;
        }
    }

    private static bool ValidateAction(string category, string action) => category switch
    {
        "inventory" => action is "add" or "replace" or "remove",
        "specialCard" => action is "issue" or "replace" or "remove" or "markUsed" or "restoreUsed",
        "additionalPhysicalCondition" => action is "add" or "remove",
        _ => action == "replace"
    };

    private bool ValidateSeverity(string category, string id, string? severity)
    {
        if (category is not ("physicalHealth" or "mentalHealth" or "additionalPhysicalCondition"))
            return string.IsNullOrWhiteSpace(severity);
        var item = FindItem(category, id, "uk", true);
        if (item is null) return false;
        return item.SeverityCodes.Count == 0
            ? string.IsNullOrWhiteSpace(severity) || severity == "none"
            : item.SeverityCodes.Contains(severity ?? "", StringComparer.Ordinal);
    }

    private static string? NormalizeSeverity(
        bool allowsSeverity,
        Dictionary<string, ConditionLocalization>? localization,
        string? requested)
    {
        if (!allowsSeverity) return "none";
        if (string.IsNullOrWhiteSpace(requested)) return null;
        var available = AvailableSeverity(localization);
        return available.Contains(requested, StringComparer.Ordinal) ? requested : null;
    }

    private static CatalogPickerItemDto HealthItem(
        string id,
        string fallbackName,
        string category,
        IEnumerable<string>? tags,
        Dictionary<string, ConditionLocalization>? localization,
        bool allowsSeverity,
        string language)
    {
        var text = ConditionText(localization, language, "none");
        return new(
            id,
            string.IsNullOrWhiteSpace(text.Name) ? fallbackName : text.Name,
            text.Description,
            category,
            tags?.ToArray() ?? [],
            allowsSeverity ? AvailableSeverity(localization) : [],
            null);
    }

    private static IReadOnlyList<string> AvailableSeverity(
        Dictionary<string, ConditionLocalization>? localization)
    {
        if (localization is null) return [];
        var keys = localization.Values
            .SelectMany(item => item.Descriptions.Keys)
            .ToHashSet(StringComparer.Ordinal);
        return SeverityOrder.Where(keys.Contains).ToArray();
    }

    private static (string Name, string Description) ConditionText(
        Dictionary<string, ConditionLocalization>? localization,
        string language,
        string severity)
    {
        if (localization is null || localization.Count == 0) return ("", "");
        var value = localization.GetValueOrDefault(language) ??
                    localization.GetValueOrDefault("uk") ??
                    localization.Values.First();
        var description = severity != "none" && value.Descriptions.TryGetValue(severity, out var detailed)
            ? detailed
            : value.Description;
        return (value.Name, description);
    }

    private static CatalogPickerCategoryDto Category(
        string key, string language, bool replace, bool severity, params string[] actions)
    {
        var titles = new Dictionary<string, (string uk, string en, string ru)>
        {
            ["profession"] = ("Професія", "Profession", "Профессия"),
            ["physicalHealth"] = ("Фізичний стан", "Physical health", "Физическое состояние"),
            ["mentalHealth"] = ("Психічний стан", "Mental health", "Психическое состояние"),
            ["hobby"] = ("Хобі", "Hobby", "Хобби"),
            ["phobia"] = ("Фобія", "Phobia", "Фобия"),
            ["characterTrait"] = ("Риса характеру", "Character trait", "Черта характера"),
            ["fact"] = ("Факт", "Fact", "Факт"),
            ["inventory"] = ("Інвентар", "Inventory", "Инвентарь"),
            ["property"] = ("Майно", "Property", "Имущество"),
            ["specialCard"] = ("Спеціальна карта", "Special card", "Специальная карта"),
            ["additionalPhysicalCondition"] = ("Додатковий стан", "Additional condition", "Дополнительное состояние")
        };
        var title = titles[key];
        return new(key, language == "en" ? title.en : language == "ru" ? title.ru : title.uk,
            replace, severity, actions);
    }

    private static CatalogMutationPreviewDto AllowedOperation(
        string operation, string category, Player source, Player? target,
        string? beforeSource, string? afterSource,
        string? beforeTarget = null, string? afterTarget = null) => new(
            true, "available", operation, category,
            RoomService.GetPlayerKey(source),
            target is null ? null : RoomService.GetPlayerKey(target),
            beforeSource, afterSource, beforeTarget, afterTarget,
            Fingerprint(operation, category,
                CurrentRecordId(source, category),
                target is null ? "" : CurrentRecordId(target, category),
                afterSource));

    private static CatalogMutationPreviewDto Denied(
        string code, string operation, string category, Player source, Player? target) => new(
            false, code, operation, category,
            RoomService.GetPlayerKey(source),
            target is null ? null : RoomService.GetPlayerKey(target),
            CurrentDisplay(source, category), null,
            target is null ? null : CurrentDisplay(target, category), null,
            Fingerprint(operation, category, CurrentRecordId(source, category),
                target is null ? "" : CurrentRecordId(target, category)));

    private static CatalogMutationResult Result(
        bool success, string operation, string category, Player source, Player? target) => new(
            success, success ? "success" : "catalog_apply_failed", category, operation,
            RoomService.GetPlayerKey(source),
            target is null ? null : RoomService.GetPlayerKey(target));

    private static string CurrentDisplay(Player player, string category) => NormalizeCategory(category) switch
    {
        "profession" => player.Profession.Name,
        "physicalHealth" => player.PhysicalHealth.Name,
        "mentalHealth" => player.MentalHealth.Name,
        "hobby" => player.Hobby.Name,
        "phobia" => player.Phobia.Name,
        "characterTrait" => player.CharacterTrait.Name,
        "fact" => player.Fact.Name,
        "inventory" => string.Join(", ", player.Inventory.Items.Select(item => item.Name)),
        "property" => player.Property?.GetDisplayText("uk") ?? "",
        "specialCard" => player.SpecialCard.Name,
        "personalitySex" => player.Personality.Sex,
        _ => ""
    };

    private static string? OppositeSex(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "чоловіча" or "male" or "мужской" => value.Any(char.IsUpper) ? "Жіноча" : "жіноча",
        "жіноча" or "female" or "женский" => value.Any(char.IsUpper) ? "Чоловіча" : "чоловіча",
        _ => null
    };

    private static Item CreateItem(ItemData? data, string fallbackName, string source) => new()
    {
        DefinitionId = data?.Id ?? "",
        Name = data?.Item ?? fallbackName,
        Description = data is null ? "" : $"Категорія: {data.Category}",
        Quantity = 1,
        Unit = "шт",
        IsUsefulInBunker = true,
        Rarity = "Звичайний",
        InstanceId = $"{source}:{Guid.NewGuid():N}",
        Source = source,
        ResourceTags = data?.ResourceTags.ToList() ?? [],
        ProtectionTags = data?.ProtectionTags.ToList() ?? [],
        ThreatUsage = data?.ThreatUsage is null ? null : Clone(data.ThreatUsage),
        I18n = data?.I18n is null ? null : Clone(data.I18n)
    };

    private static string ProfessionId(ProfessionData item) =>
        string.IsNullOrWhiteSpace(item.Id) ? LegacyId("profession", item.Profession, item.Type) : item.Id;
    private static string HobbyId(HobbyData item) =>
        string.IsNullOrWhiteSpace(item.Id) ? LegacyId("hobby", item.Hobby, item.Type) : item.Id;
    private static string TraitId(CharacterTraitData item) =>
        string.IsNullOrWhiteSpace(item.Id) ? LegacyId("characterTrait", item.Trait, item.Type) : item.Id;
    public static string LegacyId(string category, params string?[] values) =>
        $"legacy_{category}_{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            string.Join('\u001f', values.Select(value => value?.Trim() ?? "")))))[..16].ToLowerInvariant()}";

    private static string CleanProfession(string value) =>
        Regex.Replace(value ?? "", @"\s*\(\s*\+[^)]*\)\s*$", "").Trim();
    private static string ParsedProfessionItem(string value)
    {
        var match = Regex.Match(value ?? "", @"\(\s*\+\s*(?<item>[^)]*)\)");
        return match.Success ? match.Groups["item"].Value.Trim() : "";
    }

    private static string Localized(
        Dictionary<string, JsonElement>? i18n,
        string field,
        string language,
        string fallback)
    {
        if (i18n is null || !i18n.TryGetValue(field, out var value)) return fallback;
        if (value.ValueKind == JsonValueKind.String) return value.GetString() ?? fallback;
        if (value.ValueKind == JsonValueKind.Object &&
            value.TryGetProperty(language, out var localized) &&
            localized.ValueKind == JsonValueKind.String)
            return localized.GetString() ?? fallback;
        return fallback;
    }

    private static string Localized(
        Dictionary<string, string>? values,
        string language,
        string fallback) =>
        values is not null &&
        (values.TryGetValue(language, out var value) || values.TryGetValue("uk", out value)) &&
        !string.IsNullOrWhiteSpace(value)
            ? value
            : fallback;

    private static bool Search(string? value, string query) =>
        value?.Contains(query, StringComparison.CurrentCultureIgnoreCase) == true;
    private static bool MatchesExpected(string? expected, string current) =>
        string.IsNullOrWhiteSpace(expected) ||
        string.Equals(expected, current, StringComparison.OrdinalIgnoreCase);
    private static string Language(string? value) =>
        value?.Trim().ToLowerInvariant() is "en" or "ru" ? value.Trim().ToLowerInvariant() : "uk";
    private static string NormalizeCategory(string? value) => value?.Trim() switch
    {
        "Profession" or "profession" => "profession",
        "PhysicalHealth" or "physicalHealth" => "physicalHealth",
        "MentalHealth" or "mentalHealth" => "mentalHealth",
        "Hobby" or "hobby" => "hobby",
        "Phobia" or "phobia" => "phobia",
        "CharacterTrait" or "characterTrait" => "characterTrait",
        "Fact" or "fact" => "fact",
        "Inventory" or "inventory" => "inventory",
        "Property" or "property" => "property",
        "SpecialCard" or "specialCard" => "specialCard",
        "AdditionalPhysicalCondition" or "additionalPhysicalCondition" => "additionalPhysicalCondition",
        "PersonalitySex" or "personalitySex" => "personalitySex",
        _ => value?.Trim() ?? ""
    };
    private static string Version(string category, IReadOnlyList<CatalogPickerItemDto> items) =>
        Fingerprint(category, items.Count.ToString(), string.Join('|', items.Select(item => item.RecordId)));
    private static string Fingerprint(params string?[] values) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            string.Join('\u001f', values.Select(value => value ?? "")))))[..24].ToLowerInvariant();
    private static T Clone<T>(T value) =>
        JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value))!;

    private sealed record ProfessionSlot(Profession Profession, Item Item);
}

public sealed class CatalogItemRequestException(string code) : Exception(code)
{
    public string Code { get; } = code;
}
