using Bunker.Models;
using Bunker.Services;

namespace Bunker.Services;

public sealed record CharacterRevealResult(bool Success, string? ErrorCode, string ActorStablePlayerId, string CharacteristicKey, long RevealRevision);

public sealed class CharacterRevealService
{
    public CharacterRevealResult RevealOwn(Room room, Player actor, string characteristicKey, bool aiPresentationAuthorized = false)
    {
        var actorId = RoomService.GetPlayerKey(actor);
        if (room.State != RoomState.Playing) return new(false, "game_not_playing", actorId, characteristicKey, room.PublicRevealRevision);
        if (actor.IsEliminated || actor.IsLobbySpectator || actor.IsSpectatorGm) return new(false, "actor_not_eligible", actorId, characteristicKey, room.PublicRevealRevision);
        if (actor.IsAi && !aiPresentationAuthorized) return new(false, "ai_presentation_required", actorId, characteristicKey, room.PublicRevealRevision);
        if (!GmPlayerStateMutator.PublicCharacteristicKeys.Contains(characteristicKey, StringComparer.Ordinal)) return new(false, "invalid_characteristic", actorId, characteristicKey, room.PublicRevealRevision);
        lock (room.SnapshotSyncRoot)
        {
            if (IsRevealed(actor, characteristicKey)) return new(false, "already_revealed", actorId, characteristicKey, room.PublicRevealRevision);
            SetRevealed(actor, characteristicKey);
            return new(true, null, actorId, characteristicKey, ++room.PublicRevealRevision);
        }
    }

    public CharacterRevealResult RevealAiPresentation(Room room, Player ai, string requestedStablePlayerId, string characteristicKey, bool presentationAuthorized) =>
        !presentationAuthorized || !ai.IsAi || !string.Equals(RoomService.GetPlayerKey(ai), requestedStablePlayerId, StringComparison.Ordinal)
            ? new(false, "ai_reveal_forbidden", RoomService.GetPlayerKey(ai), characteristicKey, room.PublicRevealRevision)
            : RevealOwn(room, ai, characteristicKey, true);

    private static bool IsRevealed(Player p, string key) => key switch { "Personality" => p.Revealed.Personality, "Body" => p.Revealed.Body, "Profession" => p.Revealed.Profession, "PhysicalHealth" => p.Revealed.PhysicalHealth, "MentalHealth" => p.Revealed.MentalHealth, "Hobby" => p.Revealed.Hobby, "CharacterTrait" => p.Revealed.CharacterTrait, "Phobia" => p.Revealed.Phobia, "Inventory" => p.Revealed.Inventory, "Property" => p.Revealed.Property, "Fact" => p.Revealed.Fact, _ => true };
    private static void SetRevealed(Player p, string key) { p.Revealed ??= new(); switch (key) { case "Personality": p.Revealed.Personality = true; break; case "Body": p.Revealed.Body = true; break; case "Profession": p.Revealed.Profession = true; break; case "PhysicalHealth": p.Revealed.PhysicalHealth = true; break; case "MentalHealth": p.Revealed.MentalHealth = true; break; case "Hobby": p.Revealed.Hobby = true; break; case "CharacterTrait": p.Revealed.CharacterTrait = true; break; case "Phobia": p.Revealed.Phobia = true; break; case "Inventory": p.Revealed.Inventory = true; break; case "Property": p.Revealed.Property = true; break; case "Fact": p.Revealed.Fact = true; break; } }
}
