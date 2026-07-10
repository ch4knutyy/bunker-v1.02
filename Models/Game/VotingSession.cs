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
        /// Гравці, яким активний ефект карти забороняє голосувати.
        /// </summary>
        public HashSet<string> BlockedVoterIds { get; set; } = new();

        /// <summary>
        /// Множник голосів проти конкретної цілі.
        /// </summary>
        public Dictionary<string, int> VoteMultipliers { get; set; } = new();

        public List<AppliedSpecialCardEffect> AppliedSpecialCardEffects { get; set; } = new();
        
        /// <summary>
        /// Кількість голосів за кожного кандидата
        /// </summary>
        public Dictionary<string, int> VoteCounts => Votes
            .GroupBy(v => v.Value)
            .ToDictionary(
                group => group.Key,
                group => group.Count() * GetVoteMultiplier(group.Key));
        
        /// <summary>
        /// Чи всі проголосували
        /// </summary>
        public int RequiredVoterCount => EligibleVoters.Count(voterId => !BlockedVoterIds.Contains(voterId));

        public bool AllVoted => Votes.Keys.Count(voterId => !IsExtraVoteId(voterId)) >= RequiredVoterCount;

        public int RealVoteCount => Votes.Keys.Count(voterId => !IsExtraVoteId(voterId));
        
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
            if (BlockedVoterIds.Contains(voterConnectionId)) return false;
            if (State != VotingState.Active) return false;
            
            Votes[voterConnectionId] = targetConnectionId;
            return true;
        }
        
        /// <summary>
        /// Отримати результати для клієнта
        /// </summary>
        public object ToClientInfo(Dictionary<string, Player> players, bool showVotes = false)
        {
            players ??= new();
            var totalVotes = VoteCounts.Values.Sum();
            var realVotes = Votes
                .Where(v => !IsExtraVoteId(v.Key))
                .ToDictionary(v => v.Key, v => v.Value);

            var results = VoteCounts.Select(kv => new
            {
                connectionId = ResolveConnectionId(players, kv.Key) ?? kv.Key,
                stablePlayerId = ResolveStablePlayerId(players, kv.Key) ?? kv.Key,
                playerName = ResolvePlayer(players, kv.Key)?.Name ?? "Unknown",
                seatNumber = ResolvePlayer(players, kv.Key)?.SeatNumber ?? 0,
                voteCount = kv.Value,
                percentage = totalVotes > 0 ? Math.Round(kv.Value * 100.0 / totalVotes, 1) : 0,
                voters = Votes
                    .Where(v => v.Value == kv.Key)
                    .Select(v => BuildVoterInfo(players, v.Key, v.Value))
                    .ToList()
            }).OrderByDescending(r => r.voteCount).ToList();

            var topPlayer = TopVotedPlayerId != null ? ResolvePlayer(players, TopVotedPlayerId) : null;
            var nonVoters = EligibleVoters
                .Where(voterId => !realVotes.ContainsKey(voterId))
                .Select(voterId =>
                {
                    var voter = ResolvePlayer(players, voterId);
                    return new
                    {
                        voterId = ResolveConnectionId(players, voterId) ?? voterId,
                        stablePlayerId = ResolveStablePlayerId(players, voterId) ?? voterId,
                        voterName = voter?.Name ?? "Unknown",
                        seatNumber = voter?.SeatNumber ?? 0,
                        isBlocked = BlockedVoterIds.Contains(voterId),
                        reason = BlockedVoterIds.Contains(voterId)
                            ? "Заблоковано спеціальною картою"
                            : "Не проголосував"
                    };
                })
                .OrderBy(v => v.seatNumber == 0 ? int.MaxValue : v.seatNumber)
                .ThenBy(v => v.voterName)
                .ToList();

            var specialCardEffects = AppliedSpecialCardEffects
                .Select(effect => effect.WasUsedSilently
                    ? $"{effect.CardName}: деталі приховані."
                    : effect.EffectType switch
                    {
                        "doubleVotesAgainstTargetAndBlockCasterVote" =>
                            $"{effect.CardName}: голоси проти {effect.TargetPlayerName ?? "цілі"} множаться на {effect.VoteMultiplier}; {effect.OwnerPlayerName} не голосує.",
                        _ => $"{effect.CardName}: ефект активовано."
                    })
                .ToList();
            
            return new
            {
                id = Id,
                round = Round,
                roundNumber = Round,
                state = State.ToString(),
                phase = State.ToString(),
                startedAt = StartedAt,
                endedAt = EndedAt,
                totalVoters = RequiredVoterCount,
                eligiblePlayerCount = EligibleVoters.Count,
                votedCount = realVotes.Count,
                totalVotes,
                allVoted = realVotes.Count >= RequiredVoterCount,
                results = results,
                topVotedPlayerId = TopVotedPlayerId != null ? ResolveConnectionId(players, TopVotedPlayerId) ?? TopVotedPlayerId : null,
                topVotedStablePlayerId = TopVotedPlayerId != null ? ResolveStablePlayerId(players, TopVotedPlayerId) ?? TopVotedPlayerId : null,
                topVotedPlayerName = topPlayer?.Name,
                topVotedSeatNumber = topPlayer?.SeatNumber ?? 0,
                isTie = IsTie,
                nonVoters,
                specialCardEffects,
                blockedVoterIds = BlockedVoterIds.ToList(),
                voteMultipliers = VoteMultipliers,
                appliedSpecialCardEffects = AppliedSpecialCardEffects,
                votes = showVotes ? Votes.Select(v => new 
                {
                    voterId = ResolveConnectionId(players, v.Key) ?? v.Key,
                    voterStablePlayerId = ResolveStablePlayerId(players, v.Key) ?? v.Key,
                    voterName = ResolvePlayer(players, v.Key)?.Name ?? "Unknown",
                    voterSeatNumber = ResolvePlayer(players, v.Key)?.SeatNumber ?? 0,
                    targetId = ResolveConnectionId(players, v.Value) ?? v.Value,
                    targetStablePlayerId = ResolveStablePlayerId(players, v.Value) ?? v.Value,
                    targetName = ResolvePlayer(players, v.Value)?.Name ?? "Unknown",
                    targetSeatNumber = ResolvePlayer(players, v.Value)?.SeatNumber ?? 0,
                    isExtraVote = IsExtraVoteId(v.Key)
                }) : null
            };
        }

        private object BuildVoterInfo(Dictionary<string, Player> players, string voterId, string targetId)
        {
            var isExtraVote = IsExtraVoteId(voterId);
            var resolvedVoterId = isExtraVote ? ExtractExtraVoteOwnerId(voterId) ?? voterId : voterId;
            var voter = ResolvePlayer(players, resolvedVoterId);

            return new
            {
                voterId = ResolveConnectionId(players, resolvedVoterId) ?? resolvedVoterId,
                voterStablePlayerId = ResolveStablePlayerId(players, resolvedVoterId) ?? resolvedVoterId,
                voterName = voter == null
                    ? "Unknown"
                    : isExtraVote
                        ? $"{voter.Name} (додатковий голос)"
                        : voter.Name,
                voterSeatNumber = voter?.SeatNumber ?? 0,
                targetId = ResolveConnectionId(players, targetId) ?? targetId,
                targetStablePlayerId = ResolveStablePlayerId(players, targetId) ?? targetId,
                targetName = ResolvePlayer(players, targetId)?.Name ?? "Unknown",
                isExtraVote,
                voteWeight = GetVoteMultiplier(targetId),
                modifiedBySpecialCard = GetVoteMultiplier(targetId) > 1
            };
        }

        private int GetVoteMultiplier(string targetPlayerId)
        {
            return VoteMultipliers.TryGetValue(targetPlayerId, out var multiplier)
                ? Math.Max(1, multiplier)
                : 1;
        }

        private static Player? ResolvePlayer(Dictionary<string, Player> players, string playerIdOrConnectionId)
        {
            if (string.IsNullOrWhiteSpace(playerIdOrConnectionId))
            {
                return null;
            }

            if (players.TryGetValue(playerIdOrConnectionId, out var byConnectionId) && byConnectionId != null)
            {
                return byConnectionId;
            }

            return players.Values.Where(p => p != null).FirstOrDefault(p =>
                p.StablePlayerId == playerIdOrConnectionId ||
                p.Id.ToString() == playerIdOrConnectionId);
        }

        private static string? ResolveConnectionId(Dictionary<string, Player> players, string playerIdOrConnectionId)
        {
            var player = ResolvePlayer(players, playerIdOrConnectionId);
            return player?.ConnectionId;
        }

        private static string? ResolveStablePlayerId(Dictionary<string, Player> players, string playerIdOrConnectionId)
        {
            var player = ResolvePlayer(players, playerIdOrConnectionId);
            return string.IsNullOrWhiteSpace(player?.StablePlayerId) ? null : player.StablePlayerId;
        }

        private static bool IsExtraVoteId(string voterId)
        {
            return voterId.StartsWith("_extra_", StringComparison.Ordinal);
        }

        private static string? ExtractExtraVoteOwnerId(string voterId)
        {
            const string prefix = "_extra_";
            if (!voterId.StartsWith(prefix, StringComparison.Ordinal))
            {
                return null;
            }

            var withoutPrefix = voterId[prefix.Length..];
            var lastSeparator = withoutPrefix.LastIndexOf('_');
            return lastSeparator <= 0 ? null : withoutPrefix[..lastSeparator];
        }
    }
}
