namespace Bunker.Models
{
    public class RevealedCharacteristics
    {
        // Булеві значення для швидкої перевірки
        public bool Personality { get; set; } = false;
        public bool Body { get; set; } = false;
        public bool Profession { get; set; } = false;
        public bool PhysicalHealth { get; set; } = false;
        public bool MentalHealth { get; set; } = false;
        public bool Hobby { get; set; } = false;
        public bool CharacterTrait { get; set; } = false;
        public bool Phobia { get; set; } = false;
        public bool Traits { get; set; } = false;
        public bool Inventory { get; set; } = false;
        public bool Secret { get; set; } = false;
        public bool SecretGoal { get; set; } = false;
        
        // Збереження реальних значень для показу після reconnect
        public Dictionary<string, RevealedData> RevealedValues { get; set; } = new();
    }
    
    public class RevealedData
    {
        public string Value { get; set; } = "";
        public string? Tooltip { get; set; }
        public bool HasTooltip { get; set; } = false;
        public string Label { get; set; } = "";
    }
}
