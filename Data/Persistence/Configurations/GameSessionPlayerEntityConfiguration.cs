using Bunker.Data.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Bunker.Data.Persistence.Configurations;

public sealed class GameSessionPlayerEntityConfiguration : IEntityTypeConfiguration<GameSessionPlayerEntity>
{
	public void Configure(EntityTypeBuilder<GameSessionPlayerEntity> builder)
	{
		builder.ToTable("GameSessionPlayers");
		builder.HasKey(participant => participant.Id);

		builder.Property(participant => participant.StablePlayerIdSnapshot)
			.IsRequired()
			.HasMaxLength(128);

		builder.Property(participant => participant.PlayerNameSnapshot)
			.IsRequired()
			.HasMaxLength(10);

		builder.HasIndex(participant => participant.GameSessionId);
		builder.HasIndex(participant => participant.UserId);
		builder.HasIndex(participant => new
			{
				participant.GameSessionId,
				participant.StablePlayerIdSnapshot
			})
			.IsUnique();

		builder.HasOne(participant => participant.GameSession)
			.WithMany(session => session.GameSessionPlayers)
			.HasForeignKey(participant => participant.GameSessionId)
			.OnDelete(DeleteBehavior.Cascade);

		builder.HasOne(participant => participant.User)
			.WithMany()
			.HasForeignKey(participant => participant.UserId)
			.OnDelete(DeleteBehavior.SetNull);
	}
}
