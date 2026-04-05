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
        /// Голоси (VoterConnectionId -> TargetConnectionId)
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
                connectionId = kv.Key,
                playerName = players.ContainsKey(kv.Key) ? players[kv.Key].Name : "Unknown",
                voteCount = kv.Value
            }).OrderByDescending(r => r.voteCount).ToList();
            
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
                topVotedPlayerId = TopVotedPlayerId,
                topVotedPlayerName = TopVotedPlayerId != null && players.ContainsKey(TopVotedPlayerId) 
                    ? players[TopVotedPlayerId].Name 
                    : null,
                isTie = IsTie,
                votes = showVotes ? Votes.Select(v => new 
                {
                    voterId = v.Key,
                    voterName = players.ContainsKey(v.Key) ? players[v.Key].Name : "Unknown",
                    targetId = v.Value,
                    targetName = players.ContainsKey(v.Value) ? players[v.Value].Name : "Unknown"
                }) : null
            };
        }
    }
}
