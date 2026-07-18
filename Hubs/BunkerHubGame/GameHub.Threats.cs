using Bunker.Models;
using Bunker.Services;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;

namespace Bunker.Hubs
{
    public partial class GameHub
    {
        private const string RadiationLeakThreatId = "radiation_leak";
        private const string AirFilterFailureThreatId = "air_filter_failure";

        public async Task RollThreatSupportDice()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може кинути секретний кубик");
                return;
            }

            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            var room = context.Room;
            var threatState = EnsureRadiationThreatState(room);
            if (!IsRadiationThreatActive(room, threatState))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Секретний кубик доступний тільки для radiation_leak");
                return;
            }

            if (threatState.SecretSupportDrop.IsCompleted)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Секретний кубик уже кинуто");
                return;
            }

            var activePlayers = GetActiveThreatPlayers(room).ToList();
            if (activePlayers.Count == 0)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Немає активних гравців");
                return;
            }

            var roll = _random.Next(1, activePlayers.Count + 1);
            var recipientEntry = activePlayers[roll - 1];
            var recipient = recipientEntry.Value;
            var item = CreateThreatSupportItem(room);
            if (item == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Не вдалося підібрати предмет підтримки");
                return;
            }

            item.InstanceId = Guid.NewGuid().ToString("N");
            item.IsHidden = true;
            item.Source = "threatDice";
            item.SourceThreatId = RadiationLeakThreatId;
            item.AcquiredRound = room.CurrentRound;
            recipient.Inventory.Items.Add(item);

            threatState.SecretSupportDrop.IsCompleted = true;
            threatState.SecretSupportDrop.RecipientPlayerId = RoomService.GetPlayerKey(recipient);
            threatState.SecretSupportDrop.AwardedItemInstanceId = item.InstanceId;
            threatState.SecretSupportDrop.RollValue = roll;

            await Clients.Caller.SendAsync("ThreatSupportDiceRolled", new
            {
                message = "Кубик кинуто. Предмет підтримки видано."
            });
            await Clients.OthersInGroup(context.RoomId).SendAsync("ThreatSupportDropAnnounced", new
            {
                message = "Один із гравців отримав предмет підтримки."
            });
            await Clients.Client(recipientEntry.Key).SendAsync("ThreatSupportItemReceived", new
            {
                message = $"Ви отримали: {item.Name}",
                item,
                inventory = recipient.Inventory
            });

            await BroadcastThreatState(room, context.RoomId);
        }

        public async Task SubmitThreatVolunteer()
        {
            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId) ||
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var player) ||
                !RoomService.IsGameplayParticipant(player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var threatState = EnsureRadiationThreatState(context.Room);
            if (!CanCollectThreatContributions(context.Room, threatState))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Зараз не можна запропонувати себе");
                return;
            }

            var playerId = RoomService.GetPlayerKey(player);
            AddThreatParticipant(threatState, playerId);
            if (string.IsNullOrWhiteSpace(threatState.VolunteerSelection.SelectedPlayerId))
            {
                threatState.VolunteerSelection.SelectedPlayerId = playerId;
                threatState.VolunteerSelection.SelectionReason = "voluntary";
                threatState.VolunteerSelection.SelectedAtRound = context.Room.CurrentRound;
            }
            threatState.ThreatStatus = "collecting_contributions";

            await Clients.Group(context.RoomId).SendAsync("ThreatVolunteerSelected", new
            {
                playerName = player.Name,
                reason = "voluntary",
                message = $"{player.Name} добровільно зголосився усувати загрозу."
            });
            await BroadcastThreatState(context.Room, context.RoomId);
        }

        public async Task WithdrawThreatContribution(string? contributionId = null)
        {
            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId) ||
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var player) ||
                !RoomService.IsGameplayParticipant(player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var threatState = EnsureRadiationThreatState(context.Room);
            if (!CanCollectThreatContributions(context.Room, threatState))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Відкликати внесок уже не можна");
                return;
            }

            var ownerId = RoomService.GetPlayerKey(player);
            if (string.IsNullOrWhiteSpace(contributionId))
            {
                threatState.ParticipantPlayerIds.RemoveAll(id => string.Equals(id, ownerId, StringComparison.OrdinalIgnoreCase));
            }
            if (string.IsNullOrWhiteSpace(contributionId) &&
                threatState.VolunteerSelection.SelectedPlayerId == ownerId &&
                threatState.VolunteerSelection.SelectionReason == "voluntary")
            {
                threatState.VolunteerSelection = new ThreatVolunteerSelectionState();
            }

            var removed = threatState.Contributions.RemoveAll(c =>
                c.OwnerPlayerId == ownerId &&
                (string.IsNullOrWhiteSpace(contributionId) || c.ContributionId == contributionId));

            await Clients.Caller.SendAsync("ThreatContributionWithdrawn", new
            {
                removed,
                message = removed > 0 ? "Внесок відкликано." : "Немає внеску для відкликання."
            });
            await BroadcastThreatState(context.Room, context.RoomId);
        }

        public Task UseProfessionForThreat() =>
            SubmitThreatCapability("profession");

        public Task UseHobbyForThreat() =>
            SubmitThreatCapability("hobby");

        public async Task ContributeThreatItem(string itemInstanceIdOrName)
        {
            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId) ||
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var player) ||
                !RoomService.IsGameplayParticipant(player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var threatState = EnsureRadiationThreatState(context.Room);
            if (!CanCollectThreatContributions(context.Room, threatState))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Зараз не можна додати предмет");
                return;
            }

            var (itemSource, itemToken) = ParseThreatItemToken(itemInstanceIdOrName);
            var item = ResolvePlayerThreatItem(player, itemSource, itemToken);
            if (item == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Предмет не знайдено");
                return;
            }

            var itemSourceId = GetItemSourceId(item);
            var contributionSourceType = itemSource == "profession" ? "profession_item" : "personal_inventory";
            if (FindActiveThreatContributionBySource(threatState, contributionSourceType, itemSourceId) != null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Цей предмет уже зарезервований для загрози");
                return;
            }

            var tags = item.ResourceTags.Concat(item.ProtectionTags).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            AddThreatContribution(context.Room, threatState, contributionSourceType, itemSourceId, RoomService.GetPlayerKey(player), true, true, tags, item.Name);
            await Clients.Caller.SendAsync("ThreatPrivateMessage", new { message = "Внесок додано до операції" });
            await BroadcastThreatState(context.Room, context.RoomId);
        }

        public async Task ContributeBunkerThreatAsset(string sourceType, string assetId)
        {
            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            if (!IsCallerHost() && !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out _))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var threatState = EnsureRadiationThreatState(context.Room);
            if (!CanCollectThreatContributions(context.Room, threatState))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Зараз не можна додати ресурс бункера");
                return;
            }

            var normalizedType = string.Equals(sourceType, "bunker_facility", StringComparison.OrdinalIgnoreCase)
                ? "bunker_facility"
                : "bunker_resource";
            var assets = normalizedType == "bunker_facility"
                ? context.Room.Bunker?.ThreatAssets.Facilities
                : context.Room.Bunker?.ThreatAssets.Resources;
            var asset = assets?.FirstOrDefault(a => string.Equals(a.Id, assetId, StringComparison.OrdinalIgnoreCase) ||
                                                    string.Equals(a.GetName(), assetId, StringComparison.OrdinalIgnoreCase));
            if (asset == null || !string.Equals(asset.Status, "available", StringComparison.OrdinalIgnoreCase))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ресурс або система недоступні");
                return;
            }

            var tags = asset.ResourceTags.Concat(asset.FacilityTags).Concat(asset.ProtectionTags).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            asset.Status = "reserved";
            AddThreatContribution(context.Room, threatState, normalizedType, asset.Id, "", false, true, tags, asset.GetName());
            await Clients.Caller.SendAsync("ThreatPrivateMessage", new { message = "Внесок додано до операції" });
            await BroadcastThreatState(context.Room, context.RoomId);
        }

        public async Task StartThreatVolunteerVote()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може запустити голосування загрози");
                return;
            }

            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            var threatState = EnsureRadiationThreatState(context.Room);
            if (!CanCollectThreatContributions(context.Room, threatState) ||
                !string.IsNullOrWhiteSpace(threatState.VolunteerSelection.SelectedPlayerId) ||
                threatState.ThreatVolunteerVote.Status == "open")
            {
                await Clients.Caller.SendAsync("ReceiveError", "Голосування загрози зараз недоступне");
                return;
            }

            threatState.ThreatStatus = "volunteer_vote_open";
            threatState.ThreatVolunteerVote = new ThreatVolunteerVoteState
            {
                Status = "open",
                StartedAtRound = context.Room.CurrentRound
            };

            await Clients.Group(context.RoomId).SendAsync("ThreatVolunteerVoteStarted", new
            {
                voteType = "threat_volunteer_vote",
                message = "Оберіть гравця, якого група вважає найменш корисним і готова відправити усувати загрозу."
            });
            await BroadcastThreatState(context.Room, context.RoomId);
        }

        public async Task VoteThreatVolunteer(string targetPlayerId)
        {
            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId) ||
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var voter) ||
                !RoomService.IsGameplayParticipant(voter))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var threatState = EnsureRadiationThreatState(context.Room);
            if (threatState.ThreatVolunteerVote.Status != "open")
            {
                await Clients.Caller.SendAsync("ReceiveError", "Голосування загрози не активне");
                return;
            }

            var voterId = RoomService.GetPlayerKey(voter);
            if (!_roomService.TryResolvePlayer(context.Room, targetPlayerId, out _, out var target) || !RoomService.IsGameplayParticipant(target))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недійсний кандидат");
                return;
            }

            var targetId = RoomService.GetPlayerKey(target);
            if (targetId == voterId)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Не можна голосувати за себе");
                return;
            }

            threatState.ThreatVolunteerVote.Votes[voterId] = targetId;
            var unanimousTargetId = GetUnanimousThreatVolunteer(context.Room, threatState);
            if (!string.IsNullOrWhiteSpace(unanimousTargetId))
            {
                var selected = _roomService.GetPlayerByAnyId(context.Room, unanimousTargetId);
                threatState.ThreatVolunteerVote.Status = "completed";
                threatState.ThreatVolunteerVote.SelectedPlayerId = unanimousTargetId;
                threatState.ThreatVolunteerVote.CompletedAtRound = context.Room.CurrentRound;
                threatState.VolunteerSelection.SelectedPlayerId = unanimousTargetId;
                threatState.VolunteerSelection.SelectionReason = "group_vote";
                threatState.VolunteerSelection.SelectedAtRound = context.Room.CurrentRound;
                threatState.ForcedParticipantPlayerId = unanimousTargetId;
                AddThreatParticipant(threatState, unanimousTargetId);
                threatState.ThreatStatus = "collecting_contributions";

                await Clients.Group(context.RoomId).SendAsync("ThreatVolunteerVoteCompleted", new
                {
                    selectedPlayerName = selected?.Name ?? "Гравець",
                    message = $"Група відправила {selected?.Name ?? "гравця"} усувати загрозу."
                });
            }
            else
            {
                await Clients.Group(context.RoomId).SendAsync("ThreatVolunteerVoteProgress", BuildThreatVotePublicInfo(context.Room, threatState));
            }

            await BroadcastThreatState(context.Room, context.RoomId);
        }

        public async Task CloseThreatVolunteerVote()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може закрити голосування загрози");
                return;
            }

            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            var threatState = EnsureRadiationThreatState(context.Room);
            if (threatState.ThreatVolunteerVote.Status != "open")
            {
                await Clients.Caller.SendAsync("ReceiveError", "Голосування загрози не активне");
                return;
            }

            var selectedId = GetUnanimousThreatVolunteer(context.Room, threatState);
            threatState.ThreatVolunteerVote.Status = "closed";
            threatState.ThreatVolunteerVote.CompletedAtRound = context.Room.CurrentRound;
            threatState.ThreatStatus = "collecting_contributions";
            var message = "Одностайного рішення немає";

            if (!string.IsNullOrWhiteSpace(selectedId))
            {
                var selected = _roomService.GetPlayerByAnyId(context.Room, selectedId);
                threatState.ThreatVolunteerVote.Status = "completed";
                threatState.ThreatVolunteerVote.SelectedPlayerId = selectedId;
                threatState.VolunteerSelection.SelectedPlayerId = selectedId;
                threatState.VolunteerSelection.SelectionReason = "group_vote";
                threatState.VolunteerSelection.SelectedAtRound = context.Room.CurrentRound;
                threatState.ForcedParticipantPlayerId = selectedId;
                AddThreatParticipant(threatState, selectedId);
                message = $"Група відправила {selected?.Name ?? "гравця"} усувати загрозу.";
            }

            await Clients.Group(context.RoomId).SendAsync("ThreatVolunteerVoteClosed", new { message });
            await BroadcastThreatState(context.Room, context.RoomId);
        }

        public async Task SetThreatOperationLeader(string playerId)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може змінити керівника операції");
                return;
            }

            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            var threatState = EnsureRadiationThreatState(context.Room);
            if (!CanCollectThreatContributions(context.Room, threatState) ||
                string.Equals(threatState.MiniGame.Status, "active", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(threatState.MiniGame.Status, "completed", StringComparison.OrdinalIgnoreCase))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Керівника зараз не можна змінити");
                return;
            }

            if (!_roomService.TryResolvePlayer(context.Room, playerId, out _, out var player) || !RoomService.IsGameplayParticipant(player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }

            var selectedPlayerId = RoomService.GetPlayerKey(player);
            threatState.VolunteerSelection.SelectedPlayerId = selectedPlayerId;
            threatState.VolunteerSelection.SelectionReason = "host_assigned";
            threatState.VolunteerSelection.SelectedAtRound = context.Room.CurrentRound;
            AddThreatParticipant(threatState, selectedPlayerId);
            threatState.ThreatStatus = "collecting_contributions";

            await Clients.Group(context.RoomId).SendAsync("ThreatVolunteerSelected", new
            {
                playerName = player.Name,
                reason = "host_assigned",
                message = "Керівника операції оновлено."
            });
            await BroadcastThreatState(context.Room, context.RoomId);
        }

        public async Task SelectThreatPlan(string planId)
        {
            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId) ||
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var caller))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }
            var state = EnsureRadiationThreatState(context.Room);
            var callerId = RoomService.GetPlayerKey(caller);
            if (!IsAirFilterPlanChoiceActive(context.Room, state) ||
                (!IsCallerHost() && !string.Equals(callerId, state.VolunteerSelection.SelectedPlayerId, StringComparison.OrdinalIgnoreCase)))
            {
                await Clients.Caller.SendAsync("ReceiveError", "План зараз не можна змінити");
                return;
            }
            if (!TryGetPlanElement(context.Room.CurrentThreat?.Mechanics, planId, out _))
            {
                await Clients.Caller.SendAsync("ReceiveError", "План не знайдено");
                return;
            }
            state.PlanChoice.SelectedPlanId = planId;
            await BroadcastThreatState(context.Room, context.RoomId);
        }

        public async Task ResolveCurrentThreat()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може завершити збір внесків");
                return;
            }

            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            var room = context.Room;
            var threatState = EnsureRadiationThreatState(room);
            if (IsPlanChoiceMechanics(room.CurrentThreat?.Mechanics) &&
                string.Equals(room.CurrentThreat?.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase))
            {
                await ResolveAirFilterPlanChoice(room, context.RoomId, threatState);
                return;
            }
            if (threatState.Resolution.EffectsApplied && _threatMiniGames.TryGet(RadiationLeakThreatId, out var finalizedMiniGame))
            {
                await FinalizeRadiationOperationAsync(room, context.RoomId, threatState, finalizedMiniGame, "uk");
                return;
            }
            if (!IsRadiationThreatActive(room, threatState))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Загрозу вже завершено або вона недоступна");
                return;
            }

            var volunteerId = threatState.VolunteerSelection.SelectedPlayerId;
            var hasVolunteer = !string.IsNullOrWhiteSpace(volunteerId);
            if (!threatState.OperationScaling.IsCalculated)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Спочатку почніть операцію загрози");
                return;
            }

            var hasSolver = hasVolunteer && threatState.Contributions.Any(c =>
                c.IsAccepted &&
                c.OwnerPlayerId == volunteerId &&
                (c.SourceType == "profession" || c.SourceType == "hobby") &&
                HasAny(c.TagsSnapshot, GetRadiationSolverTags()));
            var hasControl = threatState.Contributions.Any(c =>
                c.IsAccepted &&
                (c.SourceType == "personal_inventory" || c.SourceType == "profession_item" || c.SourceType == "bunker_resource" || c.SourceType == "bunker_facility") &&
                (HasAny(c.TagsSnapshot, GetRadiationResourceTags()) || HasAny(c.TagsSnapshot, GetRadiationFacilityTags())));
            var protectedVolunteer = hasVolunteer && threatState.Contributions.Any(c =>
                c.IsAccepted &&
                (string.IsNullOrWhiteSpace(c.OwnerPlayerId) || c.OwnerPlayerId == volunteerId) &&
                (HasAny(c.TagsSnapshot, GetRadiationProtectionTags()) || HasAny(c.TagsSnapshot, new[] { "decontamination_area" })));

            var success = hasVolunteer && hasSolver && hasControl;
            if (!_threatMiniGames.TryGet(RadiationLeakThreatId, out var miniGame))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Для цієї загрози немає мінігри");
                return;
            }

            threatState.MiniGame.Status = "completed";
            threatState.MiniGame.CompletedAtUtc = DateTimeOffset.UtcNow;
            threatState.MiniGame.ResultStatus = success
                ? protectedVolunteer ? "perfect_success" : "success_with_consequences"
                : "failed";
            await FinalizeRadiationOperationAsync(room, context.RoomId, threatState, miniGame, "uk");
        }

        public async Task StartThreatMiniGame(string? language = null)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може почати операцію загрози");
                return;
            }

            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            var room = context.Room;
            var threatState = EnsureRadiationThreatState(room);
            if (!IsRadiationThreatActive(room, threatState) || threatState.Resolution.EffectsApplied || IsTerminalThreatStatus(threatState.ThreatStatus))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Операція загрози недоступна");
                return;
            }

            if (!_threatMiniGames.TryGet(room.CurrentThreat?.Id ?? threatState.CurrentThreatId, out var miniGame))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Для цієї загрози немає мінігри");
                return;
            }

            var leaderId = threatState.VolunteerSelection.SelectedPlayerId;
            if (string.IsNullOrWhiteSpace(leaderId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Спочатку потрібно обрати добровольця");
                return;
            }

            ThreatMiniGamePublicState publicState;
            lock (room.ThreatSyncRoot)
            {
                AddThreatParticipant(threatState, leaderId);
                EnsureThreatScalingSnapshot(room, threatState, leaderId);
                publicState = miniGame.Start(room, threatState, leaderId, NormalizeThreatLanguage(language));
                if (!IsRadiationMiniGameTerminalStatus(publicState.Status))
                {
                    threatState.ThreatStatus = "mini_game_active";
                    _threatAudit.Append(room, ThreatAuditEventType.AttemptStarted, GetThreatActorId(room), deduplicateTransition: true);
                }
            }
            if (IsRadiationMiniGameTerminalStatus(publicState.Status))
            {
                await FinalizeRadiationOperationAsync(room, context.RoomId, threatState, miniGame, NormalizeThreatLanguage(language));
                return;
            }

            await Clients.Group(context.RoomId).SendAsync("ThreatMiniGameStarted", publicState);
            await BroadcastThreatState(room, context.RoomId);
        }

        public async Task SubmitThreatMiniGameAnswer(string questionId, string optionId, string? language = null)
        {
            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId) ||
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var player) ||
                !RoomService.IsGameplayParticipant(player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var room = context.Room;
            var threatState = EnsureRadiationThreatState(room);
            if (IsTerminalThreatStatus(threatState.ThreatStatus))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Спробу загрози завершено");
                return;
            }
            if (!_threatMiniGames.TryGet(room.CurrentThreat?.Id ?? threatState.CurrentThreatId, out var miniGame))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Для цієї загрози немає мінігри");
                return;
            }

            if (threatState.Resolution.EffectsApplied || IsRadiationMiniGameTerminalStatus(threatState.MiniGame.Status))
            {
                await FinalizeRadiationOperationAsync(room, context.RoomId, threatState, miniGame, NormalizeThreatLanguage(language));
                return;
            }

            var result = miniGame.SubmitAnswer(
                room,
                threatState,
                RoomService.GetPlayerKey(player),
                questionId?.Trim() ?? "",
                optionId?.Trim() ?? "",
                NormalizeThreatLanguage(language));

            if (!result.Success)
            {
                await Clients.Caller.SendAsync("ReceiveError", result.Error);
                if (result.PublicState != null)
                {
                    if (IsRadiationMiniGameTerminalStatus(result.PublicState.Status))
                    {
                        await FinalizeRadiationOperationAsync(room, context.RoomId, threatState, miniGame, NormalizeThreatLanguage(language));
                        return;
                    }
                    await Clients.Group(context.RoomId).SendAsync("ThreatMiniGameUpdated", result.PublicState);
                    await BroadcastThreatState(room, context.RoomId);
                }
                return;
            }

            var publicState = result.PublicState ?? miniGame.GetPublicState(threatState, NormalizeThreatLanguage(language));
            if (IsRadiationMiniGameTerminalStatus(publicState.Status))
            {
                await FinalizeRadiationOperationAsync(room, context.RoomId, threatState, miniGame, NormalizeThreatLanguage(language));
                await NotifyReturnedThreatItems(room, context.RoomId, threatState);
                return;
            }

            await Clients.Group(context.RoomId).SendAsync("ThreatMiniGameUpdated", publicState);
            await BroadcastThreatState(room, context.RoomId);
        }

        public async Task UseThreatMiniGameHint(string? language = null)
        {
            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId) ||
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var player) ||
                !RoomService.IsGameplayParticipant(player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var room = context.Room;
            var threatState = EnsureRadiationThreatState(room);
            if (IsTerminalThreatStatus(threatState.ThreatStatus))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Спробу загрози завершено");
                return;
            }
            if (!_threatMiniGames.TryGet(room.CurrentThreat?.Id ?? threatState.CurrentThreatId, out var miniGame))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Для цієї загрози немає мінігри");
                return;
            }

            var result = miniGame.ApplyHint(threatState, NormalizeThreatLanguage(language));
            if (!result.Success)
            {
                await Clients.Caller.SendAsync("ReceiveError", result.Error);
            }

            if (result.PublicState != null)
            {
                if (IsRadiationMiniGameTerminalStatus(result.PublicState.Status))
                {
                    await FinalizeRadiationOperationAsync(room, context.RoomId, threatState, miniGame, NormalizeThreatLanguage(language));
                    return;
                }
                await Clients.Group(context.RoomId).SendAsync("ThreatMiniGameUpdated", result.PublicState);
                await BroadcastThreatState(room, context.RoomId);
            }
        }

        public async Task CheckThreatMiniGameTimeout(string? language = null)
        {
            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId))
            {
                return;
            }

            var threatState = EnsureRadiationThreatState(context.Room);
            if (IsTerminalThreatStatus(threatState.ThreatStatus)) return;
            if (!_threatMiniGames.TryGet(RadiationLeakThreatId, out var miniGame))
            {
                return;
            }

            var publicState = miniGame.GetPublicState(threatState, NormalizeThreatLanguage(language));
            if (IsRadiationMiniGameTerminalStatus(publicState.Status) ||
                threatState.Resolution.EffectsApplied)
            {
                await FinalizeRadiationOperationAsync(
                    context.Room,
                    context.RoomId,
                    threatState,
                    miniGame,
                    NormalizeThreatLanguage(language));
                return;
            }

            await Clients.Group(context.RoomId).SendAsync("ThreatMiniGameUpdated", publicState);
            await BroadcastThreatState(context.Room, context.RoomId);
        }

        private async Task FinalizeRadiationOperationAsync(
            Room room,
            string roomId,
            ThreatInteractionState threatState,
            IThreatMiniGameService miniGame,
            string language)
        {
            bool finalized;
            lock (room.ThreatSyncRoot)
            {
                finalized = FinalizeRadiationOperationLocked(room, threatState);
            }
            if (!finalized) return;

            var finalState = miniGame.GetPublicState(threatState, language);
            await Clients.Group(roomId).SendAsync("ThreatMiniGameUpdated", finalState);
            await BroadcastThreatState(room, roomId);
        }

        private bool FinalizeRadiationOperationLocked(Room room, ThreatInteractionState threatState)
        {
            var isFinalStatus = threatState.MiniGame.Status is "resolved_safely" or "resolved_with_casualty" or "failed";
            if (!isFinalStatus && !string.Equals(threatState.MiniGame.Status, "completed", StringComparison.OrdinalIgnoreCase))
                return false;

            if (!threatState.Resolution.EffectsApplied)
            {
                var materialEffectsApplied = false;
                var resultStatus = threatState.MiniGame.ResultStatus;
                var volunteerId = threatState.VolunteerSelection.SelectedPlayerId;
                var volunteerProtected = !string.IsNullOrWhiteSpace(volunteerId) &&
                    threatState.OperationBonuses.ProtectedPlayerIds.Contains(volunteerId, StringComparer.OrdinalIgnoreCase);
                var outcome = string.Equals(resultStatus, "perfect_success", StringComparison.OrdinalIgnoreCase) ||
                    (string.Equals(resultStatus, "success_with_consequences", StringComparison.OrdinalIgnoreCase) && volunteerProtected)
                        ? "resolved_safely"
                        : string.Equals(resultStatus, "success_with_consequences", StringComparison.OrdinalIgnoreCase)
                            ? "resolved_with_casualty"
                            : "failed";

                threatState.Resolution.SelectedApproachId = "contain_radiation";
                threatState.Resolution.CompletedAtRound = room.CurrentRound;
                threatState.Resolution.WasSuccessful = outcome != "failed";
                threatState.Resolution.WasVolunteerProtected = volunteerProtected;
                threatState.Resolution.PublicResults.AddRange(threatState.OperationBonuses.PublicExplanations);

                if (outcome == "resolved_with_casualty")
                {
                    materialEffectsApplied = ApplyRadiationConditionToParticipants(room, threatState, "medium");
                    threatState.Resolution.PublicResults.Add("Операцію завершено, але учасник отримав радіаційний наслідок.");
                }
                else if (outcome == "failed")
                {
                    ApplyRadiationFailure(room, threatState);
                    materialEffectsApplied = true;
                    threatState.Resolution.PublicResults.Add("Операцію провалено. Радіаційний наслідок застосовано.");
                }
                else
                {
                    threatState.Resolution.PublicResults.Add("Операцію завершено без помітних втрат.");
                }

                materialEffectsApplied |= ConsumeAcceptedThreatItems(room, threatState, threatState.Resolution.WasSuccessful);
                materialEffectsApplied |= GrantThreatVoteImmunityIfNeeded(room, threatState);
                threatState.Resolution.EffectsApplied = true;
                threatState.MiniGame.Outcome = outcome;
                threatState.MiniGame.Status = outcome;
                threatState.MiniGame.CompletedAtUtc ??= DateTimeOffset.UtcNow;
                threatState.ThreatStatus = outcome;
                _threatAudit.Append(
                    room,
                    outcome == "failed" ? ThreatAuditEventType.CompletedFailure : ThreatAuditEventType.CompletedSuccess,
                    deduplicateTransition: true);
                if (materialEffectsApplied)
                    _threatAudit.Append(room, ThreatAuditEventType.EffectsApplied, deduplicateTransition: true);
            }

            if (threatState.Resolution.EffectsApplied &&
                threatState.ThreatStatus is "resolved_safely" or "resolved_with_casualty" or "failed")
            {
                threatState.MiniGame.Outcome = threatState.ThreatStatus;
                threatState.MiniGame.Status = threatState.ThreatStatus;
                threatState.MiniGame.CompletedAtUtc ??= DateTimeOffset.UtcNow;
            }
            return true;
        }

        private bool ForceFinalizeThreatLocked(
            Room room,
            string requestedOutcome,
            string? actorPlayerId,
            string commandId,
            out ThreatMiniGamePublicState? miniGamePublicState)
        {
            miniGamePublicState = null;
            if (!GMThreatStateMutator.CanForceOutcome(room) || room.ThreatState == null || room.CurrentThreat == null)
                return false;

            var state = room.ThreatState;
            var success = string.Equals(requestedOutcome, "success", StringComparison.OrdinalIgnoreCase);
            _threatAudit.Append(
                room,
                success ? ThreatAuditEventType.ForcedSuccess : ThreatAuditEventType.ForcedFailure,
                actorPlayerId,
                commandId,
                new Dictionary<string, string> { ["outcome"] = success ? "resolved_safely" : "failed" });

            if (string.Equals(room.CurrentThreat.Id, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase) &&
                _threatMiniGames.TryGet(RadiationLeakThreatId, out var miniGame))
            {
                foreach (var question in state.MiniGame.Questions.Where(question => question.AnsweredAtUtc == null))
                {
                    question.QuestionStartedAtUtc = null;
                    question.QuestionDeadlineUtc = null;
                }
                state.MiniGame.Status = "completed";
                state.MiniGame.ResultStatus = success ? "perfect_success" : "failed";
                state.MiniGame.CompletedAtUtc ??= DateTimeOffset.UtcNow;
                if (!FinalizeRadiationOperationLocked(room, state)) return false;
                miniGamePublicState = miniGame.GetPublicState(state, "uk");
                return true;
            }

            if (string.Equals(room.CurrentThreat.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase) &&
                TryGetForcedPlanElement(room.CurrentThreat.Mechanics, state.PlanChoice.SelectedPlanId, out var plan))
            {
                state.PlanChoice.SelectedPlanId = GetJsonString(plan, "", "id");
                return FinalizeAirFilterOutcomeLocked(room, state, plan, success ? "safe_success" : "failure", actorPlayerId);
            }

            state.ThreatStatus = success ? "resolved_safely" : "failed";
            state.MiniGame.Status = state.ThreatStatus;
            state.MiniGame.Outcome = state.ThreatStatus;
            state.MiniGame.ResultStatus = success ? "success" : "failed";
            state.MiniGame.CompletedAtUtc ??= DateTimeOffset.UtcNow;
            state.Resolution.WasSuccessful = success;
            state.Resolution.CompletedAtRound = room.CurrentRound;
            state.Resolution.EffectsApplied = true;
            if (!state.Resolution.PublicResults.Contains(success ? "Загрозу примусово завершено успіхом." : "Загрозу примусово завершено провалом."))
                state.Resolution.PublicResults.Add(success ? "Загрозу примусово завершено успіхом." : "Загрозу примусово завершено провалом.");
            _threatAudit.Append(room, success ? ThreatAuditEventType.CompletedSuccess : ThreatAuditEventType.CompletedFailure, actorPlayerId, deduplicateTransition: true);
            if (!success)
                _threatAudit.Append(room, ThreatAuditEventType.EffectsApplied, actorPlayerId, deduplicateTransition: true);
            return true;
        }

        private async Task NotifyReturnedThreatItems(Room room, string roomId, ThreatInteractionState threatState)
        {
            foreach (var contribution in threatState.Contributions.Where(c =>
                         c.SourceType == "personal_inventory" &&
                         threatState.OperationBonuses.IneffectiveItemContributionIds.Contains(c.ContributionId, StringComparer.OrdinalIgnoreCase) &&
                         !string.Equals(c.Status, "returned_no_effect", StringComparison.OrdinalIgnoreCase)))
            {
                var ownerEntry = RoomService.GetPlayersSnapshot(room).FirstOrDefault(entry =>
                    RoomService.GetPlayerKey(entry.Value) == contribution.OwnerPlayerId);
                if (string.IsNullOrWhiteSpace(ownerEntry.Key))
                {
                    continue;
                }

                contribution.Status = "returned_no_effect";
                await Clients.Client(ownerEntry.Key).SendAsync("ThreatPrivateMessage", new
                {
                    message = "Ваш предмет не дав помітного ефекту та був повернений."
                });
            }
        }

        private async Task SubmitThreatCapability(string sourceType)
        {
            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId) ||
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var player) ||
                !RoomService.IsGameplayParticipant(player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var threatState = EnsureRadiationThreatState(context.Room);
            if (!CanCollectThreatContributions(context.Room, threatState))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Зараз не можна використати характеристику для загрози");
                return;
            }

            var tags = sourceType == "hobby"
                ? player.Hobby.CapabilityTags
                : player.Profession.CapabilityTags;

            AddThreatContribution(
                context.Room,
                threatState,
                sourceType,
                sourceType,
                RoomService.GetPlayerKey(player),
                true,
                true,
                tags,
                sourceType == "hobby" ? player.Hobby.Name : player.Profession.Name);

            await Clients.Caller.SendAsync("ThreatPrivateMessage", new { message = "Внесок додано до операції" });
            await BroadcastThreatState(context.Room, context.RoomId);
        }

        private (string? RoomId, Room? Room) GetCurrentThreatContext()
        {
            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = string.IsNullOrWhiteSpace(roomId) ? null : _roomService.GetRoom(roomId);
            return (roomId, room);
        }

        private ThreatInteractionState EnsureRadiationThreatState(Room room)
        {
            var threatId = room.CurrentThreat?.Id ?? room.ThreatState?.CurrentThreatId ?? "";
            if (!string.Equals(threatId, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase))
            {
                room.ThreatState ??= new ThreatInteractionState();
                if (string.Equals(threatId, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase))
                {
                    room.ThreatState.CurrentThreatId = AirFilterFailureThreatId;
                    if (room.IsThreatRevealed && room.ThreatState.ThreatStatus == "hidden")
                    {
                        room.ThreatState.ThreatStatus = "collecting_contributions";
                        room.ThreatState.ThreatRevealedRound = room.ThreatRevealedAtRound ?? room.CurrentRound;
                    }
                }
                return room.ThreatState;
            }

            room.ThreatState ??= new ThreatInteractionState();
            room.ThreatState.CurrentThreatId = RadiationLeakThreatId;
            if (room.IsThreatRevealed && room.ThreatState.ThreatStatus == "hidden")
            {
                room.ThreatState.ThreatStatus = "collecting_contributions";
                room.ThreatState.ThreatRevealedRound = room.ThreatRevealedAtRound ?? room.CurrentRound;
            }

            return room.ThreatState;
        }

        private void EnsureThreatScalingSnapshot(Room room, ThreatInteractionState threatState, string? volunteerId)
        {
            if (threatState.OperationScaling.IsCalculated)
            {
                return;
            }

            threatState.OperationBonuses = BuildRadiationOperationBonuses(threatState);
            var activePlayerCount = Math.Max(1, GetThreatScalingPlayers(room).Count);
            var participantIds = new HashSet<string>(GetThreatParticipantIds(threatState), StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(volunteerId))
            {
                participantIds.Add(volunteerId);
            }

            var additionalAllowedErrors = threatState.OperationBonuses.AdditionalAllowedErrors;
            var timeBonusSeconds = threatState.OperationBonuses.TimeBonusSeconds;
            var autoCompletedTaskCount = threatState.OperationBonuses.AutoCompletedTaskCount;
            var limitResult = _threatScaling.Calculate(
                activePlayerCount,
                1,
                additionalAllowedErrors,
                timeBonusSeconds,
                autoCompletedTaskCount);
            var participantCount = Math.Clamp(Math.Max(1, participantIds.Count), 1, limitResult.MaxParticipants);

            var result = _threatScaling.Calculate(
                activePlayerCount,
                participantCount,
                additionalAllowedErrors,
                timeBonusSeconds,
                autoCompletedTaskCount);

            threatState.OperationScaling = new ThreatOperationScalingState
            {
                IsCalculated = true,
                CalculatedAtRound = room.CurrentRound,
                ScalingPlayerCount = result.ScalingPlayerCount,
                MinParticipants = result.MinParticipants,
                MaxParticipants = result.MaxParticipants,
                BaseTaskCount = result.BaseTaskCount,
                PlayableTaskCount = result.PlayableTaskCount,
                BaseTimeSeconds = result.BaseTimeSeconds,
                TimeBonusSeconds = result.TimeBonusSeconds,
                TaskTimeSeconds = result.TaskTimeSeconds,
                HintTokens = result.HintTokens,
                AllowedErrors = result.AllowedErrors,
                RequiredTasksForSuccess = result.RequiredTasksForSuccess
            };

            if (threatState.OperationBonuses.StrongAutoResolve)
            {
                threatState.OperationBonuses.AutoCompletedTaskCount = threatState.OperationScaling.BaseTaskCount;
            }
        }

        private ThreatScalingResult BuildThreatScalingPreview(Room room, ThreatInteractionState threatState)
        {
            var bonuses = BuildRadiationOperationBonuses(threatState);
            var activePlayerCount = Math.Max(1, GetThreatScalingPlayers(room).Count);
            var limitResult = _threatScaling.Calculate(
                activePlayerCount,
                1,
                bonuses.AdditionalAllowedErrors,
                bonuses.TimeBonusSeconds,
                bonuses.AutoCompletedTaskCount);
            var participantCount = Math.Clamp(Math.Max(1, GetThreatParticipantIds(threatState).Count), 1, limitResult.MaxParticipants);

            return _threatScaling.Calculate(
                activePlayerCount,
                participantCount,
                bonuses.AdditionalAllowedErrors,
                bonuses.TimeBonusSeconds,
                bonuses.AutoCompletedTaskCount);
        }

        private static void AddThreatParticipant(ThreatInteractionState threatState, string? playerId)
        {
            if (string.IsNullOrWhiteSpace(playerId) ||
                threatState.ParticipantPlayerIds.Contains(playerId, StringComparer.OrdinalIgnoreCase))
            {
                return;
            }

            threatState.ParticipantPlayerIds.Add(playerId);
        }

        private static List<string> GetThreatParticipantIds(ThreatInteractionState threatState)
        {
            var participantIds = new HashSet<string>(threatState.ParticipantPlayerIds, StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(threatState.VolunteerSelection.SelectedPlayerId))
            {
                participantIds.Add(threatState.VolunteerSelection.SelectedPlayerId);
            }

            return participantIds.ToList();
        }

        private ThreatOperationBonusState BuildRadiationOperationBonuses(ThreatInteractionState threatState)
        {
            var bonuses = new ThreatOperationBonusState { IsCalculated = true };
            var autoCategories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var usefulContributionIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var hasEngineering = false;
            var hasRadiationDetection = false;
            var hasSealantOrRepairTools = false;

            foreach (var contribution in threatState.Contributions.Where(IsActiveThreatContribution))
            {
                var tags = contribution.TagsSnapshot;
                var contributionUseful = false;

                if (contribution.SourceType == "profession")
                {
                    if (HasAny(tags, new[] { "engineering_general", "electrical_repair", "mechanical_repair" }))
                    {
                        autoCategories.Add("repair");
                        hasEngineering = true;
                        contributionUseful = true;
                    }

                    if (HasAny(tags, new[] { "radiation_analysis" }))
                    {
                        autoCategories.Add("detection");
                        contributionUseful = true;
                    }

                    if (HasAny(tags, new[] { "chemistry" }))
                    {
                        bonuses.HintTokens++;
                        contributionUseful = true;
                    }

                    if (HasAny(tags, new[] { "medical_general" }))
                    {
                        bonuses.AdditionalAllowedErrors = Math.Max(bonuses.AdditionalAllowedErrors, 1);
                        bonuses.MedicalMitigationCount++;
                        contributionUseful = true;
                    }
                }

                if (contribution.SourceType == "personal_inventory" ||
                    contribution.SourceType == "profession_item" ||
                    contribution.SourceType == "bunker_resource" ||
                    contribution.SourceType == "bunker_facility")
                {
                    if (HasAny(tags, new[] { "radiation_detection" }))
                    {
                        if (!autoCategories.Add("detection"))
                        {
                            bonuses.HintTokens++;
                        }

                        hasRadiationDetection = true;
                        contributionUseful = true;
                    }

                    if (HasAny(tags, new[] { "radiation_protection" }))
                    {
                        bonuses.TimeBonusSeconds = Math.Min(20, bonuses.TimeBonusSeconds + 10);
                        if (!string.IsNullOrWhiteSpace(contribution.OwnerPlayerId) &&
                            !bonuses.ProtectedPlayerIds.Contains(contribution.OwnerPlayerId, StringComparer.OrdinalIgnoreCase))
                        {
                            bonuses.ProtectedPlayerIds.Add(contribution.OwnerPlayerId);
                        }

                        contributionUseful = true;
                    }

                    if (HasAny(tags, new[] { "sealant", "repair_tools" }))
                    {
                        bonuses.RepairRetryTokens++;
                        hasSealantOrRepairTools = true;
                        contributionUseful = true;
                    }

                    if (HasAny(tags, new[] { "medical_supplies" }))
                    {
                        bonuses.MedicalMitigationCount++;
                        contributionUseful = true;
                    }
                }

                if (contributionUseful)
                {
                    usefulContributionIds.Add(contribution.ContributionId);
                }
                else if (contribution.SourceType == "personal_inventory" || contribution.SourceType == "profession_item")
                {
                    bonuses.IneffectiveItemContributionIds.Add(contribution.ContributionId);
                }
            }

            bonuses.StrongAutoResolve = hasEngineering && hasRadiationDetection && hasSealantOrRepairTools;
            if (bonuses.StrongAutoResolve)
            {
                autoCategories.Add("detection");
                autoCategories.Add("isolation");
                autoCategories.Add("repair");
                bonuses.PublicExplanations.Add("Команда зібрала повний набір для автоматичного стримування витоку.");
            }
            else
            {
                if (autoCategories.Contains("detection"))
                {
                    bonuses.PublicExplanations.Add("Частину перевірки рівня радіації виконано автоматично.");
                }

                if (autoCategories.Contains("repair"))
                {
                    bonuses.PublicExplanations.Add("Частину ремонтних дій виконано автоматично.");
                }

                if (bonuses.ProtectedPlayerIds.Count > 0)
                {
                    bonuses.PublicExplanations.Add("Захисне спорядження зменшило ризик для учасників.");
                }
            }

            bonuses.AutoCompletedCategories = autoCategories.ToList();
            bonuses.AutoCompletedTaskCount = bonuses.StrongAutoResolve ? autoCategories.Count : autoCategories.Count;
            bonuses.UsefulContributionIds = usefulContributionIds.ToList();
            return bonuses;
        }

        private bool IsRadiationThreatActive(Room room, ThreatInteractionState threatState) =>
            room.IsThreatRevealed &&
            string.Equals(room.CurrentThreat?.Id ?? threatState.CurrentThreatId, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase);

        private bool CanCollectThreatContributions(Room room, ThreatInteractionState threatState) =>
            (IsRadiationThreatActive(room, threatState) || IsAirFilterPlanChoiceActive(room, threatState)) &&
            (threatState.ThreatStatus == "collecting_contributions" ||
             threatState.ThreatStatus == "revealed" ||
             threatState.ThreatStatus == "volunteer_vote_open") &&
            !threatState.Resolution.EffectsApplied;

        private static bool IsAirFilterPlanChoiceActive(Room room, ThreatInteractionState threatState) =>
            room.IsThreatRevealed &&
            string.Equals(room.CurrentThreat?.Id ?? threatState.CurrentThreatId, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase) &&
            IsPlanChoiceMechanics(room.CurrentThreat?.Mechanics) &&
            !IsTerminalThreatStatus(threatState.ThreatStatus) &&
            !threatState.PlanChoice.IsLocked;

        private static bool IsTerminalThreatStatus(string? status) => status is
            "aborted" or "resolved_safely" or "resolved_with_casualty" or "failed" or "completed" or "success" or "failure";

        private static bool IsRadiationMiniGameTerminalStatus(string? status) => status?.Trim().ToLowerInvariant() is
            "completed" or "resolved_safely" or "resolved_with_casualty" or "failed";

        private static bool IsPlanChoiceMechanics(JsonElement? mechanics) =>
            mechanics is { ValueKind: JsonValueKind.Object } value &&
            value.TryGetProperty("interactionType", out var interactionType) &&
            string.Equals(interactionType.GetString(), "plan_choice", StringComparison.OrdinalIgnoreCase) &&
            value.TryGetProperty("planChoice", out var planChoice) &&
            planChoice.ValueKind == JsonValueKind.Object &&
            planChoice.TryGetProperty("plans", out var plans) && plans.ValueKind == JsonValueKind.Array &&
            plans.GetArrayLength() > 0 && plans.EnumerateArray().All(plan =>
                plan.ValueKind == JsonValueKind.Object &&
                plan.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(id.GetString()));

        private static bool IsActiveThreatContribution(ThreatContributionState contribution) =>
            contribution.IsAccepted &&
            !contribution.IsConsumed &&
            !string.Equals(contribution.Status, "withdrawn", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(contribution.Status, "rejected", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(contribution.Status, "returned_no_effect", StringComparison.OrdinalIgnoreCase);

        private static ThreatContributionState? FindActiveThreatContributionBySource(
            ThreatInteractionState threatState,
            string sourceType,
            string sourceId) =>
            threatState.Contributions.FirstOrDefault(c =>
                IsActiveThreatContribution(c) &&
                string.Equals(c.SourceType, sourceType, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(c.SourceId, sourceId, StringComparison.OrdinalIgnoreCase));

        private IEnumerable<KeyValuePair<string, Player>> GetActiveThreatPlayers(Room room) =>
            RoomService.GetPlayersSnapshot(room)
                .Where(entry => RoomService.IsGameplayParticipant(entry.Value) && entry.Value.IsConnected)
                .OrderBy(entry => entry.Value.SeatNumber == 0 ? int.MaxValue : entry.Value.SeatNumber)
                .ThenBy(entry => RoomService.GetPlayerKey(entry.Value), StringComparer.OrdinalIgnoreCase);

        private static List<KeyValuePair<string, Player>> GetThreatScalingPlayers(Room room) =>
            RoomService.GetPlayersSnapshot(room)
                .Where(entry => RoomService.IsGameplayParticipant(entry.Value))
                .OrderBy(entry => entry.Value.SeatNumber == 0 ? int.MaxValue : entry.Value.SeatNumber)
                .ThenBy(entry => RoomService.GetPlayerKey(entry.Value), StringComparer.OrdinalIgnoreCase)
                .ToList();

        private Item? CreateThreatSupportItem(Room room)
        {
            var preferredIds = GetJsonStringArray(room.CurrentThreat?.Mechanics, "secretSupportDrop", "itemSelection", "preferredItemIds");
            var resourceTags = GetJsonStringArray(room.CurrentThreat?.Mechanics, "secretSupportDrop", "itemSelection", "resourceTagsAny");
            var protectionTags = GetJsonStringArray(room.CurrentThreat?.Mechanics, "secretSupportDrop", "itemSelection", "protectionTagsAny");

            var data = _gameData.Items.FirstOrDefault(item => preferredIds.Contains(item.Id, StringComparer.OrdinalIgnoreCase));
            data ??= _gameData.Items.FirstOrDefault(item =>
                HasAny(item.ResourceTags, resourceTags) || HasAny(item.ProtectionTags, protectionTags));
            if (data == null)
            {
                return null;
            }

            return new Item
            {
                Name = data.Item,
                Description = $"Категорія: {data.Category}",
                Quantity = 1,
                Unit = "шт",
                WeightKg = 1,
                IsUsefulInBunker = true,
                Rarity = "Підтримка загрози",
                ResourceTags = data.ResourceTags.ToList(),
                ProtectionTags = data.ProtectionTags.ToList(),
                ThreatUsage = data.ThreatUsage,
                I18n = data.I18n
            };
        }

        private static List<string> GetJsonStringArray(JsonElement? root, params string[] path)
        {
            if (root == null || root.Value.ValueKind != JsonValueKind.Object)
                return new();

            var current = root.Value;
            foreach (var segment in path)
            {
                if (current.ValueKind != JsonValueKind.Object || !current.TryGetProperty(segment, out current))
                    return new();
            }

            return current.ValueKind == JsonValueKind.Array
                ? current.EnumerateArray()
                    .Where(item => item.ValueKind == JsonValueKind.String)
                    .Select(item => item.GetString() ?? "")
                    .Where(value => !string.IsNullOrWhiteSpace(value))
                    .ToList()
                : new();
        }

        private async Task ResolveAirFilterPlanChoice(Room room, string roomId, ThreatInteractionState state)
        {
            if (state.Resolution.EffectsApplied)
            {
                await BroadcastThreatState(room, roomId);
                return;
            }
            if (string.IsNullOrWhiteSpace(state.PlanChoice.SelectedPlanId) ||
                !TryGetPlanElement(room.CurrentThreat?.Mechanics, state.PlanChoice.SelectedPlanId, out var plan))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Спочатку оберіть план");
                return;
            }

            lock (room.ThreatSyncRoot)
            {
              state.PlanChoice.IsLocked = true;
              state.ThreatStatus = "resolving";
              _threatAudit.Append(room, ThreatAuditEventType.AttemptStarted, GetThreatActorId(room), deduplicateTransition: true);
              state.PlanChoice.RandomModifier ??= _random.Next(
                GetJsonInt(room.CurrentThreat?.Mechanics, -8, "planChoice", "scoring", "randomModifier", "min"),
                GetJsonInt(room.CurrentThreat?.Mechanics, 8, "planChoice", "scoring", "randomModifier", "max") + 1);
            var request = BuildPlanChoiceScoreRequest(room, state, plan);
            var result = new PlanChoiceScoringService().Score(request, state.PlanChoice.RandomModifier.Value);
              FinalizeAirFilterOutcomeLocked(room, state, plan, result.Outcome, GetThreatActorId(room));
            }
            await BroadcastThreatState(room, roomId);
        }

        private bool FinalizeAirFilterOutcomeLocked(
            Room room,
            ThreatInteractionState state,
            JsonElement plan,
            string outcome,
            string? actorPlayerId = null)
        {
            if (state.Resolution.EffectsApplied) return false;
            state.PlanChoice.IsLocked = true;
            state.PlanChoice.Outcome = outcome;
            state.PlanChoice.ResolvedAtRound = room.CurrentRound;
            state.ThreatStatus = outcome switch
            {
                "safe_success" => "resolved_safely",
                "success_with_consequence" => "resolved_with_casualty",
                _ => "failed"
            };
            state.Resolution.SelectedApproachId = state.PlanChoice.SelectedPlanId;
            state.Resolution.WasSuccessful = outcome != "failure";
            state.Resolution.CompletedAtRound = room.CurrentRound;
            var materialEffectsApplied = ApplyAirFilterPlanEffects(room, state, plan, outcome);
            state.Resolution.EffectsApplied = true;
            _threatAudit.Append(
                room,
                state.ThreatStatus == "failed" ? ThreatAuditEventType.CompletedFailure : ThreatAuditEventType.CompletedSuccess,
                actorPlayerId,
                deduplicateTransition: true);
            if (state.ThreatStatus == "failed" || materialEffectsApplied)
                _threatAudit.Append(room, ThreatAuditEventType.EffectsApplied, actorPlayerId, deduplicateTransition: true);
            return true;
        }

        private PlanChoiceScoreRequest BuildPlanChoiceScoreRequest(Room room, ThreatInteractionState state, JsonElement plan)
        {
            var mechanics = room.CurrentThreat!.Mechanics;
            var tierScores = new PlanChoiceTierScores(
                GetJsonDouble(mechanics, 25, "planChoice", "scoring", "tierScores", "strong"),
                GetJsonDouble(mechanics, 14, "planChoice", "scoring", "tierScores", "related"),
                GetJsonDouble(mechanics, 5, "planChoice", "scoring", "tierScores", "support"));
            var planModel = new PlanChoicePlan(
                plan.GetProperty("id").GetString() ?? "",
                GetJsonDouble(plan, 0, "baseScore"),
                GetJsonString(plan, "safe_success", "outcomeCeiling"),
                GetJsonStringArray(plan, "capabilityTiers", "strongAny"),
                GetJsonStringGroups(plan, "capabilityTiers", "relatedAllGroups"),
                GetJsonStringArray(plan, "capabilityTiers", "supportAny"),
                tierScores);
            var capabilities = state.Contributions
                .Where(c => IsActiveThreatContribution(c) && c.SourceType is "profession" or "hobby" && !string.IsNullOrWhiteSpace(c.OwnerPlayerId))
                .Select(c => new PlanChoiceCapability(c.OwnerPlayerId, c.SourceType, c.TagsSnapshot))
                .ToList();
            var limits = new PlanChoiceLimits(
                GetJsonInt(mechanics, 1, "planChoice", "scoring", "contributionLimits", "maxStrongContributors"),
                GetJsonInt(mechanics, 2, "planChoice", "scoring", "contributionLimits", "maxRelatedContributors"),
                GetJsonInt(mechanics, 2, "planChoice", "scoring", "contributionLimits", "maxSupportContributors"),
                GetJsonDouble(mechanics, 10, "planChoice", "scoring", "contributionLimits", "supportScoreCap"));
            var assetScores = new PlanChoiceAssetScores(
                GetJsonDouble(mechanics, 12, "planChoice", "scoring", "assetScores", "acceptedPersonalItem"),
                GetJsonDouble(mechanics, 10, "planChoice", "scoring", "assetScores", "acceptedBunkerResource"),
                GetJsonDouble(mechanics, 15, "planChoice", "scoring", "assetScores", "acceptedBunkerFacility"),
                GetJsonDouble(mechanics, 8, "planChoice", "scoring", "assetScores", "participantProtection"));
            var thresholds = new PlanChoiceThresholds(
                GetJsonDouble(mechanics, 80, "planChoice", "scoring", "thresholds", "safeSuccess"),
                GetJsonDouble(mechanics, 55, "planChoice", "scoring", "thresholds", "successWithConsequence"));
            var resourceTags = GetJsonStringArray(plan, "assets", "resourceTagsAny");
            var facilityTags = GetJsonStringArray(plan, "assets", "facilityTagsAny");
            var protectionTags = GetJsonStringArray(plan, "assets", "protectionTagsAny");
            int Count(string type, IEnumerable<string> tags) => state.Contributions.Count(c =>
                IsActiveThreatContribution(c) && c.SourceType == type && c.TagsSnapshot.Any(tag => tags.Contains(tag, StringComparer.OrdinalIgnoreCase)));
            var protectedPlayers = GetThreatParticipantIds(state).Count(id => state.Contributions.Any(c =>
                IsActiveThreatContribution(c) && c.OwnerPlayerId == id && c.TagsSnapshot.Any(tag => protectionTags.Contains(tag, StringComparer.OrdinalIgnoreCase))));
            return new PlanChoiceScoreRequest(planModel, capabilities, limits, assetScores, thresholds,
                Count("personal_inventory", resourceTags), Count("bunker_resource", resourceTags),
                Count("bunker_facility", facilityTags), protectedPlayers);
        }

        private bool ApplyAirFilterPlanEffects(Room room, ThreatInteractionState state, JsonElement plan, string outcome)
        {
            var effectsKey = outcome == "safe_success" ? "onSafeSuccess" : outcome == "success_with_consequence" ? "onSuccessWithConsequence" : "onFailure";
            if (!plan.TryGetProperty("effects", out var effects) || !effects.TryGetProperty(effectsKey, out var list) || list.ValueKind != JsonValueKind.Array) return false;
            var materialEffectsApplied = false;
            if (list.EnumerateArray().Any(effect => GetJsonString(effect, "", "type") == "consume_contributed_items"))
            {
                state.OperationBonuses.UsefulContributionIds = state.Contributions
                    .Where(item => IsActiveThreatContribution(item) && item.SourceType == "personal_inventory")
                    .Select(item => item.ContributionId).ToList();
                materialEffectsApplied |= ConsumeAcceptedThreatItems(room, state, success: true);
            }
            foreach (var effect in list.EnumerateArray().Where(effect => GetJsonString(effect, "", "type") == "add_physical_condition"))
            {
                var target = GetJsonString(effect, "", "target");
                var conditionId = GetJsonString(effect, "", "conditionId");
                var severity = GetJsonString(effect, "light", "severity");
                var mergeRule = GetJsonString(effect, "", "mergeRule");
                var targets = target == "all_active_players"
                    ? GetActiveThreatPlayers(room).Select(entry => RoomService.GetPlayerKey(entry.Value)).ToList()
                    : GetThreatParticipantIds(state).Where(id => !IsPlanChoiceParticipantProtected(state, plan, id)).Take(1).ToList();
                foreach (var playerId in targets)
                    materialEffectsApplied |= ApplyAirFilterPhysicalCondition(room, playerId, conditionId, severity, mergeRule);
            }
            return materialEffectsApplied;
        }

        private static bool IsPlanChoiceParticipantProtected(ThreatInteractionState state, JsonElement plan, string playerId)
        {
            var tags = GetJsonStringArray(plan, "assets", "protectionTagsAny");
            return state.Contributions.Any(c => IsActiveThreatContribution(c) && c.OwnerPlayerId == playerId && c.TagsSnapshot.Any(tag => tags.Contains(tag, StringComparer.OrdinalIgnoreCase)));
        }

        private bool ApplyAirFilterPhysicalCondition(Room room, string playerId, string effectConditionId, string severityCode, string mergeRule)
        {
            var player = _roomService.GetPlayerByAnyId(room, playerId);
            if (player == null) return false;
            var conditionId = effectConditionId is "toxic_air_exposure" or "respiratory_poisoning" ? "physical_301" : effectConditionId;
            var existing = player.AdditionalConditionEffects.FirstOrDefault(item => string.Equals(item.ConditionId, conditionId, StringComparison.OrdinalIgnoreCase));
            var condition = _gameData.PhysicalConditions.FirstOrDefault(item => string.Equals(item.Id, conditionId, StringComparison.OrdinalIgnoreCase));
            if (condition == null) return false;
            if (existing != null)
            {
                if (!string.Equals(mergeRule, "increaseExistingSeverityByOne", StringComparison.OrdinalIgnoreCase)) return false;
                var nextCode = existing.SeverityCode.ToLowerInvariant() switch
                {
                    "light" => "medium", "medium" => "hard", "hard" => "veryHard", "veryhard" => "critical", _ => existing.SeverityCode
                };
                if (string.Equals(nextCode, existing.SeverityCode, StringComparison.OrdinalIgnoreCase)) return false;
                var nextLevel = SeverityHelper.GetSeverityLevelFromCode(nextCode);
                existing.SeverityCode = nextCode;
                existing.SeverityLevel = SeverityHelper.GetSeverityName(nextLevel, "uk");
                existing.Name = SeverityHelper.FormatNameWithSeverity(existing.BaseName, nextLevel, "uk");
                return true;
            }
            var level = SeverityHelper.GetSeverityLevelFromCode(severityCode);
            player.AdditionalConditionEffects.Add(new PlayerConditionEffect
            {
                Id = Guid.NewGuid().ToString("N"), ConditionId = conditionId, BaseName = condition.Name,
                Name = SeverityHelper.FormatNameWithSeverity(condition.Name, level, "uk"), SeverityCode = severityCode,
                SeverityLevel = SeverityHelper.GetSeverityName(level, "uk"), SourceThreatId = AirFilterFailureThreatId,
                AppliedAtRound = room.CurrentRound, Description = condition.Description ?? "", Localization = condition.Localization
            });
            var entry = RoomService.GetPlayersSnapshot(room).FirstOrDefault(item => ReferenceEquals(item.Value, player));
            if (!string.IsNullOrWhiteSpace(entry.Key)) _roomService.UpdatePlayer(entry.Key, player);
            return true;
        }

        private static bool TryGetPlanElement(JsonElement? mechanics, string planId, out JsonElement plan)
        {
            plan = default;
            if (!IsPlanChoiceMechanics(mechanics) || !mechanics!.Value.GetProperty("planChoice").TryGetProperty("plans", out var plans)) return false;
            foreach (var candidate in plans.EnumerateArray())
                if (string.Equals(GetJsonString(candidate, "", "id"), planId, StringComparison.OrdinalIgnoreCase)) { plan = candidate; return true; }
            return false;
        }

        private static bool TryGetForcedPlanElement(JsonElement? mechanics, string? selectedPlanId, out JsonElement plan)
        {
            if (!string.IsNullOrWhiteSpace(selectedPlanId) && TryGetPlanElement(mechanics, selectedPlanId, out plan))
                return true;
            plan = default;
            if (!IsPlanChoiceMechanics(mechanics) ||
                !mechanics!.Value.GetProperty("planChoice").TryGetProperty("plans", out var plans) ||
                plans.ValueKind != JsonValueKind.Array)
                return false;
            foreach (var candidate in plans.EnumerateArray())
            {
                plan = candidate;
                return true;
            }
            return false;
        }

        private static JsonElement? GetJsonElement(JsonElement? root, params string[] path)
        {
            if (root == null) return null;
            var current = root.Value;
            foreach (var segment in path)
                if (current.ValueKind != JsonValueKind.Object || !current.TryGetProperty(segment, out current)) return null;
            return current;
        }
        private static string GetJsonString(JsonElement? root, string fallback, params string[] path) => GetJsonElement(root, path) is { ValueKind: JsonValueKind.String } value ? value.GetString() ?? fallback : fallback;
        private static int GetJsonInt(JsonElement? root, int fallback, params string[] path) => GetJsonElement(root, path) is { ValueKind: JsonValueKind.Number } value && value.TryGetInt32(out var result) ? result : fallback;
        private static double GetJsonDouble(JsonElement? root, double fallback, params string[] path) => GetJsonElement(root, path) is { ValueKind: JsonValueKind.Number } value && value.TryGetDouble(out var result) ? result : fallback;
        private static List<IReadOnlyList<string>> GetJsonStringGroups(JsonElement? root, params string[] path) =>
            GetJsonElement(root, path) is { ValueKind: JsonValueKind.Array } value
                ? value.EnumerateArray().Where(group => group.ValueKind == JsonValueKind.Array).Select(group => (IReadOnlyList<string>)group.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String).Select(item => item.GetString() ?? "").Where(item => item.Length > 0).ToList()).ToList()
                : new();

        private void AddThreatContribution(
            Room room,
            ThreatInteractionState threatState,
            string sourceType,
            string sourceId,
            string ownerPlayerId,
            bool isHidden,
            bool isAccepted,
            IEnumerable<string> tags,
            string displayName)
        {
            threatState.ThreatStatus = threatState.ThreatStatus == "volunteer_vote_open"
                ? threatState.ThreatStatus
                : "collecting_contributions";
            threatState.Contributions.RemoveAll(c =>
                c.SourceType == sourceType &&
                c.SourceId == sourceId &&
                c.OwnerPlayerId == ownerPlayerId &&
                !IsActiveThreatContribution(c));
            threatState.Contributions.Add(new ThreatContributionState
            {
                SourceType = sourceType,
                SourceId = sourceId,
                OwnerPlayerId = ownerPlayerId,
                PlayerId = ownerPlayerId,
                ItemInstanceId = sourceType is "personal_inventory" or "profession_item" ? sourceId : "",
                Status = isAccepted ? "accepted" : "rejected",
                IsHidden = isHidden,
                IsAccepted = isAccepted,
                SubmittedAt = room.CurrentRound,
                SubmittedRound = room.CurrentRound,
                ReservedForThreatId = isAccepted ? (room.CurrentThreat?.Id ?? threatState.CurrentThreatId) : "",
                TagsSnapshot = tags.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
                DisplayName = displayName
            });
        }

        private object BuildThreatPublicState(Room room, bool forHost = false, string? viewerPlayerId = null)
        {
            var threatState = EnsureRadiationThreatState(room);
            if (!IsRadiationThreatActive(room, threatState))
            {
                if (string.Equals(room.CurrentThreat?.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase) &&
                    IsPlanChoiceMechanics(room.CurrentThreat?.Mechanics))
                {
                    return BuildAirFilterPlanChoicePublicState(room, threatState);
                }
                return new { currentThreatId = room.CurrentThreat?.Id ?? "", threatStatus = threatState.ThreatStatus };
            }

            var volunteer = string.IsNullOrWhiteSpace(threatState.VolunteerSelection.SelectedPlayerId)
                ? null
                : _roomService.GetPlayerByAnyId(room, threatState.VolunteerSelection.SelectedPlayerId);
            var preview = threatState.OperationScaling.IsCalculated
                ? null
                : BuildThreatScalingPreview(room, threatState);
            var visibleBonuses = threatState.OperationScaling.IsCalculated
                ? threatState.OperationBonuses
                : BuildRadiationOperationBonuses(threatState);
            var participantIds = GetThreatParticipantIds(threatState);
            var protectedIds = new HashSet<string>(visibleBonuses.ProtectedPlayerIds, StringComparer.OrdinalIgnoreCase);
            var teamMax = threatState.OperationScaling.IsCalculated
                ? threatState.OperationScaling.MaxParticipants
                : preview?.MaxParticipants ?? 0;
            return new
            {
                currentThreatId = threatState.CurrentThreatId,
                threatStatus = threatState.ThreatStatus,
                threatRevealedRound = threatState.ThreatRevealedRound,
                secretSupportDrop = new { isCompleted = threatState.SecretSupportDrop.IsCompleted },
                volunteerSelection = new
                {
                    selectedPlayerId = threatState.VolunteerSelection.SelectedPlayerId,
                    selectedPlayerName = volunteer?.Name,
                    selectionReason = threatState.VolunteerSelection.SelectionReason,
                    selectedAtRound = threatState.VolunteerSelection.SelectedAtRound
                },
                contributions = new
                {
                    total = threatState.Contributions.Count(IsActiveThreatContribution),
                    byType = threatState.Contributions
                        .Where(IsActiveThreatContribution)
                        .GroupBy(c => c.SourceType)
                        .ToDictionary(g => g.Key, g => g.Count()),
                    mine = string.IsNullOrWhiteSpace(viewerPlayerId)
                        ? new List<object>()
                        : threatState.Contributions
                            .Where(c => c.OwnerPlayerId == viewerPlayerId && IsActiveThreatContribution(c))
                            .Select(c => new
                            {
                                c.ContributionId,
                                c.SourceType,
                                c.DisplayName,
                                c.IsAccepted,
                                c.Status,
                                c.SubmittedAt
                            })
                            .Cast<object>()
                            .ToList(),
                    revealedAfterResolution = threatState.Resolution.EffectsApplied
                        ? threatState.OperationBonuses.PublicExplanations
                        : null
                },
                participants = participantIds
                    .Select(id =>
                    {
                        var participant = _roomService.GetPlayerByAnyId(room, id);
                        return new
                        {
                            playerId = id,
                            name = participant?.Name ?? "Гравець",
                            isLeader = string.Equals(id, threatState.VolunteerSelection.SelectedPlayerId, StringComparison.OrdinalIgnoreCase),
                            isForced = string.Equals(id, threatState.ForcedParticipantPlayerId, StringComparison.OrdinalIgnoreCase),
                            isProtected = protectedIds.Contains(id)
                        };
                    })
                    .ToList(),
                operationAggregates = new
                {
                    team = $"{participantIds.Count}/{teamMax}",
                    professionContributions = threatState.Contributions.Count(c => IsActiveThreatContribution(c) && c.SourceType == "profession"),
                    equipmentContributions = threatState.Contributions.Count(c => IsActiveThreatContribution(c) && (c.SourceType == "personal_inventory" || c.SourceType == "profession_item" || c.SourceType == "bunker_resource" || c.SourceType == "bunker_facility")),
                    protectedParticipants = protectedIds.Count,
                    hints = threatState.OperationScaling.IsCalculated
                        ? threatState.OperationScaling.HintTokens + threatState.OperationBonuses.HintTokens
                        : preview?.HintTokens + visibleBonuses.HintTokens ?? 0,
                    status = threatState.ThreatStatus
                },
                preview = preview == null
                    ? null
                    : new
                    {
                        activePlayerCount = preview.ScalingPlayerCount,
                        participantCount = participantIds.Count,
                        preview.MinParticipants,
                        preview.MaxParticipants,
                        preview.BaseTaskCount,
                        preview.PlayableTaskCount,
                        preview.BaseTimeSeconds,
                        preview.TimeBonusSeconds,
                        preview.TaskTimeSeconds,
                        preview.HintTokens,
                        preview.AllowedErrors,
                        preview.RequiredTasksForSuccess
                    },
                scaling = threatState.OperationScaling.IsCalculated
                    ? new
                    {
                        threatState.OperationScaling.IsCalculated,
                        threatState.OperationScaling.ScalingPlayerCount,
                        threatState.OperationScaling.MinParticipants,
                        threatState.OperationScaling.MaxParticipants,
                        threatState.OperationScaling.BaseTaskCount,
                        threatState.OperationScaling.PlayableTaskCount,
                        threatState.OperationScaling.BaseTimeSeconds,
                        threatState.OperationScaling.TimeBonusSeconds,
                        threatState.OperationScaling.TaskTimeSeconds,
                        threatState.OperationScaling.HintTokens,
                        threatState.OperationScaling.AllowedErrors,
                        threatState.OperationScaling.RequiredTasksForSuccess
                    }
                    : null,
                miniGame = _threatMiniGames.TryGet(threatState.CurrentThreatId, out var miniGame)
                    ? miniGame.GetPublicState(threatState, "uk")
                    : null,
                threatVolunteerVote = BuildThreatVotePublicInfo(room, threatState),
                resolution = new
                {
                    threatState.Resolution.SelectedApproachId,
                    threatState.Resolution.WasSuccessful,
                    threatState.Resolution.WasVolunteerProtected,
                    threatState.Resolution.EffectsApplied,
                    threatState.Resolution.CompletedAtRound,
                    threatState.Resolution.PublicResults
                }
            };
        }

        private object BuildAirFilterPlanChoicePublicState(Room room, ThreatInteractionState state)
        {
            var mechanics = room.CurrentThreat!.Mechanics!.Value;
            var planChoice = mechanics.GetProperty("planChoice");
            var plans = planChoice.GetProperty("plans").EnumerateArray().Select(plan => new
            {
                id = GetJsonString(plan, "", "id"),
                title = GetJsonElement(plan, "title"),
                description = GetJsonElement(plan, "description"),
                tradeoff = GetJsonElement(plan, "tradeoff"),
                riskLevel = GetJsonString(plan, "", "riskLevel"),
                resourceCost = GetJsonString(plan, "", "resourceCost"),
                outcomePreview = GetJsonElement(plan, "outcomePreview"),
                requirementsPreview = GetJsonElement(plan, "requirementsPreview")
            }).ToList();
            var leader = string.IsNullOrWhiteSpace(state.VolunteerSelection.SelectedPlayerId)
                ? null : _roomService.GetPlayerByAnyId(room, state.VolunteerSelection.SelectedPlayerId);
            return new
            {
                currentThreatId = AirFilterFailureThreatId,
                threatStatus = state.ThreatStatus,
                volunteerSelection = new
                {
                    selectedPlayerId = state.VolunteerSelection.SelectedPlayerId,
                    selectedPlayerName = leader?.Name,
                    selectionReason = state.VolunteerSelection.SelectionReason,
                    selectedAtRound = state.VolunteerSelection.SelectedAtRound
                },
                participants = GetThreatParticipantIds(state).Select(id => new
                {
                    playerId = id,
                    name = _roomService.GetPlayerByAnyId(room, id)?.Name ?? "Гравець",
                    isLeader = string.Equals(id, state.VolunteerSelection.SelectedPlayerId, StringComparison.OrdinalIgnoreCase)
                }).ToList(),
                contributions = new
                {
                    total = state.Contributions.Count(IsActiveThreatContribution),
                    byType = state.Contributions.Where(IsActiveThreatContribution).GroupBy(item => item.SourceType).ToDictionary(group => group.Key, group => group.Count())
                },
                planChoice = new
                {
                    selectedPlanId = state.PlanChoice.SelectedPlanId,
                    isLocked = state.PlanChoice.IsLocked,
                    outcome = state.PlanChoice.Outcome,
                    resolvedAtRound = state.PlanChoice.ResolvedAtRound,
                    solutionGuide = GetJsonElement(planChoice, "solutionGuide"),
                    plans
                },
                resolution = new
                {
                    effectsApplied = state.Resolution.EffectsApplied,
                    completedAtRound = state.Resolution.CompletedAtRound
                }
            };
        }

        private object BuildThreatVotePublicInfo(Room room, ThreatInteractionState threatState)
        {
            var voters = GetActiveThreatPlayers(room).Select(entry => RoomService.GetPlayerKey(entry.Value)).ToList();
            return new
            {
                type = "threat_volunteer_vote",
                status = threatState.ThreatVolunteerVote.Status,
                votedCount = threatState.ThreatVolunteerVote.Votes.Keys.Count(voters.Contains),
                totalVoters = voters.Count,
                selectedPlayerId = threatState.ThreatVolunteerVote.SelectedPlayerId,
                startedAtRound = threatState.ThreatVolunteerVote.StartedAtRound,
                completedAtRound = threatState.ThreatVolunteerVote.CompletedAtRound
            };
        }

        private string? GetUnanimousThreatVolunteer(Room room, ThreatInteractionState threatState)
        {
            var activeIds = GetActiveThreatPlayers(room)
                .Select(entry => RoomService.GetPlayerKey(entry.Value))
                .ToList();

            foreach (var candidateId in activeIds)
            {
                var requiredVoters = activeIds.Where(id => id != candidateId).ToList();
                if (requiredVoters.Count > 0 &&
                    requiredVoters.All(voterId =>
                        threatState.ThreatVolunteerVote.Votes.TryGetValue(voterId, out var targetId) &&
                        targetId == candidateId))
                {
                    return candidateId;
                }
            }

            return null;
        }

        private async Task BroadcastThreatState(Room room, string roomId)
        {
            QueueRoomRecovery(room, "threat_state");
            var roundState = BuildRoundState(room);
            var threatState = BuildThreatPublicState(room);
            var players = BuildRoomPlayersPayload(room);

            foreach (var entry in RoomService.GetPlayersSnapshot(room))
            {
                var connectionId = string.IsNullOrWhiteSpace(entry.Value.ConnectionId)
                    ? entry.Key
                    : entry.Value.ConnectionId;
                await Clients.Client(connectionId).SendAsync("ThreatStateUpdated", new
                {
                    threatState,
                    roundState,
                    players,
                    player = entry.Value
                });
            }
            await Clients.Group(roomId).SendAsync("RoundStateUpdated", roundState);
            if (!string.IsNullOrWhiteSpace(room.HostConnectionId) &&
                GmCapabilities.Allows(room.GmMode, GmCapability.ManagePublicGameState))
            {
                await Clients.Client(room.HostConnectionId).SendAsync("GMThreatControlData", BuildGMThreatControlData(room));
            }
            await BroadcastOmniscientStateToAuthorizedSpectators(room);
        }

        private static bool HasAny(IEnumerable<string>? values, IEnumerable<string> expected)
        {
            var set = new HashSet<string>(values ?? Enumerable.Empty<string>(), StringComparer.OrdinalIgnoreCase);
            return expected.Any(set.Contains);
        }

        private static List<string> GetRadiationSolverTags() =>
            new() { "radiation_analysis", "chemistry", "engineering_general", "medical_general" };

        private static List<string> GetRadiationResourceTags() =>
            new() { "radiation_detection", "sealant", "repair_tools", "decontamination_supplies" };

        private static List<string> GetRadiationFacilityTags() =>
            new() { "laboratory", "decontamination_area", "sealed_zone", "control_room" };

        private static List<string> GetRadiationProtectionTags() =>
            new() { "radiation_protection" };

        private static string GetItemSourceId(Item item) =>
            !string.IsNullOrWhiteSpace(item.InstanceId) ? item.InstanceId : item.Name;

        private static (string Source, string Token) ParseThreatItemToken(string value)
        {
            var trimmed = value?.Trim() ?? "";
            var separatorIndex = trimmed.IndexOf(':');
            if (separatorIndex <= 0)
            {
                return ("inventory", trimmed);
            }

            var source = trimmed[..separatorIndex].Trim().ToLowerInvariant();
            var token = trimmed[(separatorIndex + 1)..].Trim();
            return source is "profession" or "inventory"
                ? (source, token)
                : ("inventory", trimmed);
        }

        private static Item? ResolvePlayerThreatItem(Player player, string source, string token)
        {
            if (string.IsNullOrWhiteSpace(token))
            {
                return null;
            }

            if (source == "profession")
            {
                var professionItem = player.ProfessionItem;
                if (professionItem == null || string.IsNullOrWhiteSpace(professionItem.Name))
                {
                    return null;
                }

                return string.Equals(professionItem.InstanceId, token, StringComparison.OrdinalIgnoreCase) ||
                       string.Equals(professionItem.Name, token, StringComparison.OrdinalIgnoreCase)
                    ? professionItem
                    : null;
            }

            return player.Inventory.Items.FirstOrDefault(i =>
                string.Equals(i.InstanceId, token, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(i.Name, token, StringComparison.OrdinalIgnoreCase));
        }

        private static string NormalizeThreatLanguage(string? language)
        {
            var normalized = string.IsNullOrWhiteSpace(language) ? "uk" : language.Trim().ToLowerInvariant();
            return normalized is "uk" or "en" or "ru" ? normalized : "uk";
        }

        private string GetMitigatedRadiationSeverity(string baseSeverity, ThreatInteractionState threatState)
        {
            if (threatState.OperationBonuses.MedicalMitigationCount <= 0)
            {
                return baseSeverity;
            }

            threatState.OperationBonuses.MedicalMitigationCount--;
            return baseSeverity.Trim().ToLowerInvariant() switch
            {
                "hard" => "medium",
                "medium" => "light",
                _ => baseSeverity
            };
        }

        private bool ApplyRadiationConditionToParticipants(Room room, ThreatInteractionState threatState, string baseSeverityCode)
        {
            var applied = false;
            var participantIds = GetThreatParticipantIds(threatState);
            if (participantIds.Count == 0 && !string.IsNullOrWhiteSpace(threatState.VolunteerSelection.SelectedPlayerId))
            {
                participantIds.Add(threatState.VolunteerSelection.SelectedPlayerId);
            }

            foreach (var participantId in participantIds.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(participantId))
                {
                    continue;
                }

                if (threatState.OperationBonuses.ProtectedPlayerIds.Contains(participantId, StringComparer.OrdinalIgnoreCase))
                {
                    continue;
                }

                applied |= ApplyRadiationCondition(room, participantId, GetMitigatedRadiationSeverity(baseSeverityCode, threatState));
            }
            return applied;
        }

        private bool ApplyRadiationCondition(Room room, string playerId, string severityCode)
        {
            if (string.IsNullOrWhiteSpace(playerId))
            {
                return false;
            }

            var player = _roomService.GetPlayerByAnyId(room, playerId);
            if (player == null) return false;
            if (player.AdditionalConditionEffects.Any(effect =>
                    string.Equals(effect.ConditionId, RadiationConsequenceFactory.RadiationConditionId, StringComparison.OrdinalIgnoreCase)))
            {
                return false;
            }

            var condition = _gameData.PhysicalConditions.FirstOrDefault(item =>
                string.Equals(item.Id, "physical_152", StringComparison.OrdinalIgnoreCase));
            if (!RadiationConsequenceFactory.TryAddRadiationCondition(
                    player,
                    condition,
                    severityCode,
                    RadiationLeakThreatId,
                    room.CurrentRound,
                    out _))
            {
                _logger.LogWarning(
                    "Radiation consequence skipped. RoomId={RoomId}, PlayerId={PlayerId}, ConditionId={ConditionId}",
                    room.Id,
                    playerId,
                    "physical_152");
                return false;
            }

            var playerEntry = RoomService.GetPlayersSnapshot(room).FirstOrDefault(entry =>
                ReferenceEquals(entry.Value, player));
            if (!string.IsNullOrWhiteSpace(playerEntry.Key))
            {
                _roomService.UpdatePlayer(playerEntry.Key, player);
            }
            return true;
        }

        private bool ApplyRadiationFailure(Room room, ThreatInteractionState threatState)
        {
            return ApplyRadiationConditionToParticipants(room, threatState, "hard");
        }

        private bool ApplyRadiationFailure(Room room)
        {
            return ApplyRadiationFailure(room, EnsureRadiationThreatState(room));
        }

        private static string GetLocalizedConditionName(Models.GameData.PhysicalConditionData? condition, string language)
        {
            if (condition == null)
            {
                return "";
            }

            foreach (var lang in GetConditionLanguageOrder(condition.Localization, language))
            {
                if (condition.Localization != null &&
                    condition.Localization.TryGetValue(lang, out var localized) &&
                    !string.IsNullOrWhiteSpace(localized.Name))
                {
                    return localized.Name.Trim();
                }
            }

            return string.IsNullOrWhiteSpace(condition.Name) ? "" : condition.Name.Trim();
        }

        private static string GetLocalizedConditionDescription(Models.GameData.PhysicalConditionData? condition, string language, string severityCode)
        {
            if (condition == null)
            {
                return "";
            }

            foreach (var lang in GetConditionLanguageOrder(condition.Localization, language))
            {
                if (condition.Localization == null ||
                    !condition.Localization.TryGetValue(lang, out var localized))
                {
                    continue;
                }

                if (localized.Descriptions != null &&
                    localized.Descriptions.TryGetValue(severityCode, out var severityDescription) &&
                    !string.IsNullOrWhiteSpace(severityDescription))
                {
                    return severityDescription.Trim();
                }

                if (!string.IsNullOrWhiteSpace(localized.Description))
                {
                    return localized.Description.Trim();
                }
            }

            return condition.Description?.Trim() ?? "";
        }

        private static IEnumerable<string> GetConditionLanguageOrder(
            Dictionary<string, Models.GameData.ConditionLocalization>? localization,
            string language)
        {
            var result = new List<string>();
            void Add(string? value)
            {
                if (!string.IsNullOrWhiteSpace(value) && !result.Contains(value, StringComparer.OrdinalIgnoreCase))
                {
                    result.Add(value);
                }
            }

            Add(language);
            Add("uk");
            Add("ru");
            Add("en");

            if (localization != null)
            {
                foreach (var key in localization.Keys)
                {
                    Add(key);
                }
            }

            return result;
        }

        private bool ConsumeAcceptedThreatItems(Room room, ThreatInteractionState threatState, bool success)
        {
            if (string.Equals(threatState.CurrentThreatId, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            if (!success) return false;
            var consumed = false;

            foreach (var contribution in threatState.Contributions.Where(c =>
                         IsActiveThreatContribution(c) &&
                         c.SourceType == "personal_inventory" &&
                         threatState.OperationBonuses.UsefulContributionIds.Contains(c.ContributionId, StringComparer.OrdinalIgnoreCase)))
            {
                var owner = _roomService.GetPlayerByAnyId(room, contribution.OwnerPlayerId);
                var item = owner?.Inventory.Items.FirstOrDefault(i => GetItemSourceId(i) == contribution.SourceId);
                if (owner == null || item == null) continue;

                var mode = "on_success";
                if (item.ThreatUsage != null &&
                    item.ThreatUsage.TryGetValue("consumptionMode", out var element) &&
                    element.ValueKind == JsonValueKind.String)
                {
                    mode = element.GetString() ?? mode;
                }

                if (mode == "on_success")
                {
                    owner.Inventory.Items.Remove(item);
                    contribution.IsConsumed = true;
                    contribution.Status = "consumed";
                    consumed = true;
                }
            }
            return consumed;
        }

        private bool GrantThreatVoteImmunityIfNeeded(Room room, ThreatInteractionState threatState)
        {
            if (threatState.VolunteerSelection.SelectionReason != "group_vote" ||
                string.IsNullOrWhiteSpace(threatState.VolunteerSelection.SelectedPlayerId))
            {
                return false;
            }

            var player = _roomService.GetPlayerByAnyId(room, threatState.VolunteerSelection.SelectedPlayerId);
            if (player == null) return false;

            var changed = !player.EliminationVoteImmunity.IsActive ||
                !string.Equals(player.EliminationVoteImmunity.SourceThreatId, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase) ||
                player.EliminationVoteImmunity.GrantedAtRound != room.CurrentRound ||
                player.EliminationVoteImmunity.RemainingUses != 1;

            player.EliminationVoteImmunity.IsActive = true;
            player.EliminationVoteImmunity.SourceThreatId = RadiationLeakThreatId;
            player.EliminationVoteImmunity.GrantedAtRound = room.CurrentRound;
            player.EliminationVoteImmunity.RemainingUses = 1;
            return changed;
        }
    }
}
