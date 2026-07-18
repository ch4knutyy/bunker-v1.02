using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bunker.Data.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRoomRecoverySnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RoomRecoverySnapshots",
                columns: table => new
                {
                    RoomCode = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    SchemaVersion = table.Column<int>(type: "INTEGER", nullable: false),
                    Revision = table.Column<long>(type: "INTEGER", nullable: false),
                    RoomState = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    StateJson = table.Column<string>(type: "TEXT", nullable: false),
                    Fingerprint = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    GameSessionId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoomRecoverySnapshots", x => x.RoomCode);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RoomRecoverySnapshots_ExpiresAtUtc",
                table: "RoomRecoverySnapshots",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_RoomRecoverySnapshots_RoomState",
                table: "RoomRecoverySnapshots",
                column: "RoomState");

            migrationBuilder.CreateIndex(
                name: "IX_RoomRecoverySnapshots_UpdatedAtUtc",
                table: "RoomRecoverySnapshots",
                column: "UpdatedAtUtc");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RoomRecoverySnapshots");
        }
    }
}
