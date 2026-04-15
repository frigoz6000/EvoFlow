namespace EvoFlow.DomsService;

public class DomsServiceSettings
{
    public string WatchFolder { get; set; } = @"C:\tlm\EvoFlow\DomsFiles";
    public string SuccessFolder { get; set; } = @"C:\tlm\EvoFlow\DomsFiles\Success";
    public string FailureFolder { get; set; } = @"C:\tlm\EvoFlow\DomsFiles\Failure";
    public string ApiBaseUrl { get; set; } = "http://localhost:5019";
    public int RetryCount { get; set; } = 2;
    public int RetryDelaySeconds { get; set; } = 10;
}
