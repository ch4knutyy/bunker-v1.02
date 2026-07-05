namespace Bunker.Models
{
    /// <summary>
    /// Стан голосування
    /// </summary>
    public enum VotingState
    {
        Active,     // Голосування триває
        Completed,  // Голосування завершено, очікує рішення хоста
        Resolved    // Хост прийняв рішення
    }

    /// <summary>
    /// Сесія голосування
    /// </summary>
    public class VotingSession
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
        public int Round { get; set; } = 1;
        public VotingState State { get; set; } = VotingState.Active;
        public DateTime StartedAt { get; set; } = DateTime.UtcNow;
        public DateTime? EndedAt { get; set; }
        
        /// <summary>
        /// Голоси (VoterPlayerId -> TargetPlayerId). PlayerId є stablePlayerId, якщо він доступний.
        /// </summary>
        public Dictionary<string, string> Votes { get; set; } = new();
        
        /// <summary>
        /// Хто може голосувати (не елімінований)
        /// </summary>
        public HashSet<string> EligibleVoters { get; set; } = new();
        
        /// <summary>
        /// Кількість голосів за кожного кандидата
        /// </summary>
        public Dictionary<string, int> VoteCounts => Votes
            .GroupBy(v => v.Value)
            .ToDictionary(g => g.Key, g => g.Count());
        
        /// <summary>
        /// Чи всі проголосували
        /// </summary>
        public bool AllVoted => Votes.Count >= EligibleVoters.Count;
        
        /// <summary>
        /// Гравець з найбільшою кількістю голосів
        /// </summary>
        public string? TopVotedPlayerId
        {
            get
            {
                if (Votes.Count == 0) return null;
                var counts = VoteCounts;
                var maxVotes = counts.Values.Max();
                var topPlayers = counts.Where(kv => kv.Value == maxVotes).Select(kv => kv.Key).ToList();
                // Якщо нічия - повертаємо першого (хост вирішить)
                return topPlayers.FirstOrDefault();
            }
        }
        
        /// <summary>
        /// Перевірити чи є нічия
        /// </summary>
        public bool IsTie
        {
            get
            {
                if (Votes.Count == 0) return false;
                var counts = VoteCounts;
                var maxVotes = counts.Values.Max();
                return counts.Count(kv => kv.Value == maxVotes) > 1;
            }
        }
        
        /// <summary>
        /// Перевірити чи гравець вже голосував
        /// </summary>
        public bool HasVoted(string connectionId) => Votes.ContainsKey(connectionId);
        
        /// <summary>
        /// Додати голос
        /// </summary>
        public bool AddVote(string voterConnectionId, string targetConnectionId)
        {
            if (!EligibleVoters.Contains(voterConnectionId)) return false;
            if (State != VotingState.Active) return false;
            
            Votes[voterConnectionId] = targetConnectionId;
            return true;
        }
        
        /// <summary>
        /// Отримати результати для клієнта
        /// </summary>
        public object ToClientInfo(Dictionary<string, Player> players, bool showVotes = false)
        {
            var results = VoteCounts.Select(kv => new
            {
                connectionId = ResolveConnectionId(players, kv.Key) ?? kv.Key,
                playerName = ResolvePlayer(players, kv.Key)?.Name ?? "Unknown",
                voteCount = kv.Value
            }).OrderByDescending(r => r.voteCount).ToList();

            var topPlayer = TopVotedPlayerId != null ? ResolvePlayer(players, TopVotedPlayerId) : null;
            
            return new
            {
                id = Id,
                round = Round,
                state = State.ToString(),
                startedAt = StartedAt,
                totalVoters = EligibleVoters.Count,
                votedCount = Votes.Count,
                allVoted = AllVoted,
                results = results,
                topVotedPlayerId = TopVotedPlayerId != null ? ResolveConnectionId(players, TopVotedPlayerId) ?? TopVotedPlayerId : null,
                topVotedPlayerName = topPlayer?.Name,
                isTie = IsTie,
                votes = showVotes ? Votes.Select(v => new 
                {
                    voterId = ResolveConnectionId(players, v.Key) ?? v.Key,
                    voterName = ResolvePlayer(players, v.Key)?.Name ?? "Unknown",
                    targetId = ResolveConnectionId(players, v.Value) ?? v.Value,
                    targetName = ResolvePlayer(players, v.Value)?.Name ?? "Unknown"
                }) : null
            };
        }

        private static Player? ResolvePlayer(Dictionary<string, Player> players, string playerIdOrConnectionId)
        {
            if (players.TryGetValue(playerIdOrConnectionId, out var byConnectionId))
            {
                return byConnectionId;
            }

            return players.Values.FirstOrDefault(p =>
                p.StablePlayerId == playerIdOrConnectionId ||
                p.Id.ToString() == playerIdOrConnectionId);
        }

        private static string? ResolveConnectionId(Dictionary<string, Player> players, string playerIdOrConnectionId)
        {
            var player = ResolvePlayer(players, playerIdOrConnectionId);
            return player?.ConnectionId;
        }
    }
}
