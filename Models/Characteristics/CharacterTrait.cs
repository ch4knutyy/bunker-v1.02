namespace Bunker.Models.Сharacteristics
{
    /// <summary>
    /// Риса характеру персонажа
    /// </summary>
    public class CharacterTrait
    {
        /// <summary>
        /// Назва риси характеру (1-3 слова)
        /// </summary>
        public string Name { get; set; } = "";
        
        /// <summary>
        /// Тип риси: serious, meme, dark, intimate, absurd, creative
        /// </summary>
        public string Type { get; set; } = "";
    }
}
