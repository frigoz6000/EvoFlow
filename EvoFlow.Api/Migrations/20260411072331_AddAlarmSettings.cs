using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace EvoFlow.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAlarmSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AlarmTypes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Category = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlarmTypes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AlarmSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AlarmTypeId = table.Column<int>(type: "int", nullable: false),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlarmSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AlarmSettings_AlarmTypes_AlarmTypeId",
                        column: x => x.AlarmTypeId,
                        principalTable: "AlarmTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AlarmSettingRecipients",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AlarmSettingId = table.Column<int>(type: "int", nullable: false),
                    EmailRecipientId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlarmSettingRecipients", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AlarmSettingRecipients_AlarmSettings_AlarmSettingId",
                        column: x => x.AlarmSettingId,
                        principalTable: "AlarmSettings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AlarmSettingRecipients_EmailRecipients_EmailRecipientId",
                        column: x => x.EmailRecipientId,
                        principalTable: "EmailRecipients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "AlarmTypes",
                columns: new[] { "Id", "Category", "Description", "Name" },
                values: new object[,]
                {
                    { 1, "Tank", "Tank fuel level has dropped below the low threshold.", "Low Tank Level" },
                    { 2, "Tank", "Tank fuel level is critically low.", "Very Low Tank Level" },
                    { 3, "Tank", "Tank level has exceeded the maximum safe capacity.", "Tank Overfill" },
                    { 4, "Tank", "Water detected in the tank above the acceptable threshold.", "High Water Level in Tank" },
                    { 5, "Tank", "Tank temperature exceeds safe operating limit.", "High Temperature in Tank" },
                    { 6, "Tank", "Tank temperature is low enough to risk freezing.", "Low Temperature / Freeze Risk" },
                    { 7, "Tank", "Sensor indicates a possible fuel leak in the tank.", "Tank Leak Detected" },
                    { 8, "Tank", "Liquid detected in the sump below the tank.", "Sump Alarm" },
                    { 9, "Delivery", "A fuel delivery has started at the site.", "Delivery In Progress" },
                    { 10, "Delivery", "A fuel delivery has finished successfully.", "Delivery Complete" },
                    { 11, "Delivery", "Delivered volume does not match the expected amount.", "Delivery Volume Discrepancy" },
                    { 12, "Pump", "A pump has gone offline and is not responding.", "Pump Offline" },
                    { 13, "Pump", "A pump is reporting a fault condition.", "Pump Fault" },
                    { 14, "Pump", "Pump flow rate has dropped below the expected minimum.", "Low Flow Rate" },
                    { 15, "Pump", "Pump flow rate exceeds the safe maximum.", "High Flow Rate" },
                    { 16, "Pump", "The pump meter is due for calibration.", "Pump Meter Calibration Due" },
                    { 17, "Equipment", "The card reader on a pump is not functioning correctly.", "Card Reader Fault" },
                    { 18, "Equipment", "The vapour recovery system is reporting a fault.", "Vapour Recovery Fault" },
                    { 19, "Safety", "An emergency stop button has been triggered at the site.", "Emergency Stop Activated" },
                    { 20, "Safety", "An access attempt outside permitted hours or credentials was detected.", "Unauthorised Access Attempt" },
                    { 21, "Connectivity", "The site has lost communication with the central system.", "Site Offline" },
                    { 22, "Connectivity", "Transaction or telemetry data has failed to sync.", "Data Sync Failure" },
                    { 23, "Reporting", "Total dispensed volume for the day has exceeded the configured threshold.", "Daily Volume Threshold Exceeded" },
                    { 24, "Reporting", "Pump price does not match the expected price in the system.", "Price Discrepancy Alert" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_AlarmSettingRecipients_AlarmSettingId_EmailRecipientId",
                table: "AlarmSettingRecipients",
                columns: new[] { "AlarmSettingId", "EmailRecipientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AlarmSettingRecipients_EmailRecipientId",
                table: "AlarmSettingRecipients",
                column: "EmailRecipientId");

            migrationBuilder.CreateIndex(
                name: "IX_AlarmSettings_AlarmTypeId",
                table: "AlarmSettings",
                column: "AlarmTypeId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AlarmSettingRecipients");

            migrationBuilder.DropTable(
                name: "AlarmSettings");

            migrationBuilder.DropTable(
                name: "AlarmTypes");
        }
    }
}
