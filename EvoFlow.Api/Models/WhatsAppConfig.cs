using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("WhatsAppConfig")]
public class WhatsAppConfig
{
    [Key]
    public int Id { get; set; }

    /// <summary>Twilio Account SID</summary>
    [MaxLength(100)]
    public string? AccountSid { get; set; }

    /// <summary>Twilio Auth Token</summary>
    [MaxLength(200)]
    public string? AuthToken { get; set; }

    /// <summary>Twilio WhatsApp sender number, e.g. whatsapp:+14155552671</summary>
    [MaxLength(50)]
    public string? FromNumber { get; set; }

    public bool IsEnabled { get; set; } = false;

    public DateTime UpdatedUtc { get; set; } = DateTime.UtcNow;
}
