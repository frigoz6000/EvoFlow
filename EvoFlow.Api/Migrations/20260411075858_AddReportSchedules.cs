using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EvoFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReportSchedules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReportSchedules",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ReportType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    RecurrencePattern = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    DaysOfWeek = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    DayOfMonth = table.Column<int>(type: "int", nullable: true),
                    TimeOfDay = table.Column<TimeOnly>(type: "time", nullable: false),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReportSchedules", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ReportScheduleRecipients",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ReportScheduleId = table.Column<int>(type: "int", nullable: false),
                    EmailRecipientId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReportScheduleRecipients", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReportScheduleRecipients_EmailRecipients_EmailRecipientId",
                        column: x => x.EmailRecipientId,
                        principalTable: "EmailRecipients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReportScheduleRecipients_ReportSchedules_ReportScheduleId",
                        column: x => x.ReportScheduleId,
                        principalTable: "ReportSchedules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReportScheduleRecipients_EmailRecipientId",
                table: "ReportScheduleRecipients",
                column: "EmailRecipientId");

            migrationBuilder.CreateIndex(
                name: "IX_ReportScheduleRecipients_ReportScheduleId_EmailRecipientId",
                table: "ReportScheduleRecipients",
                columns: new[] { "ReportScheduleId", "EmailRecipientId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReportScheduleRecipients");

            migrationBuilder.DropTable(
                name: "ReportSchedules");
        }
    }
}
