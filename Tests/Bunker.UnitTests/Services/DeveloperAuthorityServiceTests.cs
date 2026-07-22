using System.Security.Claims;
using Bunker.Models;
using Bunker.Services;
using Bunker.Services.OwnerContent;
using Microsoft.Extensions.Options;

namespace Bunker.UnitTests.Services;

public sealed class DeveloperAuthorityServiceTests
{
    private static readonly Guid OwnerId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    [Fact]
    public void DeveloperIdentityComesFromAuthenticatedServerAccountNotNameOrHostRole()
    {
        var authority = CreateAuthority();
        var trusted = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, OwnerId.ToString())], "test"));
        var spoofed = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()), new Claim(ClaimTypes.Name, "Developer")], "test"));
        var room = new Room { HostConnectionId = "host", HostPlayerId = "host-id" };
        var host = new Player { StablePlayerId = "host-id", ConnectionId = "host", Name = "Developer" };
        var developer = new Player { StablePlayerId = "dev-id", ConnectionId = "dev", AccountUserId = OwnerId };

        Assert.True(authority.IsDeveloper(trusted));
        Assert.False(authority.IsDeveloper(spoofed));
        Assert.False(authority.IsDeveloper(host));
        Assert.True(authority.IsDeveloper(developer));
        Assert.True(authority.Has(room, host, RoomActorCapability.ManageRoom));
        Assert.False(authority.Has(room, host, RoomActorCapability.UseDeveloperTools));
        Assert.True(authority.Has(room, developer, RoomActorCapability.UseDeveloperTools));
    }

    [Fact]
    public void ActiveOperatorLeaseRequiresExplicitTakeoverByAnotherDeveloperPlayer()
    {
        var authority = CreateAuthority();
        var room = new Room();
        var first = new Player { StablePlayerId = "dev-one", ConnectionId = "connection-one", AccountUserId = OwnerId, IsConnected = true };
        var second = new Player { StablePlayerId = "dev-two", ConnectionId = "connection-two", AccountUserId = OwnerId, IsConnected = true };
        room.Players[first.ConnectionId] = first;
        room.Players[second.ConnectionId] = second;

        Assert.True(authority.EnsureActiveOperator(room, first, first.ConnectionId));
        Assert.False(authority.EnsureActiveOperator(room, second, second.ConnectionId));
        Assert.True(authority.IsActiveOperator(room, first, first.ConnectionId));
        Assert.True(authority.EnsureActiveOperator(room, second, second.ConnectionId, takeover: true));
        Assert.True(authority.IsActiveOperator(room, second, second.ConnectionId));
        Assert.False(authority.IsActiveOperator(room, first, first.ConnectionId));
    }

    [Fact]
    public void PublicPresenceIncludesNoCapabilitiesOrAuthenticationMaterial()
    {
        var authority = CreateAuthority();
        var room = new Room();
        room.Players["dev"] = new Player
        {
            StablePlayerId = "developer-player", ConnectionId = "dev", AccountUserId = OwnerId, IsConnected = true
        };

        var presence = authority.Presence(room);

        Assert.True(presence.DeveloperPresent);
        Assert.Equal("developer-player", presence.DeveloperPlayerId);
        Assert.Equal("connected", presence.Status);
    }

    private static DeveloperAuthorityService CreateAuthority() => new(
        Options.Create(new OwnerAccessOptions { UserId = OwnerId.ToString() }),
        Options.Create(new DeveloperAuthorityOptions()),
        TimeProvider.System);
}
