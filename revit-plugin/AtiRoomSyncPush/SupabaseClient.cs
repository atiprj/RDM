using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;

namespace AtiRoomSyncPush
{
    public class SupabaseClient
    {
        // TODO: sposta in config sicura (file esterno, env o secure store).
        private const string UrlBase = "https://zegdtlkmfgoieuprbruz.supabase.co/rest/v1";
        private const string ApiKey = "sb_publishable_nQ-1woFTpq4ShYWvZJHJZw_2i6yDVDy";

        private readonly HttpClient _http;

        public SupabaseClient()
        {
            _http = new HttpClient();
            _http.DefaultRequestHeaders.Add("apikey", ApiKey);
            _http.DefaultRequestHeaders.Add("Authorization", "Bearer " + ApiKey);
        }

        public List<ProjectDto> GetProjects()
        {
            var endpoint = "/projects?select=id,project_code,project_name&order=project_code";
            return Get<List<ProjectDto>>(endpoint) ?? new List<ProjectDto>();
        }

        public void ResetHandshake(int projectId)
        {
            var endpoint = $"/rooms?project_id=eq.{projectId}";
            Patch(endpoint, new { is_synced = (bool?)null });
        }

        public List<RoomDto> GetRooms(int projectId)
        {
            var endpoint = $"/rooms?project_id=eq.{projectId}&select=id,room_number,room_name_planned,parameters";
            return Get<List<RoomDto>>(endpoint) ?? new List<RoomDto>();
        }

        public List<MappingDto> GetMappings(int projectId)
        {
            var endpoint = $"/parameter_mappings?project_id=eq.{projectId}&select=db_column_name,revit_parameter_name";
            return Get<List<MappingDto>>(endpoint) ?? new List<MappingDto>();
        }

        public void PatchRoomSync(int roomId, double sqm, string currentIso)
        {
            var endpoint = $"/rooms?id=eq.{roomId}";
            var payload = new
            {
                area = Math.Round(sqm, 2),
                is_synced = true,
                last_sync_at = currentIso
            };
            Patch(endpoint, payload);
        }

        private T Get<T>(string endpoint) where T : class
        {
            var req = new HttpRequestMessage(HttpMethod.Get, UrlBase + endpoint);
            var res = _http.SendAsync(req).Result;
            if (!res.IsSuccessStatusCode) return null;
            var content = res.Content.ReadAsStringAsync().Result;
            if (string.IsNullOrWhiteSpace(content)) return null;
            return JsonConvert.DeserializeObject<T>(content);
        }

        private void Patch(string endpoint, object payload)
        {
            var req = new HttpRequestMessage(new HttpMethod("PATCH"), UrlBase + endpoint);
            req.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            req.Headers.Add("Prefer", "return=minimal");
            var res = _http.SendAsync(req).Result;
            res.EnsureSuccessStatusCode();
        }
    }
}

