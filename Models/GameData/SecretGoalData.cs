namespace Bunker.Models.GameData
{
    /// <summary>
    /// Дані таємної цілі з JSON файлу
    /// </summary>
    public class SecretGoalData
    {
        public string Id { get; set; } = "";
        public string Type { get; set; } = "";
        public string Goal { get; set; } = "";
        public string Description { get; set; } = "";
        public string BunkerEffect { get; set; } = "";
    }

    /// <summary>
    /// Кореневий об'єкт для десеріалізації JSON
    /// </summary>
    public class SecretGoalsRoot
    {
        public List<SecretGoalData> SecretGoals { get; set; } = new();
    }
}
