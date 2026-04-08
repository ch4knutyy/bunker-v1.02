using Bunker.Models.Сharacteristics;

namespace Bunker.Models
{
    public class Player
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = "";
        public string ConnectionId { get; set; } = "";

        public Profession Profession { get; set; } = new();
        public Inventory Inventory { get; set; } = new();
        public PersonalInfo PersonalInfo { get; set; } = new();
        public CharacterTrait CharacterTrait { get; set; } = new();
        public Phobia Phobia { get; set; } = new();
        public Secret Secret { get; set; } = new();
        public PhysicalHealth PhysicalHealth { get; set; } = new();
        public MentalHealth MentalHealth { get; set; } = new();
        public Hobby Hobby { get; set; } = new();
        public Personality Personality { get; set; } = new();
        public Traits Traits { get; set; } = new();
        public Body Body { get; set; } = new();
        public SecretGoal SecretGoal { get; set; } = new();

        // Відстеження відкритих характеристик
        public RevealedCharacteristics Revealed { get; set; } = new();
        
        // Статус гравця в грі
        public bool IsEliminated { get; set; } = false;
        
        // Захист від голосування (від спеціальної карти)
        public bool IsProtectedFromVote { get; set; } = false;
        
        // Додаткові голоси (від спеціальної карти)
        public int ExtraVotes { get; set; } = 0;
        
        // Спеціальні карти гравця
        public List<SpecialCard> Cards { get; set; } = new();
    }
}
