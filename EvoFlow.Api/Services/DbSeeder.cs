using EvoFlow.Api.Data;
using EvoFlow.Api.Models;

namespace EvoFlow.Api.Services;

public static class DbSeeder
{
    public static void SeedUsers(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EvoFlowDbContext>();

        if (!db.Users.Any())
        {
            db.Users.Add(new User
            {
                Username = "Rory",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword("Ozzie"),
                CreatedAt = DateTime.UtcNow
            });
            db.SaveChanges();
        }
    }
}
