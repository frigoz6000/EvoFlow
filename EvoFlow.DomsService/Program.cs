using EvoFlow.DomsService;
using log4net;
using log4net.Config;

// Configure log4net
var configFile = new FileInfo(Path.Combine(AppContext.BaseDirectory, "log4net.config"));
if (configFile.Exists)
    XmlConfigurator.Configure(configFile);
else
    BasicConfigurator.Configure();

var log = LogManager.GetLogger(typeof(Program));
log.Info("EvoFlow DOMS Service starting up.");

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "EvoFlow DOMS Service";
});

builder.Services.Configure<DomsServiceSettings>(
    builder.Configuration.GetSection("DomsService"));

builder.Services.AddHttpClient("EvoFlowApi", (sp, client) =>
{
    var settings = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<DomsServiceSettings>>().Value;
    client.BaseAddress = new Uri(settings.ApiBaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromMinutes(5);
});

builder.Services.AddHostedService<DomsFileWorker>();

var host = builder.Build();
host.Run();
