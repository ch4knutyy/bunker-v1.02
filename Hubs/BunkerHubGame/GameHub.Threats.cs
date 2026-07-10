using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;

namespace Bunker.Hubs
{
    public partial class GameHub
    {
        private const string RadiationLeakThreatId = "radiation_leak";

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
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var player))
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

            threatState.VolunteerSelection.SelectedPlayerId = RoomService.GetPlayerKey(player);
            threatState.VolunteerSelection.SelectionReason = "voluntary";
            threatState.VolunteerSelection.SelectedAtRound = context.Room.CurrentRound;
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
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var player))
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
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var player))
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

            var item = player.Inventory.Items.FirstOrDefault(i =>
                string.Equals(i.InstanceId, itemInstanceIdOrName, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(i.Name, itemInstanceIdOrName, StringComparison.OrdinalIgnoreCase));
            if (item == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Предмет не знайдено");
                return;
            }

            var tags = item.ResourceTags.Concat(item.ProtectionTags).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            var accepted = HasAny(tags, GetRadiationResourceTags().Concat(GetRadiationProtectionTags()));
            if (!accepted)
            {
                await Clients.Caller.SendAsync("ThreatPrivateMessage", new { message = "Цей предмет не допомагає проти радіаційного витоку." });
                return;
            }

            var itemSourceId = GetItemSourceId(item);
            if (FindActiveThreatContributionBySource(threatState, "personal_inventory", itemSourceId) != null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Цей предмет уже зарезервований для загрози");
                return;
            }

            AddThreatContribution(context.Room, threatState, "personal_inventory", itemSourceId, RoomService.GetPlayerKey(player), true, true, tags, item.Name);
            await Clients.Caller.SendAsync("ThreatPrivateMessage", new { message = "Предмет прийнято як прихований внесок." });
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
            var accepted = normalizedType == "bunker_facility"
                ? HasAny(tags, GetRadiationFacilityTags().Concat(new[] { "decontamination_area" }))
                : HasAny(tags, GetRadiationResourceTags().Concat(GetRadiationProtectionTags()));
            if (!accepted)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Цей ресурс не підходить для radiation_leak");
                return;
            }

            asset.Status = "reserved";
            AddThreatContribution(context.Room, threatState, normalizedType, asset.Id, "", false, true, tags, asset.GetName());
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
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var voter))
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
            if (!_roomService.TryResolvePlayer(context.Room, targetPlayerId, out _, out var target) || target.IsEliminated)
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
                message = $"Група відправила {selected?.Name ?? "гравця"} усувати загрозу.";
            }

            await Clients.Group(context.RoomId).SendAsync("ThreatVolunteerVoteClosed", new { message });
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
            if (!IsRadiationThreatActive(room, threatState) || threatState.Resolution.EffectsApplied)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Загрозу вже завершено або вона недоступна");
                return;
            }

            var volunteerId = threatState.VolunteerSelection.SelectedPlayerId;
            var hasVolunteer = !string.IsNullOrWhiteSpace(volunteerId);
            var hasSolver = hasVolunteer && threatState.Contributions.Any(c =>
                c.IsAccepted &&
                c.OwnerPlayerId == volunteerId &&
                (c.SourceType == "profession" || c.SourceType == "hobby") &&
                HasAny(c.TagsSnapshot, GetRadiationSolverTags()));
            var hasControl = threatState.Contributions.Any(c =>
                c.IsAccepted &&
                (c.SourceType == "personal_inventory" || c.SourceType == "bunker_resource" || c.SourceType == "bunker_facility") &&
                (HasAny(c.TagsSnapshot, GetRadiationResourceTags()) || HasAny(c.TagsSnapshot, GetRadiationFacilityTags())));
            var protectedVolunteer = hasVolunteer && threatState.Contributions.Any(c =>
                c.IsAccepted &&
                (string.IsNullOrWhiteSpace(c.OwnerPlayerId) || c.OwnerPlayerId == volunteerId) &&
                (HasAny(c.TagsSnapshot, GetRadiationProtectionTags()) || HasAny(c.TagsSnapshot, new[] { "decontamination_area" })));

            var success = hasVolunteer && hasSolver && hasControl;
            threatState.Resolution.SelectedApproachId = "contain_radiation";
            threatState.Resolution.WasSuccessful = success;
            threatState.Resolution.WasVolunteerProtected = protectedVolunteer;
            threatState.Resolution.EffectsApplied = true;
            threatState.Resolution.CompletedAtRound = room.CurrentRound;

            if (success && protectedVolunteer)
            {
                threatState.ThreatStatus = "resolved_safely";
                threatState.Resolution.PublicResults.Add("Радіаційний витік усунено безпечно.");
            }
            else if (success)
            {
                threatState.ThreatStatus = "resolved_with_casualty";
                ApplyRadiationSickness(room, volunteerId, "heavy");
                threatState.Resolution.PublicResults.Add("Загрозу усунено, але доброволець отримав променеве ураження.");
            }
            else
            {
                threatState.ThreatStatus = "failed";
                ApplyRadiationFailure(room);
                threatState.Resolution.PublicResults.Add("Загрозу не усунено. Група отримала наслідки радіаційного витоку.");
            }

            ConsumeAcceptedThreatItems(room, threatState, success);
            GrantThreatVoteImmunityIfNeeded(room, threatState);

            await Clients.Group(context.RoomId).SendAsync("ThreatResolved", new
            {
                status = threatState.ThreatStatus,
                wasSuccessful = success,
                wasVolunteerProtected = protectedVolunteer,
                results = threatState.Resolution.PublicResults
            });
            await BroadcastThreatState(room, context.RoomId);
        }

        private async Task SubmitThreatCapability(string sourceType)
        {
            var context = GetCurrentThreatContext();
            if (context.Room == null || string.IsNullOrWhiteSpace(context.RoomId) ||
                !_roomService.TryResolvePlayer(context.Room, Context.ConnectionId, out _, out var player))
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
            if (!HasAny(tags, GetRadiationSolverTags()))
            {
                await Clients.Caller.SendAsync("ThreatPrivateMessage", new { message = "Ця характеристика не підходить для radiation_leak." });
                return;
            }

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

            await Clients.Caller.SendAsync("ThreatPrivateMessage", new { message = "Компетенція підтверджена." });
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
                return room.ThreatState ??= new ThreatInteractionState();
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

        private bool IsRadiationThreatActive(Room room, ThreatInteractionState threatState) =>
            room.IsThreatRevealed &&
            string.Equals(room.CurrentThreat?.Id ?? threatState.CurrentThreatId, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase);

        private bool CanCollectThreatContributions(Room room, ThreatInteractionState threatState) =>
            IsRadiationThreatActive(room, threatState) &&
            (threatState.ThreatStatus == "collecting_contributions" ||
             threatState.ThreatStatus == "revealed" ||
             threatState.ThreatStatus == "volunteer_vote_open") &&
            !threatState.Resolution.EffectsApplied;

        private static bool IsActiveThreatContribution(ThreatContributionState contribution) =>
            contribution.IsAccepted &&
            !contribution.IsConsumed &&
            !string.Equals(contribution.Status, "withdrawn", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(contribution.Status, "rejected", StringComparison.OrdinalIgnoreCase);

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
                .Where(entry => entry.Value != null && !entry.Value.IsEliminated && entry.Value.IsConnected)
                .OrderBy(entry => entry.Value.SeatNumber == 0 ? int.MaxValue : entry.Value.SeatNumber)
                .ThenBy(entry => RoomService.GetPlayerKey(entry.Value), StringComparer.OrdinalIgnoreCase);

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
                ItemInstanceId = sourceType == "personal_inventory" ? sourceId : "",
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
                return new { currentThreatId = room.CurrentThreat?.Id ?? "", threatStatus = threatState.ThreatStatus };
            }

            var volunteer = string.IsNullOrWhiteSpace(threatState.VolunteerSelection.SelectedPlayerId)
                ? null
                : _roomService.GetPlayerByAnyId(room, threatState.VolunteerSelection.SelectedPlayerId);
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
                        ? threatState.Contributions
                            .Where(c => c.IsAccepted && c.SourceType == "personal_inventory")
                            .Select(c => new { c.DisplayName })
                            .ToList()
                        : null
                },
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
            var roundState = BuildRoundState(room);
            await Clients.Group(roomId).SendAsync("ThreatStateUpdated", new
            {
                threatState = BuildThreatPublicState(room),
                roundState
            });
            await Clients.Group(roomId).SendAsync("RoundStateUpdated", roundState);
        }

        private static bool HasAny(IEnumerable<string>? values, IEnumerable<string> expected)
        {
            var set = new HashSet<string>(values ?? Enumerable.Empty<string>(), StringComparer.OrdinalIgnoreCase);
            return expected.Any(set.Contains);
        }

        private static List<string> GetRadiationSolverTags() =>
            new() { "radiation_analysis", "chemistry", "engineering_general", "medical_general" };

        private static List<string> GetRadiationResourceTags() =>
            new() { "radiation_detection", "sealant", "decontamination_supplies" };

        private static List<string> GetRadiationFacilityTags() =>
            new() { "laboratory", "decontamination_area", "sealed_zone", "control_room" };

        private static List<string> GetRadiationProtectionTags() =>
            new() { "radiation_protection" };

        private static string GetItemSourceId(Item item) =>
            !string.IsNullOrWhiteSpace(item.InstanceId) ? item.InstanceId : item.Name;

        private void ApplyRadiationSickness(Room room, string playerId, string severity)
        {
            var player = _roomService.GetPlayerByAnyId(room, playerId);
            if (player == null) return;

            player.PhysicalHealth.Id = "radiation_sickness";
            player.PhysicalHealth.BaseName = "Променева хвороба";
            player.PhysicalHealth.Name = severity == "heavy"
                ? "Променева хвороба (важка форма)"
                : "Променева хвороба (легка форма)";
            player.PhysicalHealth.SeverityCode = severity == "heavy" ? "hard" : "light";
            player.PhysicalHealth.SeverityLevel = severity == "heavy" ? "Важкий" : "Легкий";
            player.PhysicalHealth.AllowsSeverity = true;
            player.PhysicalHealth.Description = "Наслідок радіаційного витоку.";

            if (player.Revealed.PhysicalHealth)
            {
                SetCharacteristicRevealed(player, "PhysicalHealth");
            }
        }

        private void ApplyRadiationFailure(Room room)
        {
            foreach (var player in GetActiveThreatPlayers(room).Select(entry => entry.Value))
            {
                if (string.IsNullOrWhiteSpace(player.PhysicalHealth.Id) ||
                    string.Equals(player.PhysicalHealth.SeverityCode, "none", StringComparison.OrdinalIgnoreCase))
                {
                    ApplyRadiationSickness(room, RoomService.GetPlayerKey(player), "light");
                }
                else
                {
                    player.MentalHealth.Description = string.IsNullOrWhiteSpace(player.MentalHealth.Description)
                        ? "Стрес після провалу усунення загрози."
                        : player.MentalHealth.Description + " Додатковий стрес після радіаційного витоку.";
                }
            }
        }

        private void ConsumeAcceptedThreatItems(Room room, ThreatInteractionState threatState, bool success)
        {
            if (!success) return;

            foreach (var contribution in threatState.Contributions.Where(c =>
                         IsActiveThreatContribution(c) && c.SourceType == "personal_inventory"))
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
                }
            }
        }

        private void GrantThreatVoteImmunityIfNeeded(Room room, ThreatInteractionState threatState)
        {
            if (threatState.VolunteerSelection.SelectionReason != "group_vote" ||
                string.IsNullOrWhiteSpace(threatState.VolunteerSelection.SelectedPlayerId))
            {
                return;
            }

            var player = _roomService.GetPlayerByAnyId(room, threatState.VolunteerSelection.SelectedPlayerId);
            if (player == null) return;

            player.EliminationVoteImmunity.IsActive = true;
            player.EliminationVoteImmunity.SourceThreatId = RadiationLeakThreatId;
            player.EliminationVoteImmunity.GrantedAtRound = room.CurrentRound;
            player.EliminationVoteImmunity.RemainingUses = 1;
        }
    }
}
