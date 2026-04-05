# EvoFlow

Fuel analytics platform built with:

- **EvoFlow.Api** — ASP.NET Core Web API (Entity Framework writes, Dapper reads)
- **EvoFlow.Web** — Blazor WebAssembly frontend
- **EvoFlow.React** — React / Vite frontend (alternative UI)

## Database

SQL Server with EvoFlow database schema covering Sites, Vehicles, Fuel Records, Pump Devices, Pump Monitoring, and Totals.

## Getting Started

```bash
# Restore and build
dotnet restore
dotnet build

# Run the API
cd EvoFlow.Api
dotnet run

# Run Blazor frontend
cd EvoFlow.Web
dotnet run
```
