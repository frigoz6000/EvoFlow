using EvoFlow.Api.Data;
using EvoFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/auth")]
[AllowAnonymous]
public class AuthController(EvoFlowDbContext db, JwtService jwtService) : ControllerBase
{
    public record LoginRequest(string Username, string Password);
    public record LoginResponse(string Token, string Username);

    [HttpPost("login")]
    public IActionResult Login([FromBody] LoginRequest request)
    {
        var user = db.Users.FirstOrDefault(u => u.Username == request.Username);
        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid username or password." });

        var token = jwtService.GenerateToken(user);
        return Ok(new LoginResponse(token, user.Username));
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        // JWT is stateless — logout is handled client-side by discarding the token
        return Ok(new { message = "Logged out." });
    }
}
