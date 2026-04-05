using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;

namespace EvoFlow.Api.Controllers;

[ApiController]
[Route("api/git")]
public class GitController : ControllerBase
{
    private readonly ILogger<GitController> _logger;

    public GitController(ILogger<GitController> logger)
    {
        _logger = logger;
    }

    [HttpPost("push")]
    public async Task<IActionResult> PushToGitHub()
    {
        try
        {
            var repoPath = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), ".."));

            var addResult = await RunGit("add -A", repoPath);
            _logger.LogInformation("git add: {Output}", addResult);

            var commitResult = await RunGit($"commit -m \"Manual push from EvoFlow dashboard\" --allow-empty", repoPath);
            _logger.LogInformation("git commit: {Output}", commitResult);

            var pushResult = await RunGit("push", repoPath);
            _logger.LogInformation("git push: {Output}", pushResult);

            return Ok(new { message = "Successfully pushed to GitHub" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Git push failed");
            return StatusCode(500, new { message = $"Push failed: {ex.Message}" });
        }
    }

    private static async Task<string> RunGit(string args, string workingDir)
    {
        var psi = new ProcessStartInfo("git", args)
        {
            WorkingDirectory = workingDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var proc = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start git process");
        var stdout = await proc.StandardOutput.ReadToEndAsync();
        var stderr = await proc.StandardError.ReadToEndAsync();
        await proc.WaitForExitAsync();

        if (proc.ExitCode != 0 && !stderr.Contains("nothing to commit") && !stdout.Contains("nothing to commit"))
        {
            var msg = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
            // Commit "nothing to commit" is not an error for us
            if (!msg.Contains("nothing to commit") && !msg.Contains("up to date"))
                throw new InvalidOperationException(msg.Trim());
        }

        return stdout + stderr;
    }
}
