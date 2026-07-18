using Bunker.Data.Persistence.Configurations;
using Bunker.Data.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Bunker.Data.Persistence
{
	public class BunkerDbContext : DbContext
	{
		public BunkerDbContext(DbContextOptions<BunkerDbContext> options) : base(options)
		{
		}
		public DbSet<GameSessionEntity> GameSessions => Set<GameSessionEntity>();
		protected override void OnModelCreating(ModelBuilder modelBuilder)
		{
			base.OnModelCreating(modelBuilder);

			modelBuilder.ApplyConfiguration(new GameSessionEntityConfiguration());
		}
	}
}