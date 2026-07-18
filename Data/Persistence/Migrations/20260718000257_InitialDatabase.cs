using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bunker.Data.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialDatabase : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GameSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    RoomCode = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    EndedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Status = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    PlayerCount = table.Column<int>(type: "INTEGER", nullable: false),
                    ApocalypseId = table.Column<string>(type: "TEXT", maxLength: 128, nullable: true),
                    BunkerId = table.Column<string>(type: "TEXT", maxLength: 128, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameSessions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GameSessions_CreatedAtUtc",
                table: "GameSessions",
                column: "CreatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_GameSessions_RoomCode",
                table: "GameSessions",
                column: "RoomCode");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameSessions");
        }
    }
}
