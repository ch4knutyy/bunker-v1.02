using Bunker.Models.GameData;

namespace Bunker.Models
{
	/// <summary>
	/// Стан гри в кімнаті
	/// </summary>
	public enum RoomState
	{
		Waiting,
		Lobby,      // Очікування гравців
		Playing,    // Гра триває
		Voting,     // Голосування
		Finished    // Гра завершена
	}

	/// <summary>
	/// Детальна фаза поточного ігрового циклу.
	/// </summary>
	public enum GamePhase
	{
		Lobby,
		RoundReveal,
		RoundEnded,
		Threat,
		ExtraInventory,
		PreVotingReadyCheck,
		Voting,
		VotingResults,
		Finished
	}

	/// <summary>
	/// Ігрова кімната
	/// </summary>
	public class Room
	{
		public GmMode GmMode { get; set; } = GmMode.PlayerHost;
		public HashSet<string> IrreversibleOmniscientPlayerIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
		public HashSet<string> ProcessedOmniscientCommandIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
		public HashSet<string> ProcessedLobbyCommandIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
		public HashSet<string> ProcessedGameResetCommandIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
		[System.Text.Json.Serialization.JsonIgnore]
		public object GameSettingsSyncRoot { get; } = new();
		public RoomGameSettings GameSettings { get; set; } = new();
		public RoomGameSettings? FrozenGameSettings { get; set; }
		public long SettingsRevision { get; set; } = 1;
		[System.Text.Json.Serialization.JsonIgnore]
		public long GuestWarningRevision { get; set; } = 1;
		public bool SettingsFrozen { get; set; }
		public int? ResolvedBunkerCapacity { get; set; }
		public int ThreatsTriggeredCount { get; set; }
		public HashSet<string> TriggeredThreatIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
		public HashSet<int> ThreatRoundsTriggered { get; set; } = new();
		public bool IsPaused { get; set; }
		public string? PauseReason { get; set; }
		public DateTimeOffset? PausedAtUtc { get; set; }
		public string? PausedByPlayerId { get; set; }
		public GameTimerState GameTimer { get; set; } = new();

		public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8].ToUpper();

		/// <summary>
		/// ID відповідного запису в таблиці GameSessions.
		/// Null, доки ігрова сесія не була записана в базу.
		/// </summary>
		[System.Text.Json.Serialization.JsonIgnore]
		public Guid? GameSessionId { get; set; }
		public GameCompletionState? Completion { get; set; }
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
		/// Стабільний ID хоста. Не змінюється після refresh/reconnect.
		/// </summary>
		public string HostPlayerId { get; set; } = "";

		/// <summary>
		/// Секрет для HTTP-дій хоста (наприклад, завантаження зображень).
		/// </summary>
		public string HostToken { get; set; } = Guid.NewGuid().ToString("N");

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
		/// Поточна фаза гри всередині загального стану кімнати.
		/// </summary>
		public GamePhase CurrentPhase { get; set; } = GamePhase.Lobby;

		/// <summary>
		/// Яку характеристику кожен гравець уже відкрив у поточному раунді.
		/// Ключем є стабільний PlayerId, якщо він доступний.
		/// </summary>
		public Dictionary<string, string> CurrentRoundReveals { get; set; } = new();

		/// <summary>
		/// Результати кидка кубика по раундах.
		/// </summary>
		public Dictionary<int, RoundDiceRoll> RoundDiceRolls { get; set; } = new();

		/// <summary>
		/// Чи вже видано додатковий інвентар після завершення третього раунду.
		/// </summary>
		public bool AdditionalInventoryGrantedAfterRound3 { get; set; } = false;

		/// <summary>
		/// Загроза, відкрита після завершення третього раунду.
		/// </summary>
		public ThreatData? CurrentThreat { get; set; }

		/// <summary>
		/// Чи доступні гравцям реальні дані поточної загрози.
		/// </summary>
		public bool IsThreatRevealed { get; set; }

		public int? ThreatRevealedAtRound { get; set; }

		public ThreatInteractionState? ThreatState { get; set; }

		public HashSet<string> ProcessedGmThreatCommandIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
		public List<ThreatAuditEntry> ThreatAuditLog { get; set; } = new();
		public long NextThreatAuditSequenceId { get; set; }
		[System.Text.Json.Serialization.JsonIgnore]
		public object ThreatSyncRoot { get; } = new();
		public HashSet<string> ProcessedGmPlayerCommandIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
		public HashSet<string> ProcessedRoomIntegrityCommandIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
		public List<GmAuditEntry> GmAuditLog { get; set; } = new();
		public long NextGmAuditSequenceId { get; set; }
		[System.Text.Json.Serialization.JsonIgnore]
		public object GmAuditSyncRoot { get; } = new();
		[System.Text.Json.Serialization.JsonIgnore]
		public List<RoomSnapshot> SnapshotHistory { get; set; } = new();
		public HashSet<string> ProcessedSnapshotCommandIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
		[System.Text.Json.Serialization.JsonIgnore]
		public Dictionary<string, RoomSnapshotRestoreResult> SnapshotCommandResults { get; set; } = new(StringComparer.OrdinalIgnoreCase);
		[System.Text.Json.Serialization.JsonIgnore]
		public object SnapshotSyncRoot { get; } = new();
		public HashSet<string> ProcessedRoomEditorCommandIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);

		/// <summary>
		/// Відповіді гравців на перевірку готовності до голосування.
		/// Ключем є stable player id, якщо він доступний.
		/// </summary>
		public Dictionary<string, string> VotingReadyResponses { get; set; } = new();

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
		public int PlayerCount => Players?.Count ?? 0;
		public int GameplayPlayerCount => Players?.Values.Count(player => player != null && !player.IsEliminated && !player.IsSpectatorGm && !player.IsLobbySpectator && player.GmRole != GmMode.TechnicalGm) ?? 0;

		/// <summary>
		/// Чи можна приєднатися
		/// </summary>
		public bool CanJoin => State == RoomState.Lobby && GameSettings?.JoinsLocked != true && GameplayPlayerCount < MaxPlayers;

		/// <summary>
		/// Чи можна почати гру
		/// </summary>
		public bool CanStart => State == RoomState.Lobby && GameplayPlayerCount >= MinPlayers;

		/// <summary>
		/// Перевірити чи є гравець хостом
		/// </summary>
		public bool IsHost(string connectionId) =>
			!string.IsNullOrWhiteSpace(connectionId) && HostConnectionId == connectionId;

		public bool IsHost(Player player)
		{
			if (player == null) return false;
			if (player.ConnectionId == HostConnectionId) return true;
			return !string.IsNullOrWhiteSpace(HostPlayerId) && player.StablePlayerId == HostPlayerId;
		}

		/// <summary>
		/// Отримати публічну інформацію про кімнату (для списку)
		/// </summary>

		public object ToPublicInfo()
		{
			return new
			{
				id = Id ?? "",
				name = string.IsNullOrWhiteSpace(Name) ? "Кімната" : Name,
				hasPassword = HasPassword,
				playerCount = GameplayPlayerCount,
				spectatorGmCount = Players?.Values.Count(player => player?.IsSpectatorGm == true) ?? 0,
				maxPlayers = MaxPlayers,
				hostName = HostName ?? "",
				state = State.ToString(),
				canJoin = CanJoin
			};
		}
	}
}
