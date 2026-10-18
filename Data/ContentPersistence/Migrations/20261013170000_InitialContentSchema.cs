using System;
using Bunker.Data.ContentPersistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bunker.Data.ContentPersistence.Migrations;

[DbContext(typeof(ContentDbContext))]
[Migration("20261013170000_InitialContentSchema")]
public partial class InitialContentSchema : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "ContentCategories",
            columns: table => new
            {
                Key = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                SourceDescription = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_ContentCategories", x => x.Key));

        migrationBuilder.CreateTable(
            name: "ContentDocuments",
            columns: table => new
            {
                SourcePath = table.Column<string>(type: "TEXT", maxLength: 260, nullable: false),
                Fingerprint = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                RawJson = table.Column<string>(type: "TEXT", nullable: false),
                ImportedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_ContentDocuments", x => x.SourcePath));

        migrationBuilder.CreateTable(
            name: "ContentImportRuns",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "TEXT", nullable: false),
                StartedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                FinishedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                DocumentCount = table.Column<int>(type: "INTEGER", nullable: false),
                ItemCount = table.Column<int>(type: "INTEGER", nullable: false),
                MissingTranslationCount = table.Column<int>(type: "INTEGER", nullable: false),
                SummaryJson = table.Column<string>(type: "TEXT", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_ContentImportRuns", x => x.Id));

        migrationBuilder.CreateTable(
            name: "ContentItems",
            columns: table => new
            {
                SourcePath = table.Column<string>(type: "TEXT", maxLength: 260, nullable: false),
                StableId = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                CategoryKey = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                DisplayName = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                PayloadJson = table.Column<string>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_ContentItems", x => new { x.SourcePath, x.StableId });
                table.ForeignKey("FK_ContentItems_ContentCategories_CategoryKey", x => x.CategoryKey, "ContentCategories", "Key", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_ContentItems_ContentDocuments_SourcePath", x => x.SourcePath, "ContentDocuments", "SourcePath", onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "ContentLocalizations",
            columns: table => new
            {
                SourcePath = table.Column<string>(type: "TEXT", maxLength: 260, nullable: false),
                StableId = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                Language = table.Column<string>(type: "TEXT", maxLength: 8, nullable: false),
                PayloadJson = table.Column<string>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_ContentLocalizations", x => new { x.SourcePath, x.StableId, x.Language });
                table.ForeignKey("FK_ContentLocalizations_ContentItems_SourcePath_StableId", x => new { x.SourcePath, x.StableId }, "ContentItems", new[] { "SourcePath", "StableId" }, onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "ContentTags",
            columns: table => new
            {
                SourcePath = table.Column<string>(type: "TEXT", maxLength: 260, nullable: false),
                StableId = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                Tag = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_ContentTags", x => new { x.SourcePath, x.StableId, x.Tag });
                table.ForeignKey("FK_ContentTags_ContentItems_SourcePath_StableId", x => new { x.SourcePath, x.StableId }, "ContentItems", new[] { "SourcePath", "StableId" }, onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "ContentRelationships",
            columns: table => new
            {
                SourcePath = table.Column<string>(type: "TEXT", maxLength: 260, nullable: false),
                StableId = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                Kind = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                Ordinal = table.Column<int>(type: "INTEGER", nullable: false),
                TargetSourcePath = table.Column<string>(type: "TEXT", maxLength: 260, nullable: false),
                TargetStableId = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_ContentRelationships", x => new { x.SourcePath, x.StableId, x.Kind, x.Ordinal });
                table.ForeignKey("FK_ContentRelationships_ContentItems_SourcePath_StableId", x => new { x.SourcePath, x.StableId }, "ContentItems", new[] { "SourcePath", "StableId" }, onDelete: ReferentialAction.Cascade);
                table.ForeignKey("FK_ContentRelationships_ContentItems_TargetSourcePath_TargetStableId", x => new { x.TargetSourcePath, x.TargetStableId }, "ContentItems", new[] { "SourcePath", "StableId" }, onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(name: "IX_ContentDocuments_Fingerprint", table: "ContentDocuments", column: "Fingerprint");
        migrationBuilder.CreateIndex(name: "IX_ContentImportRuns_StartedAtUtc", table: "ContentImportRuns", column: "StartedAtUtc");
        migrationBuilder.CreateIndex(name: "IX_ContentItems_CategoryKey_DisplayName", table: "ContentItems", columns: new[] { "CategoryKey", "DisplayName" });
        migrationBuilder.CreateIndex(name: "IX_ContentItems_CategoryKey_StableId", table: "ContentItems", columns: new[] { "CategoryKey", "StableId" }, unique: true);
        migrationBuilder.CreateIndex(name: "IX_ContentLocalizations_Language", table: "ContentLocalizations", column: "Language");
        migrationBuilder.CreateIndex(name: "IX_ContentRelationships_TargetSourcePath_TargetStableId", table: "ContentRelationships", columns: new[] { "TargetSourcePath", "TargetStableId" });
        migrationBuilder.CreateIndex(name: "IX_ContentTags_Tag", table: "ContentTags", column: "Tag");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "ContentLocalizations");
        migrationBuilder.DropTable(name: "ContentRelationships");
        migrationBuilder.DropTable(name: "ContentTags");
        migrationBuilder.DropTable(name: "ContentImportRuns");
        migrationBuilder.DropTable(name: "ContentItems");
        migrationBuilder.DropTable(name: "ContentCategories");
        migrationBuilder.DropTable(name: "ContentDocuments");
    }
}
