using Bunker.Models;

namespace Bunker.Services;

public static class GmPlayerStateMutator
{
    public static bool CanHideCharacteristic(string key) => key is
        "Personality" or "Body" or "Profession" or "PhysicalHealth" or "MentalHealth" or "Hobby" or
        "CharacterTrait" or "Phobia" or "Inventory" or "Property" or "Fact" or "SpecialCard";

    public static bool HideCharacteristic(Player player, string key)
    {
        player.Revealed ??= new RevealedCharacteristics();
        switch (key)
        {
            case "Personality": player.Revealed.Personality = false; break;
            case "Body": player.Revealed.Body = false; break;
            case "Profession": player.Revealed.Profession = false; break;
            case "PhysicalHealth": player.Revealed.PhysicalHealth = false; break;
            case "MentalHealth": player.Revealed.MentalHealth = false; break;
            case "Hobby": player.Revealed.Hobby = false; break;
            case "CharacterTrait": player.Revealed.CharacterTrait = false; break;
            case "Phobia": player.Revealed.Phobia = false; break;
            case "Inventory": player.Revealed.Inventory = false; break;
            case "Property": player.Revealed.Property = false; break;
            case "Fact": player.Revealed.Fact = false; break;
            case "SpecialCard": player.Revealed.SpecialCard = false; break;
            default: return false;
        }
        player.Revealed.RevealedValues.Remove(key);
        return true;
    }

    public static bool ChangeConditionSeverity(Player player, string conditionId, string severityCode, string severityLabel)
    {
        var effect = player.AdditionalConditionEffects.FirstOrDefault(item => item.Id == conditionId || item.ConditionId == conditionId);
        if (effect == null) return false;
        effect.SeverityCode = severityCode;
        effect.SeverityLevel = severityLabel;
        return true;
    }

    public static bool RemoveCondition(Player player, string conditionId) =>
        player.AdditionalConditionEffects.RemoveAll(item => item.Id == conditionId || item.ConditionId == conditionId) > 0;
}
