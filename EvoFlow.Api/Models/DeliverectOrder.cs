using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace EvoFlow.Api.Models;

[Table("DeliverectOrders")]
public class DeliverectOrder
{
    [Key]
    [MaxLength(50)]
    public string OrderId { get; set; } = null!;

    [MaxLength(20)]
    public string SiteId { get; set; } = null!;

    public DateOnly OrderDate { get; set; }

    public DateTime OrderReceivedAtSiteDateTime { get; set; }

    public DateTime? OrderPickedDateTime { get; set; }

    public DateTime? OrderReadyForCollectionDateTime { get; set; }

    public DateTime? OrderCollectedDateTime { get; set; }

    public DateTime TransactionDateTime { get; set; }

    [MaxLength(20)]
    public string WorkStationId { get; set; } = null!;

    [MaxLength(50)]
    public string TransactionNumber { get; set; } = null!;
}
