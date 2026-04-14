using Dapper;
using EvoFlow.Api.Data;
using EvoFlow.Api.Services;
using Microsoft.EntityFrameworkCore;

SqlMapper.AddTypeHandler(new TimeOnlyTypeHandler());
SqlMapper.AddTypeHandler(new NullableTimeOnlyTypeHandler());
SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());
SqlMapper.AddTypeHandler(new NullableDateOnlyTypeHandler());

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod());
});

builder.Services.AddDbContext<EvoFlowDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("EvoFlow")));

builder.Services.AddScoped<IDapperConnectionFactory, DapperConnectionFactory>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IExcelReportService, ExcelReportService>();
builder.Services.AddSingleton<GeocodingService>();
builder.Services.AddHostedService<ReportDispatchService>();

var app = builder.Build();

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseHttpsRedirection();
app.MapControllers();
app.MapFallbackToFile("index.html");
app.Run();
