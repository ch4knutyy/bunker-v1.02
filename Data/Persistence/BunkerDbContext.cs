using Bunker.Data.Persistence.Configurations;
using Bunker.Data.Persistence.Entities;
using Bunker.Data.Persistence.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Bunker.Data.Persistence
{
	public class BunkerDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
	{
		public BunkerDbContext(DbContextOptions<BunkerDbContext> options) : base(options)
		{
		}
		public DbSet<GameSessionEntity> GameSessions => Set<GameSessionEntity>();
		protected override void OnModelCreating(ModelBuilder modelBuilder)
		{
			base.OnModelCreating(modelBuilder);

			modelBuilder.ApplyConfiguration(new ApplicationUserConfiguration());
			modelBuilder.ApplyConfiguration(new GameSessionEntityConfiguration());
		}
	}
}
