using Bunker.Models.Сharacteristics;
using System.Text.Json.Serialization;

namespace Bunker.Models
{
    public class Player
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = "";
        public string ConnectionId { get; set; } = "";
        
        // Стабільний ID гравця (зберігається в localStorage клієнта)
        public string StablePlayerId { get; set; } = "";

        [JsonIgnore]
        public Guid? AccountUserId { get; set; }
        [JsonIgnore]
        public string RecoveryReconnectTokenHash { get; set; } = "";

        // Поточний статус SignalR-з'єднання. Гравця не видаляємо одразу після refresh.
        public bool IsConnected { get; set; } = true;
        public DateTime? DisconnectedAt { get; set; }
        public bool IsSpectatorGm { get; set; }
        public bool HasSeenOmniscientState { get; set; }
        public GmMode GmRole { get; set; } = GmMode.PlayerHost;
        public bool IsLobbySpectator { get; set; }
        public bool IsLobbyReady { get; set; }

        public Profession Profession { get; set; } = new();
        public Item ProfessionItem { get; set; } = new();
        public Inventory Inventory { get; set; } = new();
        public GeneratedProperty? Property { get; set; }
        public PersonalInfo PersonalInfo { get; set; } = new();
        public CharacterTrait CharacterTrait { get; set; } = new();
        public Phobia Phobia { get; set; } = new();
        public PhysicalHealth PhysicalHealth { get; set; } = new();
        public MentalHealth MentalHealth { get; set; } = new();
        public Hobby Hobby { get; set; } = new();
        public Personality Personality { get; set; } = new();
        public Body Body { get; set; } = new();
		public Fact Fact { get; set; } = new();
        public SpecialCard SpecialCard { get; set; } = new();
        public List<SpecialCard> SpecialCards { get; set; } = new();

		// Відстеження відкритих характеристик
		public RevealedCharacteristics Revealed { get; set; } = new();
        
        // Статус гравця в грі
        public bool IsEliminated { get; set; } = false;
        public int? EliminatedAtRound { get; set; }
        public bool EliminatedByVote { get; set; }
        public bool CanRevealAllAfterElimination { get; set; }
        public bool HasRevealedAllAfterElimination { get; set; }
        
        // Номер місця (рандомізується при старті гри)
        public int SeatNumber { get; set; } = 0;
        
        // Захист від голосування (від спеціальної карти)
        public bool IsProtectedFromVote { get; set; } = false;
        
        // Додаткові голоси (від спеціальної карти)
        public int ExtraVotes { get; set; } = 0;

        public int? InventoryProtectedUntilRound { get; set; }
        public int? CharacteristicsProtectedUntilRound { get; set; }
        public EliminationVoteImmunity EliminationVoteImmunity { get; set; } = new();
        public List<PlayerConditionEffect> AdditionalConditionEffects { get; set; } = new();
        
    }
}
