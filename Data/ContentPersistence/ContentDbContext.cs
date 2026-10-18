using Bunker.Data.ContentPersistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Bunker.Data.ContentPersistence;

public sealed class ContentDbContext(DbContextOptions<ContentDbContext> options) : DbContext(options)
{
    public DbSet<ContentCategoryEntity> Categories => Set<ContentCategoryEntity>();
    public DbSet<ContentDocumentEntity> Documents => Set<ContentDocumentEntity>();
    public DbSet<ContentItemEntity> Items => Set<ContentItemEntity>();
    public DbSet<ContentLocalizationEntity> Localizations => Set<ContentLocalizationEntity>();
    public DbSet<ContentTagEntity> Tags => Set<ContentTagEntity>();
    public DbSet<ContentRelationshipEntity> Relationships => Set<ContentRelationshipEntity>();
    public DbSet<ContentImportRunEntity> ImportRuns => Set<ContentImportRunEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ContentCategoryEntity>(builder =>
        {
            builder.ToTable("ContentCategories");
            builder.HasKey(x => x.Key);
            builder.Property(x => x.Key).HasMaxLength(100);
            builder.Property(x => x.SourceDescription).HasMaxLength(500).IsRequired();
        });

        modelBuilder.Entity<ContentDocumentEntity>(builder =>
        {
            builder.ToTable("ContentDocuments");
            builder.HasKey(x => x.SourcePath);
            builder.Property(x => x.SourcePath).HasMaxLength(260);
            builder.Property(x => x.Fingerprint).HasMaxLength(64).IsRequired();
            builder.Property(x => x.RawJson).IsRequired();
            builder.HasIndex(x => x.Fingerprint);
        });

        modelBuilder.Entity<ContentItemEntity>(builder =>
        {
            builder.ToTable("ContentItems");
            builder.HasKey(x => new { x.SourcePath, x.StableId });
            builder.Property(x => x.SourcePath).HasMaxLength(260);
            builder.Property(x => x.StableId).HasMaxLength(160);
            builder.Property(x => x.CategoryKey).HasMaxLength(100).IsRequired();
            builder.Property(x => x.DisplayName).HasMaxLength(500).IsRequired();
            builder.Property(x => x.PayloadJson).IsRequired();
            builder.HasIndex(x => new { x.CategoryKey, x.StableId }).IsUnique();
            builder.HasIndex(x => new { x.CategoryKey, x.DisplayName });
            builder.HasOne(x => x.Document).WithMany(x => x.Items).HasForeignKey(x => x.SourcePath).OnDelete(DeleteBehavior.Cascade);
            builder.HasOne(x => x.Category).WithMany(x => x.Items).HasForeignKey(x => x.CategoryKey).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ContentLocalizationEntity>(builder =>
        {
            builder.ToTable("ContentLocalizations");
            builder.HasKey(x => new { x.SourcePath, x.StableId, x.Language });
            builder.Property(x => x.SourcePath).HasMaxLength(260);
            builder.Property(x => x.StableId).HasMaxLength(160);
            builder.Property(x => x.Language).HasMaxLength(8);
            builder.Property(x => x.PayloadJson).IsRequired();
            builder.HasIndex(x => x.Language);
            builder.HasOne(x => x.Item).WithMany(x => x.Localizations).HasForeignKey(x => new { x.SourcePath, x.StableId }).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ContentTagEntity>(builder =>
        {
            builder.ToTable("ContentTags");
            builder.HasKey(x => new { x.SourcePath, x.StableId, x.Tag });
            builder.Property(x => x.SourcePath).HasMaxLength(260);
            builder.Property(x => x.StableId).HasMaxLength(160);
            builder.Property(x => x.Tag).HasMaxLength(160);
            builder.HasIndex(x => x.Tag);
            builder.HasOne(x => x.Item).WithMany(x => x.Tags).HasForeignKey(x => new { x.SourcePath, x.StableId }).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ContentRelationshipEntity>(builder =>
        {
            builder.ToTable("ContentRelationships");
            builder.HasKey(x => new { x.SourcePath, x.StableId, x.Kind, x.Ordinal });
            builder.Property(x => x.SourcePath).HasMaxLength(260);
            builder.Property(x => x.StableId).HasMaxLength(160);
            builder.Property(x => x.Kind).HasMaxLength(100);
            builder.Property(x => x.TargetSourcePath).HasMaxLength(260);
            builder.Property(x => x.TargetStableId).HasMaxLength(160);
            builder.HasIndex(x => new { x.TargetSourcePath, x.TargetStableId });
            builder.HasOne(x => x.SourceItem).WithMany().HasForeignKey(x => new { x.SourcePath, x.StableId }).OnDelete(DeleteBehavior.Cascade);
            builder.HasOne(x => x.TargetItem).WithMany().HasForeignKey(x => new { x.TargetSourcePath, x.TargetStableId }).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ContentImportRunEntity>(builder =>
        {
            builder.ToTable("ContentImportRuns");
            builder.HasKey(x => x.Id);
            builder.Property(x => x.SummaryJson).IsRequired();
            builder.HasIndex(x => x.StartedAtUtc);
        });
    }
}
