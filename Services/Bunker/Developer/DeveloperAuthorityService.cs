using System.Security.Claims;
using Bunker.Models;
using Bunker.Services.OwnerContent;
using Microsoft.Extensions.Options;

namespace Bunker.Services;

public sealed class DeveloperAuthorityService
{
    public const int MaxAuditEntries = 100;
    private readonly IOptions<OwnerAccessOptions> _ownerOptions;
    private readonly IOptions<DeveloperAuthorityOptions> _options;
    private readonly TimeProvider _timeProvider;

    public DeveloperAuthorityService(
        IOptions<OwnerAccessOptions> ownerOptions,
        IOptions<DeveloperAuthorityOptions> options,
        TimeProvider timeProvider)
    {
        _ownerOptions = ownerOptions;
        _options = options;
        _timeProvider = timeProvider;
    }

    public bool IsDeveloper(ClaimsPrincipal? principal) =>
        principal?.Identity?.IsAuthenticated == true &&
        _ownerOptions.Value.TryGetOwnerId(out var ownerId) &&
        Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var callerId) &&
        callerId == ownerId;

    public bool IsDeveloper(Player? player) =>
        player?.AccountUserId is Guid accountId &&
        _ownerOptions.Value.TryGetOwnerId(out var ownerId) &&
        accountId == ownerId;

    public RoomActorCapability Resolve(Room room, Player player)
    {
        if (IsDeveloper(player)) return RoomActorCapability.All;
        if (room.IsHost(player) && !player.IsSpectatorGm)
        {
            return RoomActorCapability.ManageRoom | RoomActorCapability.StartGame | RoomActorCapability.EndRound |
                RoomActorCapability.ManageVoting | RoomActorCapability.ManageTimer | RoomActorCapability.ManageThreats |
                RoomActorCapability.ManageBunkerResources | RoomActorCapability.SendGameEvents |
                RoomActorCapability.ManagePlayers | RoomActorCapability.TransferHost |
                RoomActorCapability.UsePremiumHostFeatures;
        }
        if (player.IsSpectatorGm || player.GmRole == GmMode.OmniscientGm)
            return RoomActorCapability.UseOmniscientGm | RoomActorCapability.UseDirectorControls;
        return RoomActorCapability.None;
    }

    public bool Has(Room room, Player player, RoomActorCapability capability) =>
        (Resolve(room, player) & capability) == capability && FeatureAllows(capability);

    public bool FeatureAllows(RoomActorCapability capability)
    {
        var options = _options.Value;
        return capability switch
        {
            RoomActorCapability.ViewDiagnostics or RoomActorCapability.ViewAuditLog or
                RoomActorCapability.ManageSnapshots or RoomActorCapability.EditRoomState or
                RoomActorCapability.UseDeveloperTools => options.DeveloperToolsEnabled,
            RoomActorCapability.ManageScenarioImages => options.DeveloperToolsEnabled && options.ScenarioImageManagementEnabled,
            RoomActorCapability.OperatePostGameStoryDirector or RoomActorCapability.PublishPostGameStory => options.DeveloperToolsEnabled && options.PostGameStoryDirectorEnabled,
            RoomActorCapability.EditGlobalContent => options.DeveloperToolsEnabled && options.ContentEditingEnabled,
            RoomActorCapability.UseRecoveryTools => options.DeveloperToolsEnabled && options.RecoveryToolsEnabled,
            _ => true
        };
    }

    public DeveloperPresenceDto Presence(Room room)
    {
        var developer = RoomService.GetPlayersSnapshot(room).Select(x => x.Value)
            .FirstOrDefault(player => player.IsConnected && IsDeveloper(player));
        return new(developer != null, developer == null ? null : RoomService.GetPlayerKey(developer), developer == null ? "offline" : "connected");
    }

    public bool TryGetDeveloperRoomActor(Room room, ClaimsPrincipal? principal, out Player player)
    {
        player = null!;
        if (!IsDeveloper(principal)) return false;
        var accountId = Guid.Parse(principal!.FindFirstValue(ClaimTypes.NameIdentifier)!);
        player = RoomService.GetPlayersSnapshot(room).Select(x => x.Value)
            .FirstOrDefault(candidate => candidate.IsConnected && candidate.AccountUserId == accountId)!;
        return player != null;
    }

    public bool EnsureActiveOperator(Room room, Player developer, string connectionId, bool takeover = false)
    {
        if (!IsDeveloper(developer) || string.IsNullOrWhiteSpace(connectionId)) return false;
        lock (room.DeveloperAuthoritySyncRoot)
        {
            var now = _timeProvider.GetUtcNow();
            var samePlayer = string.Equals(room.ActiveDeveloperPlayerId, RoomService.GetPlayerKey(developer), StringComparison.OrdinalIgnoreCase);
            var leaseExpired = room.ActiveDeveloperLeaseUtc is null ||
                now - room.ActiveDeveloperLeaseUtc.Value > TimeSpan.FromSeconds(Math.Clamp(_options.Value.OperatorReconnectWindowSeconds, 5, 300));
            var activeConnected = !string.IsNullOrWhiteSpace(room.ActiveDeveloperConnectionId) &&
                IsCurrentDeveloperConnection(room, room.ActiveDeveloperConnectionId);
            if (string.IsNullOrWhiteSpace(room.ActiveDeveloperPlayerId) || samePlayer || leaseExpired || !activeConnected || takeover)
            {
                room.ActiveDeveloperPlayerId = RoomService.GetPlayerKey(developer);
                room.ActiveDeveloperConnectionId = connectionId;
                room.ActiveDeveloperLeaseUtc = now;
                room.DeveloperOperatorVersion++;
                return true;
            }
            return false;
        }
    }

    public bool IsActiveOperator(Room room, Player developer, string connectionId) =>
        IsDeveloper(developer) &&
        string.Equals(room.ActiveDeveloperPlayerId, RoomService.GetPlayerKey(developer), StringComparison.OrdinalIgnoreCase) &&
        string.Equals(room.ActiveDeveloperConnectionId, connectionId, StringComparison.Ordinal);

    public DeveloperPrivateDto PrivateState(Room room, Player player, string connectionId)
    {
        var capabilities = Resolve(room, player);
        var isDeveloper = IsDeveloper(player);
        var features = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase)
        {
            ["developerTools"] = FeatureAllows(RoomActorCapability.UseDeveloperTools),
            ["scenarioImages"] = FeatureAllows(RoomActorCapability.ManageScenarioImages),
            ["postGameStory"] = FeatureAllows(RoomActorCapability.OperatePostGameStoryDirector),
            ["contentEditing"] = FeatureAllows(RoomActorCapability.EditGlobalContent),
            ["recoveryTools"] = FeatureAllows(RoomActorCapability.UseRecoveryTools)
        };
        IReadOnlyList<DeveloperAuditEntry> recentAudit;
        lock (room.DeveloperAuthoritySyncRoot)
        {
            recentAudit = room.DeveloperAuditLog.TakeLast(20).Reverse().Select(entry => new DeveloperAuditEntry
            {
                TimestampUtc = entry.TimestampUtc,
                RoomId = entry.RoomId,
                DeveloperPlayerId = entry.DeveloperPlayerId,
                Capability = entry.Capability,
                CommandType = entry.CommandType,
                Result = entry.Result,
                AffectedEntityId = entry.AffectedEntityId,
                CommandId = entry.CommandId,
                FailureCode = entry.FailureCode
            }).ToArray();
        }
        return new(isDeveloper, player.IsLobbySpectator ? "observer" : "player",
            IsActiveOperator(room, player, connectionId), isDeveloper && !IsActiveOperator(room, player, connectionId),
            room.DeveloperOperatorVersion,
            Enum.GetValues<RoomActorCapability>().Where(value => value is not RoomActorCapability.None and not RoomActorCapability.All && (capabilities & value) == value).Select(value => value.ToString()).ToArray(),
            features,
            recentAudit);
    }

    public void Audit(Room room, Player developer, RoomActorCapability capability, string commandType,
        string result, string? affectedEntityId = null, string? commandId = null, string? failureCode = null)
    {
        lock (room.DeveloperAuthoritySyncRoot)
        {
            room.DeveloperAuditLog.Add(new()
            {
                TimestampUtc = _timeProvider.GetUtcNow(), RoomId = room.Id, DeveloperPlayerId = RoomService.GetPlayerKey(developer),
                Capability = capability.ToString(), CommandType = commandType, Result = result,
                AffectedEntityId = Safe(affectedEntityId), CommandId = Safe(commandId), FailureCode = Safe(failureCode)
            });
            if (room.DeveloperAuditLog.Count > MaxAuditEntries)
                room.DeveloperAuditLog.RemoveRange(0, room.DeveloperAuditLog.Count - MaxAuditEntries);
        }
    }

    private static bool IsCurrentDeveloperConnection(Room room, string connectionId) =>
        RoomService.GetPlayersSnapshot(room).Any(entry => string.Equals(entry.Value.ConnectionId, connectionId, StringComparison.Ordinal) && entry.Value.IsConnected);
    private static string? Safe(string? value) => string.IsNullOrWhiteSpace(value) ? null : new string(value.Where(c => char.IsLetterOrDigit(c) || c is '_' or '-').Take(100).ToArray());
}
