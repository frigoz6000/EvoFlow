using Dapper;
using System.Data;

namespace EvoFlow.Api.Data;

public class TimeOnlyTypeHandler : SqlMapper.TypeHandler<TimeOnly>
{
    public override TimeOnly Parse(object value) =>
        TimeOnly.FromTimeSpan((TimeSpan)value);

    public override void SetValue(IDbDataParameter parameter, TimeOnly value)
    {
        parameter.DbType = DbType.Time;
        parameter.Value = value.ToTimeSpan();
    }
}

public class NullableTimeOnlyTypeHandler : SqlMapper.TypeHandler<TimeOnly?>
{
    public override TimeOnly? Parse(object value) =>
        value is TimeSpan ts ? TimeOnly.FromTimeSpan(ts) : null;

    public override void SetValue(IDbDataParameter parameter, TimeOnly? value)
    {
        parameter.DbType = DbType.Time;
        parameter.Value = value.HasValue ? (object)value.Value.ToTimeSpan() : DBNull.Value;
    }
}
