using Microsoft.Data.SqlClient;
using System.Data;

namespace EvoFlow.Api.Data;

public interface IDapperConnectionFactory
{
    IDbConnection CreateConnection();
}

public class DapperConnectionFactory(IConfiguration configuration) : IDapperConnectionFactory
{
    private readonly string _connectionString = configuration.GetConnectionString("EvoFlow")
        ?? throw new InvalidOperationException("Connection string 'EvoFlow' not found.");

    public IDbConnection CreateConnection() => new SqlConnection(_connectionString);
}
