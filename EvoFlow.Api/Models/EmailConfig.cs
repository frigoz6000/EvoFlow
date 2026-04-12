using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("EmailConfig")]
public class EmailConfig
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string SmtpHost { get; set; } = null!;

    public int SmtpPort { get; set; } = 587;

    public bool UseSsl { get; set; } = true;

    [Required]
    [MaxLength(254)]
    public string Username { get; set; } = null!;

    [Required]
    [MaxLength(500)]
    public string Password { get; set; } = null!;

    [Required]
    [MaxLength(254)]
    public string FromEmail { get; set; } = null!;

    [MaxLength(200)]
    public string? FromName { get; set; }

    public bool IsEnabled { get; set; } = true;

    public DateTime UpdatedUtc { get; set; } = DateTime.UtcNow;
}
