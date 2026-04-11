using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("EmailRecipients")]
public class EmailRecipient
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(254)]
    public string Email { get; set; } = null!;

    [MaxLength(200)]
    public string? Name { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}
