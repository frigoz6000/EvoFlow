using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("EmailLog")]
public class EmailLog
{
    [Key]
    public int Id { get; set; }

    public DateTime SentAtUtc { get; set; } = DateTime.UtcNow;

    [Required]
    [MaxLength(2000)]
    public string Recipients { get; set; } = null!;

    [Required]
    [MaxLength(500)]
    public string Subject { get; set; } = null!;

    /// <summary>Sent | Failed</summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = null!;

    [MaxLength(1000)]
    public string? ErrorMessage { get; set; }
}
