using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;
using System.Numerics;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace Bunker.Hubs
{
    public partial class GameHub
    {
        #region Voting System

        /// <summary>
        /// Почати голосування (тільки хост)
        /// </summary>
        public async Task StartVoting()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може почати голосування");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;

            if (room == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            if (room.State != RoomState.Playing)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гра не почалась");
                return;
            }

            if (room.CurrentVoting != null && room.CurrentVoting.State == VotingState.Active)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Голосування вже триває");
                return;
            }

            // Створюємо нову сесію голосування
            var voting = new VotingSession
            {
                Round = room.CurrentRound
            };

            // Додаємо всіх не елімінованих гравців як eligible voters
            foreach (var player in room.Players.Values.Where(p => !p.IsEliminated))
            {
                voting.EligibleVoters.Add(RoomService.GetPlayerKey(player));
            }

            room.CurrentVoting = voting;
            room.State = RoomState.Voting;

            // Повідомляємо всіх про початок голосування
            await Clients.Group(roomId).SendAsync("VotingStarted", new
            {
                votingId = voting.Id,
                round = voting.Round,
                eligibleVoters = voting.EligibleVoters.Count,
                candidates = room.Players.Values
                    .Where(p => !p.IsEliminated)
                    .Select(p => new { 
                        connectionId = p.ConnectionId, 
                        name = p.Name,
                        isProtected = p.IsProtectedFromVote,
                        extraVotes = p.ExtraVotes
                    })
            });

            _logger.LogInformation($"Голосування почалось в кімнаті {room.Name}, раунд {voting.Round}");
        }

        /// <summary>
        /// Проголосувати за гравця
        /// </summary>
        public async Task Vote(string targetConnectionId)
        {
            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;

            if (room == null || room.CurrentVoting == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Голосування не активне");
                return;
            }

            var voting = room.CurrentVoting;
            if (!_roomService.TryResolvePlayer(room, Context.ConnectionId, out var voterConnectionId, out var voterPlayer))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var voterId = RoomService.GetPlayerKey(voterPlayer);

            if (voting.State != VotingState.Active)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Голосування вже завершено");
                return;
            }

            if (!voting.EligibleVoters.Contains(voterId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не можете голосувати");
                return;
            }

            if (!_roomService.TryResolvePlayer(room, targetConnectionId, out var targetCurrentConnectionId, out var targetPlayer) ||
                targetPlayer.IsEliminated)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недійсний кандидат");
                return;
            }

            var targetPlayerId = RoomService.GetPlayerKey(targetPlayer);

            // Перевірка захисту від голосування
            if (targetPlayer.IsProtectedFromVote)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Цей гравець захищений від голосування");
                return;
            }

            // Додаємо голос
            var alreadyVoted = voting.HasVoted(voterId);
            voting.AddVote(voterId, targetPlayerId);

            var voterName = voterPlayer.Name;

            // Повідомляємо гравця
            await Clients.Caller.SendAsync("VoteCast", new
            {
                targetConnectionId = targetCurrentConnectionId,
                targetName = targetPlayer.Name,
                changed = alreadyVoted
            });

            // Повідомляємо всіх про прогрес (без деталей хто за кого)
            await Clients.Group(roomId).SendAsync("VotingProgress", new
            {
                votedCount = voting.Votes.Count,
                totalVoters = voting.EligibleVoters.Count,
                allVoted = voting.AllVoted
            });

            // Якщо всі проголосували - автоматично завершуємо
            if (voting.AllVoted)
            {
                await EndVotingInternal(room, roomId);
            }

            _logger.LogInformation($"Гравець {voterName} проголосував у кімнаті {room.Name}");
        }

        /// <summary>
        /// Завершити голосування достроково (тільки хост)
        /// </summary>
        public async Task EndVoting()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може завершити голосування");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;

            if (room == null || room.CurrentVoting == null || room.CurrentVoting.State != VotingState.Active)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Немає активного голосування");
                return;
            }

            await EndVotingInternal(room, roomId);
        }

        /// <summary>
        /// Внутрішній метод завершення голосування
        /// </summary>
        private async Task EndVotingInternal(Room room, string roomId)
        {
            var voting = room.CurrentVoting!;
            voting.State = VotingState.Completed;
            voting.EndedAt = DateTime.UtcNow;

            // Застосовуємо додаткові голоси від спеціальних карт
            // ExtraVotes додає "фантомні" голоси за того ж кандидата
            foreach (var voter in voting.Votes.ToList())
            {
                var voterPlayer = _roomService.GetPlayerByAnyId(room, voter.Key);
                if (voterPlayer != null && voterPlayer.ExtraVotes > 0)
                {
                    // Додаємо фантомні голоси (через окремий лічильник)
                    for (int i = 0; i < voterPlayer.ExtraVotes; i++)
                    {
                        var phantomVoterId = $"_extra_{voter.Key}_{i}";
                        voting.Votes[phantomVoterId] = voter.Value;
                    }
                }
            }

            // Повідомляємо всіх про результати
            await Clients.Group(roomId).SendAsync("VotingEnded", voting.ToClientInfo(room.Players, showVotes: true));

            _logger.LogInformation($"Голосування завершено в кімнаті {room.Name}");
        }

        /// <summary>
        /// Хост приймає рішення після голосування
        /// </summary>
        public async Task ResolveVoting(string? eliminateConnectionId)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може прийняти рішення");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;

            if (room == null || room.CurrentVoting == null || room.CurrentVoting.State != VotingState.Completed)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Немає завершеного голосування для рішення");
                return;
            }

            var voting = room.CurrentVoting;
            voting.State = VotingState.Resolved;

            string resultMessage;
            string? eliminatedName = null;

            if (!string.IsNullOrEmpty(eliminateConnectionId) &&
                _roomService.TryResolvePlayer(room, eliminateConnectionId, out var eliminatedConnectionId, out var player))
            {
                // Елімінуємо гравця
                player.IsEliminated = true;
                eliminatedName = player.Name;
                _roomService.UpdatePlayer(eliminatedConnectionId, player);
                resultMessage = $"Гравець {eliminatedName} елімінований за рішенням ведучого";
                eliminateConnectionId = eliminatedConnectionId;
            }
            else
            {
                resultMessage = "Ведучий вирішив нікого не елімінувати";
            }

            // Повертаємо стан гри
            room.State = RoomState.Playing;
            room.CurrentRound++;
            room.CurrentVoting = null;

            // Скидаємо одноразові ефекти карт (захист, додаткові голоси)
            foreach (var p in room.Players.Values)
            {
                p.IsProtectedFromVote = false;
                p.ExtraVotes = 0;
            }

            // Повідомляємо всіх
            await Clients.Group(roomId).SendAsync("VotingResolved", new
            {
                eliminatedConnectionId = eliminateConnectionId,
                eliminatedName = eliminatedName,
                message = resultMessage,
                nextRound = room.CurrentRound
            });

            if (!string.IsNullOrEmpty(eliminateConnectionId))
            {
                await Clients.Group(roomId).SendAsync("PlayerEliminated", new
                {
                    connectionId = eliminateConnectionId,
                    playerName = eliminatedName
                });
            }

            _logger.LogInformation($"Голосування вирішено в кімнаті {room.Name}: {resultMessage}");
        }

        /// <summary>
        /// Скасувати голосування (тільки хост)
        /// </summary>
        public async Task CancelVoting()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може скасувати голосування");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;

            if (room == null || room.CurrentVoting == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Немає голосування для скасування");
                return;
            }

            room.CurrentVoting = null;
            room.State = RoomState.Playing;

            await Clients.Group(roomId).SendAsync("VotingCancelled", new
            {
                message = "Голосування скасовано ведучим"
            });

            _logger.LogInformation($"Голосування скасовано в кімнаті {room.Name}");
        }

        #endregion
    }
}


