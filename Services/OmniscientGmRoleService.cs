using Bunker.Models;

namespace Bunker.Services;

public sealed class OmniscientGmRoleService(RoomService rooms)
{
    public OmniscientGmPreviewDto Preview(Room room, Player player)
    {
        var id = RoomService.GetPlayerKey(player); var voting = room.CurrentVoting; var threat = room.ThreatState;
        return new(id, player.Name, true,
            voting?.Votes.ContainsKey(id) == true || voting?.Votes.ContainsKey(player.ConnectionId) == true,
            room.VotingReadyResponses.ContainsKey(id) || room.VotingReadyResponses.ContainsKey(player.ConnectionId),
            room.CurrentTurnPlayerId == id || room.CurrentTurnPlayerId == player.ConnectionId,
            threat?.ParticipantPlayerIds.Contains(id, StringComparer.OrdinalIgnoreCase) == true || threat?.VolunteerSelection.SelectedPlayerId == id || threat?.MiniGame.LeaderPlayerId == id,
            true, !player.IsSpectatorGm);
    }

    public OmniscientGmStateDto Enter(Room room, Player player)
    {
        var id = RoomService.GetPlayerKey(player);
        room.IrreversibleOmniscientPlayerIds.Add(id);
        player.IsSpectatorGm = true; player.HasSeenOmniscientState = true;
        rooms.RemoveGameplayParticipation(room, player);
        room.GmMode = GmMode.OmniscientGm;
        return PublicState(room, player);
    }

    public static OmniscientGmStateDto PublicState(Room room, Player player) =>
        new(player.IsSpectatorGm, RoomService.GetPlayerKey(player), player.Name, room.IsHost(player), "spectator_gm", "GM-спостерігач не бере участі у грі та голосуванні");
}
