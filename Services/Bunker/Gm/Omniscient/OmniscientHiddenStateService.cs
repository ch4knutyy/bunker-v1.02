using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services;

public sealed class OmniscientHiddenStateService(TimeProvider timeProvider, GameTimerService timers, RoomService rooms)
{
    private readonly ConcurrentDictionary<string, long> _versions = new(StringComparer.OrdinalIgnoreCase);

    public OmniscientRoomStateDto Build(Room room, bool includeSecretVotes)
    {
        var now = timeProvider.GetUtcNow();
        var players = RoomService.GetPlayersSnapshot(room).Select(x => BuildPlayer(room, x.Value)).ToList();
        var threat = BuildThreat(room);
        var voting = BuildVoting(room, includeSecretVotes);
        var version = _versions.AddOrUpdate(room.Id, 1, (_, current) => current + 1);
        var fingerprintSource = $"{room.Id}|{room.CurrentRound}|{room.CurrentPhase}|{room.State}|{room.CurrentVoting?.Id}|{room.ThreatState?.ThreatStatus}|{string.Join(';', players.Select(p => $"{p.PlayerId}:{p.IsEliminated}:{p.Characteristics.Count}:{p.Inventory.Count}"))}";
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(fingerprintSource)))[..16].ToLowerInvariant();
        var timer = timers.GetDto(room);
        return new(version, now, fingerprint, room.Id, room.CurrentRound, room.CurrentPhase.ToString(), room.IsPaused, room.PauseReason,
            ResolveStableId(room, room.CurrentTurnPlayerId), room.GameplayPlayerCount,
            players.Where(p => p.IsSpectatorGm).Select(p => p.PlayerId).ToList(),
            room.Bunker == null ? null : new(room.Bunker.Id, room.Bunker.Name, room.Bunker.Description, room.Bunker.Capacity,
                room.Bunker.Location, room.Bunker.SuppliesMonths, room.Bunker.Facilities.ToList(), room.Bunker.Resources.ToList(), room.Bunker.Problems.ToList(), room.Bunker.Condition),
            room.Apocalypse == null ? null : new(room.Apocalypse.Id, room.Apocalypse.Name, room.Apocalypse.Description, room.Apocalypse.Severity,
                room.Apocalypse.Duration, room.Apocalypse.Threats.ToList(), room.Apocalypse.Requirements.ToList()),
            new(timer.Status, timer.Purpose, timer.DurationSeconds, timer.DeadlineUtc, timer.RemainingSeconds),
            threat, voting, players, includeSecretVotes);
    }

    private static OmniscientPlayerStateDto BuildPlayer(Room room, Player player)
    {
        var r = player.Revealed;
        var characteristics = new List<OmniscientCharacteristicDto>
        {
            new("personality", $"{player.Personality.Age}; {player.Personality.Sex}; {player.Personality.SexOrientation}; childfree: {player.Personality.IsChildfree}", r.Personality),
            new("body", $"{player.Body.Height} cm; {player.Body.Weight} kg; {player.Body.BodyType}", r.Body),
            new("profession", $"{player.Profession.Name}; {player.Profession.ExperienceYears} years; {player.Profession.SelectedItem}", r.Profession, player.Profession.Tooltip),
            new("physicalHealth", player.PhysicalHealth.Name, r.PhysicalHealth, First(player.PhysicalHealth.Description, player.PhysicalHealth.Tooltip)),
            new("mentalHealth", player.MentalHealth.Name, r.MentalHealth, First(player.MentalHealth.Description, player.MentalHealth.Tooltip)),
            new("hobby", $"{player.Hobby.Name}; {player.Hobby.Item}", r.Hobby, player.Hobby.Tooltip),
            new("characterTrait", player.CharacterTrait.Name, r.CharacterTrait),
            new("phobia", player.Phobia.Name, r.Phobia, player.Phobia.Description),
            new("fact", First(player.Fact.Name, player.Fact.Description) ?? "", r.Fact, First(player.Fact.Description, player.Fact.Tooltip)),
            new("professionItem", player.ProfessionItem.Name, r.Profession),
            new("inventory", string.Join("; ", player.Inventory.Items.Select(i => i.Name)), r.Inventory),
            new("property", player.Property?.GetDisplayText("uk") ?? "Майно відсутнє", r.Property)
        };
        var specialCards = player.SpecialCards.Append(player.SpecialCard)
            .Where(card => card != null && (!string.IsNullOrWhiteSpace(card.Id) || !string.IsNullOrWhiteSpace(card.Name)))
            .GroupBy(card => $"{card.Id}|{card.Name}").Select(group => group.First())
            .Select(card => new OmniscientSpecialCardDto(card.Id, card.Name, card.Description, card.IsSecret, card.IsUsed, card.IsActive, card.UseMode)).ToList();
        var id = RoomService.GetPlayerKey(player);
        return new(id, player.Name, RoomService.IsGameplayParticipant(player), player.IsEliminated, player.IsConnected,
            room.IsHost(player), player.IsSpectatorGm, room.VotingReadyResponses.ContainsKey(id),
            string.Equals(ResolveStableId(room, room.CurrentTurnPlayerId), id, StringComparison.OrdinalIgnoreCase), characteristics,
            player.Inventory.Items.Select(i => new OmniscientInventoryItemDto(i.Name, i.Description, i.Quantity, i.Unit, i.IsHidden, i.Source)).ToList(),
            specialCards,
            player.AdditionalConditionEffects.Select(c => new OmniscientConditionDto(c.ConditionId, c.Name, c.SeverityLevel, c.Description, c.SourceThreatId)).ToList(),
            null);
    }

    private OmniscientVotingStateDto? BuildVoting(Room room, bool includeSecretVotes)
    {
        var voting = room.CurrentVoting; if (voting == null) return null;
        IReadOnlyList<OmniscientVoteDto>? votes = null;
        if (includeSecretVotes)
            votes = voting.Votes.Where(v => !VotingSession.IsExtraVoteId(v.Key)).Select(v =>
            {
                var voter = rooms.GetPlayerByAnyId(room, v.Key); var target = rooms.GetPlayerByAnyId(room, v.Value);
                return new OmniscientVoteDto(voter == null ? v.Key : RoomService.GetPlayerKey(voter), voter?.Name ?? "Unknown",
                    target == null ? v.Value : RoomService.GetPlayerKey(target), target?.Name ?? "Unknown");
            }).ToList();
        return new(voting.State.ToString(), voting.EligibleVoters.Count, voting.RealVoteCount, votes);
    }

    private static OmniscientThreatStateDto? BuildThreat(Room room)
    {
        if (room.CurrentThreat == null && room.ThreatState == null) return null;
        var state = room.ThreatState; var mini = state?.MiniGame;
        var terminal = state?.ThreatStatus is "resolved_safely" or "resolved_with_casualty" or "failed" or "completed" ? state.ThreatStatus : null;
        var attempt = mini == null ? null : new OmniscientThreatAttemptDto(mini.Status, mini.StartedAtUtc, mini.CompletedAtUtc,
            mini.CurrentIndex, mini.Questions.Count, mini.CorrectAnswers, mini.WrongAnswers, mini.Timeouts);
        return new(room.CurrentThreat?.Id ?? state?.CurrentThreatId, room.CurrentThreat?.Category, room.CurrentThreat?.Name,
            state?.ThreatStatus ?? (room.IsThreatRevealed ? "revealed" : "hidden"), state?.ParticipantPlayerIds.ToList() ?? [],
            EmptyToNull(state?.MiniGame.LeaderPlayerId) ?? EmptyToNull(state?.VolunteerSelection.SelectedPlayerId),
            EmptyToNull(state?.PlanChoice.SelectedPlanId), terminal, state?.Resolution.EffectsApplied == true, attempt);
    }

    private static string? ResolveStableId(Room room, string? value) => string.IsNullOrWhiteSpace(value) ? null :
        room.Players.Values.FirstOrDefault(player => player != null &&
            (player.ConnectionId == value || player.StablePlayerId == value || player.Id.ToString() == value)) is { } player
            ? RoomService.GetPlayerKey(player) : value;
    private static string? First(params string?[] values) => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
    private static string? EmptyToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
