using Bunker.Data.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Bunker.Data.Persistence.Configurations;

public sealed class RoomRecoverySnapshotEntityConfiguration : IEntityTypeConfiguration<RoomRecoverySnapshotEntity>
{
	public void Configure(EntityTypeBuilder<RoomRecoverySnapshotEntity> builder)
	{
		builder.ToTable("RoomRecoverySnapshots");
		builder.HasKey(snapshot => snapshot.RoomCode);
		builder.Property(snapshot => snapshot.RoomCode).IsRequired().HasMaxLength(32);
		builder.Property(snapshot => snapshot.RoomState).IsRequired().HasMaxLength(32);
		builder.Property(snapshot => snapshot.StateJson).IsRequired();
		builder.Property(snapshot => snapshot.Fingerprint).IsRequired().HasMaxLength(64);
		builder.HasIndex(snapshot => snapshot.UpdatedAtUtc);
		builder.HasIndex(snapshot => snapshot.ExpiresAtUtc);
		builder.HasIndex(snapshot => snapshot.RoomState);
	}
}
