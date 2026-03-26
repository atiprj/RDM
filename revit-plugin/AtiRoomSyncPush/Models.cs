using System.Collections.Generic;
using Newtonsoft.Json;

namespace AtiRoomSyncPush
{
    public class ProjectDto
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("project_code")]
        public string ProjectCode { get; set; }

        [JsonProperty("project_name")]
        public string ProjectName { get; set; }
    }

    public class MappingDto
    {
        [JsonProperty("db_column_name")]
        public string DbColumnName { get; set; }

        [JsonProperty("revit_parameter_name")]
        public string RevitParameterName { get; set; }
    }

    public class RoomDto
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("room_number")]
        public string RoomNumber { get; set; }

        [JsonProperty("room_name_planned")]
        public string RoomNamePlanned { get; set; }

        [JsonProperty("parameters")]
        public Dictionary<string, object> Parameters { get; set; }
    }
}

