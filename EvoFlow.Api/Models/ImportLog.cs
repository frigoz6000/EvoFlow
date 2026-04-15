namespace EvoFlow.Api.Models;

public class ImportLog
{
    public int Id { get; set; }
    public string FileName { get; set; } = "";
    public string Status { get; set; } = "";
    public string? Message { get; set; }
    public DateTime ImportedAtUtc { get; set; }
}
