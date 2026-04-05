using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Models.ViewModels;

namespace Bunker.Helpers
{
    /// <summary>
    /// Helper для створення CharacteristicTooltipModel з різних типів характеристик
    /// </summary>
    public static class TooltipHelper
    {
        /// <summary>
        /// Створити модель tooltip для професії
        /// </summary>
        public static CharacteristicTooltipModel FromProfession(Profession profession)
        {
            var displayName = profession.Name;
            if (!string.IsNullOrEmpty(profession.SelectedItem))
            {
                displayName += $" (+{profession.SelectedItem})";
            }

            return new CharacteristicTooltipModel
            {
                Name = displayName,
                Tooltip = profession.Tooltip,
                TypeClass = "profession",
                AdditionalInfo = profession.SelectedItem
            };
        }

        /// <summary>
        /// Створити модель tooltip для хобі
        /// </summary>
        public static CharacteristicTooltipModel FromHobby(Hobby hobby)
        {
            return new CharacteristicTooltipModel
            {
                Name = hobby.Name,
                Tooltip = hobby.Tooltip,
                TypeClass = "hobby",
                AdditionalInfo = hobby.Item
            };
        }

        /// <summary>
        /// Створити модель tooltip для ментального здоров'я
        /// </summary>
        public static CharacteristicTooltipModel FromMentalHealth(MentalHealth mentalHealth)
        {
            return new CharacteristicTooltipModel
            {
                Name = mentalHealth.Name,
                Tooltip = mentalHealth.Tooltip,
                TypeClass = "mental",
                AdditionalInfo = mentalHealth.SeverityLevel
            };
        }

        /// <summary>
        /// Створити модель tooltip для фізичного здоров'я
        /// </summary>
        public static CharacteristicTooltipModel FromPhysicalHealth(PhysicalHealth physicalHealth)
        {
            return new CharacteristicTooltipModel
            {
                Name = physicalHealth.Name,
                Tooltip = physicalHealth.Tooltip,
                TypeClass = "physical",
                AdditionalInfo = physicalHealth.SeverityLevel
            };
        }

        /// <summary>
        /// Створити модель tooltip для особливості (trait)
        /// </summary>
        public static CharacteristicTooltipModel FromTrait(Traits trait)
        {
            return new CharacteristicTooltipModel
            {
                Name = trait.Name,
                Tooltip = trait.Tooltip,
                TypeClass = "trait",
                AdditionalInfo = trait.Type
            };
        }

        /// <summary>
        /// Створити модель tooltip для таємної цілі
        /// </summary>
        public static CharacteristicTooltipModel FromSecretGoal(SecretGoal secretGoal)
        {
            return new CharacteristicTooltipModel
            {
                Name = secretGoal.Goal,
                Tooltip = secretGoal.Tooltip,
                TypeClass = "secret-goal",
                AdditionalInfo = secretGoal.Type
            };
        }
    }
}
