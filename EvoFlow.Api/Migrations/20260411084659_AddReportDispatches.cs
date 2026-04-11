using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EvoFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReportDispatches : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReportDispatches",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ReportScheduleId = table.Column<int>(type: "int", nullable: false),
                    DispatchedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Recipients = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReportDispatches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReportDispatches_ReportSchedules_ReportScheduleId",
                        column: x => x.ReportScheduleId,
                        principalTable: "ReportSchedules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReportDispatches_ReportScheduleId",
                table: "ReportDispatches",
                column: "ReportScheduleId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReportDispatches");
        }
    }
}
