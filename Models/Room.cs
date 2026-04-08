namespace Bunker.Models
{
    /// <summary>
    /// Стан гри в кімнаті
    /// </summary>
    public enum RoomState
    {
        Lobby,      // Очікування гравців
        Playing,    // Гра триває
        Voting,     // Голосування
        Finished    // Гра завершена
    }

    /// <summary>
    /// Ігрова кімната
    /// </summary>
    public class Room
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8].ToUpper();
        public string Name { get; set; } = "";
        public string? Password { get; set; }
        public bool HasPassword => !string.IsNullOrEmpty(Password);
        public int MaxPlayers { get; set; } = 12;
        public int MinPlayers { get; set; } = 4;
        
        /// <summary>
        /// ConnectionId хоста (творця кімнати)
        /// </summary>
        public string HostConnectionId { get; set; } = "";
        
        /// <summary>
        /// Ім'я хоста
        /// </summary>
        public string HostName { get; set; } = "";
        
        /// <summary>
        /// Гравці в кімнаті (ConnectionId -> Player)
        /// </summary>
        public Dictionary<string, Player> Players { get; set; } = new();
        
        /// <summary>
        /// Стан гри
        /// </summary>
        public RoomState State { get; set; } = RoomState.Lobby;
        
        /// <summary>
        /// Час створення кімнати
        /// </summary>
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        
        /// <summary>
        /// Поточний раунд
        /// </summary>
        public int CurrentRound { get; set; } = 0;
        
        /// <summary>
        /// ConnectionId гравця, чия черга
        /// </summary>
        public string? CurrentTurnPlayerId { get; set; }
        
        /// <summary>
        /// Апокаліпсис для цієї гри
        /// </summary>
        public Apocalypse? Apocalypse { get; set; }
        
        /// <summary>
        /// Бункер для цієї гри
        /// </summary>
        public BunkerInfo? Bunker { get; set; }
        
        /// <summary>
        /// Поточне голосування
        /// </summary>
        public VotingSession? CurrentVoting { get; set; }
        
        /// <summary>
        /// Кількість гравців
        /// </summary>
        public int PlayerCount => Players.Count;
        
        /// <summary>
        /// Чи можна приєднатися
        /// </summary>
        public bool CanJoin => State == RoomState.Lobby && PlayerCount < MaxPlayers;
        
        /// <summary>
        /// Чи можна почати гру
        /// </summary>
        public bool CanStart => State == RoomState.Lobby && PlayerCount >= MinPlayers;
        
        /// <summary>
        /// Перевірити чи є гравець хостом
        /// </summary>
        public bool IsHost(string connectionId) => HostConnectionId == connectionId;
        
        /// <summary>
        /// Отримати публічну інформацію про кімнату (для списку)
        /// </summary>
        public object ToPublicInfo()
        {
            return new
            {
                id = Id,
                name = Name,
                hasPassword = HasPassword,
                playerCount = PlayerCount,
                maxPlayers = MaxPlayers,
                hostName = HostName,
                state = State.ToString(),
                canJoin = CanJoin
            };
        }
    }
}
