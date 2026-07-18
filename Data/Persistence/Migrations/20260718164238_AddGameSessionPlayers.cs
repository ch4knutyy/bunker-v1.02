using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bunker.Data.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGameSessionPlayers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GameSessionPlayers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    GameSessionId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: true),
                    StablePlayerIdSnapshot = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    PlayerNameSnapshot = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    IsHost = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsWinner = table.Column<bool>(type: "INTEGER", nullable: false),
                    WasEliminated = table.Column<bool>(type: "INTEGER", nullable: false),
                    EliminatedAtRound = table.Column<int>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameSessionPlayers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameSessionPlayers_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_GameSessionPlayers_GameSessions_GameSessionId",
                        column: x => x.GameSessionId,
                        principalTable: "GameSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GameSessionPlayers_GameSessionId",
                table: "GameSessionPlayers",
                column: "GameSessionId");

            migrationBuilder.CreateIndex(
                name: "IX_GameSessionPlayers_GameSessionId_StablePlayerIdSnapshot",
                table: "GameSessionPlayers",
                columns: new[] { "GameSessionId", "StablePlayerIdSnapshot" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameSessionPlayers_UserId",
                table: "GameSessionPlayers",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameSessionPlayers");
        }
    }
}
