using System.Net;
using System.Net.Mail;
using EvoFlow.Api.Data;
using EvoFlow.Api.Models;

namespace EvoFlow.Api.Services;

public interface IEmailService
{
    Task SendAsync(IEnumerable<string> to, string subject, string body,
        IEnumerable<(byte[] Data, string FileName, string ContentType)>? attachments = null);
    bool IsConfigured { get; }
}

public class EmailService(IConfiguration config, ILogger<EmailService> logger, EvoFlowDbContext db) : IEmailService
{
    private readonly string _host = config["Email:SmtpHost"] ?? "";
    private readonly int _port = int.TryParse(config["Email:SmtpPort"], out var p) ? p : 587;
    private readonly bool _ssl = bool.TryParse(config["Email:EnableSsl"], out var s) ? s : true;
    private readonly string _username = config["Email:Username"] ?? "";
    private readonly string _password = config["Email:Password"] ?? "";
    private readonly string _fromAddress = config["Email:FromAddress"] ?? "";
    private readonly string _fromName = config["Email:FromName"] ?? "EvoFlow";

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_host)
        && !string.IsNullOrWhiteSpace(_username)
        && !string.IsNullOrWhiteSpace(_fromAddress);

    public async Task SendAsync(IEnumerable<string> to, string subject, string body,
        IEnumerable<(byte[] Data, string FileName, string ContentType)>? attachments = null)
    {
        var toList = to.ToList();
        var recipientsCsv = string.Join(", ", toList);

        if (!IsConfigured)
        {
            logger.LogWarning("Email not configured — skipping send. Set Email:SmtpHost, Email:Username, Email:Password, Email:FromAddress in appsettings.");
            return;
        }

        using var smtp = new SmtpClient(_host, _port)
        {
            EnableSsl = _ssl,
            Credentials = new NetworkCredential(_username, _password),
            DeliveryMethod = SmtpDeliveryMethod.Network,
        };

        using var message = new MailMessage
        {
            From = new MailAddress(_fromAddress, _fromName),
            Subject = subject,
            Body = body,
            IsBodyHtml = true,
        };

        foreach (var addr in toList)
            message.To.Add(addr);

        var streams = new List<MemoryStream>();
        if (attachments != null)
        {
            foreach (var (data, fileName, contentType) in attachments)
            {
                var ms = new MemoryStream(data);
                streams.Add(ms);
                message.Attachments.Add(new Attachment(ms, fileName, contentType));
            }
        }

        try
        {
            logger.LogInformation("Sending email: subject={Subject} to={To} attachments={Count}",
                subject, recipientsCsv, message.Attachments.Count);
            await smtp.SendMailAsync(message);
            logger.LogInformation("Email sent successfully.");

            db.EmailLogs.Add(new EmailLog
            {
                SentAtUtc = DateTime.UtcNow,
                Recipients = recipientsCsv,
                Subject = subject,
                Status = "Sent",
            });
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send email to {To}", recipientsCsv);

            db.EmailLogs.Add(new EmailLog
            {
                SentAtUtc = DateTime.UtcNow,
                Recipients = recipientsCsv,
                Subject = subject,
                Status = "Failed",
                ErrorMessage = ex.Message,
            });
            await db.SaveChangesAsync();

            throw;
        }
        finally
        {
            foreach (var s in streams) s.Dispose();
        }
    }
}
