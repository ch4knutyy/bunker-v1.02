using Bunker.Data.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Bunker.Data.Persistence.Configurations
{
	public class GameSessionEntityConfiguration : IEntityTypeConfiguration<GameSessionEntity>
	{
		public void Configure(EntityTypeBuilder<GameSessionEntity> builder)
		{
			builder.ToTable("GameSessions");

			builder.HasKey(gameSession => gameSession.Id);

			builder.Property(gameSession => gameSession.RoomCode)
				.IsRequired()
				.HasMaxLength(32);

			builder.Property(gameSession => gameSession.Status)
				.IsRequired()
				.HasMaxLength(32);

			builder.Property(gameSession => gameSession.ApocalypseId)
				.HasMaxLength(128);

			builder.Property(gameSession => gameSession.BunkerId)
				.HasMaxLength(128);

			builder.HasIndex(gameSession => gameSession.RoomCode);

			builder.HasIndex(gameSession => gameSession.CreatedAtUtc);
		}
	}
}