using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bunker.Data.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGameSessionParticipantLeftAtUtc : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "LeftAtUtc",
                table: "GameSessionPlayers",
                type: "TEXT",
                nullable: true);

			// One-time repair for sessions orphaned by processes that predate lifecycle cleanup.
			// History rows are preserved; only their terminal status and end timestamp change.
			migrationBuilder.Sql(
				"""
				UPDATE GameSessions
				SET Status = 'Abandoned',
					EndedAtUtc = COALESCE(EndedAtUtc, CURRENT_TIMESTAMP)
				WHERE Status = 'Started';
				""");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LeftAtUtc",
                table: "GameSessionPlayers");
        }
    }
}
