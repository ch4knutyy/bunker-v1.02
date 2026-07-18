using Bunker.Data.Persistence.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Bunker.Data.Persistence.Configurations;

public sealed class ApplicationUserConfiguration : IEntityTypeConfiguration<ApplicationUser>
{
	public void Configure(EntityTypeBuilder<ApplicationUser> builder)
	{
		builder.Property(user => user.DisplayName)
			.IsRequired()
			.HasMaxLength(32);

		builder.HasIndex(user => user.DisplayName)
			.IsUnique(false);

		builder.Property(user => user.CreatedAtUtc)
			.IsRequired();
	}
}
