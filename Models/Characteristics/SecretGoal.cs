namespace Bunker.Models.Сharacteristics
{
    /// <summary>
    /// Таємна ціль персонажа - прихована мета яку гравець має досягти
    /// </summary>
    public class SecretGoal
    {
        /// <summary>
        /// Ідентифікатор цілі
        /// </summary>
        public string Id { get; set; } = "";
        
        /// <summary>
        /// Тип цілі (dark, meme, normal, adult, mixed)
        /// </summary>
        public string Type { get; set; } = "";
        
        /// <summary>
        /// Текст цілі
        /// </summary>
        public string Goal { get; set; } = "";
        
        /// <summary>
        /// Короткий опис цілі
        /// </summary>
        public string Description { get; set; } = "";
        
        /// <summary>
        /// Як ціль впливає на поведінку в бункері
        /// </summary>
        public string BunkerEffect { get; set; } = "";
        
        /// <summary>
        /// Чи розкрита ціль іншим гравцям
        /// </summary>
        public bool IsRevealed { get; set; } = false;
        
        /// <summary>
        /// Автоматично сформований tooltip
        /// </summary>
        public string Tooltip => BuildTooltip();
        
        /// <summary>
        /// Чи є tooltip для цієї характеристики
        /// </summary>
        public bool HasTooltip => !string.IsNullOrEmpty(Goal);
        
        private string BuildTooltip()
        {
            if (string.IsNullOrEmpty(Goal))
                return "";
            
            var parts = new List<string>();
            
            parts.Add($"Ціль: {Goal}");
            
            if (!string.IsNullOrEmpty(Description))
            {
                parts.Add($"Опис: {Description}");
            }
            
            if (!string.IsNullOrEmpty(BunkerEffect))
            {
                parts.Add($"Ефект у бункері: {BunkerEffect}");
            }
            
            return string.Join(". ", parts);
        }
    }
}
