using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.UI;
using SWF = System.Windows.Forms;

namespace AtiRoomSyncPush
{
    [Transaction(TransactionMode.Manual)]
    public class PushSyncCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            var uiapp = commandData.Application;
            var uidoc = uiapp.ActiveUIDocument;
            var doc = uidoc.Document;

            var allRooms = new FilteredElementCollector(doc)
                .OfCategory(BuiltInCategory.OST_Rooms)
                .WhereElementIsNotElementType()
                .Cast<SpatialElement>()
                .OfType<Room>()
                .ToList();

            if (!allRooms.Any())
            {
                TaskDialog.Show("Sync", "Nessun locale trovato nel modello.");
                return Result.Cancelled;
            }

            SharedParameterHelper.EnsureSyncParameter(doc);
            var supa = new SupabaseClient();

            var projects = supa.GetProjects();
            if (!projects.Any())
            {
                TaskDialog.Show("Sync", "Impossibile recuperare progetti da Supabase.");
                return Result.Failed;
            }

            var selected = SelectProject(projects);
            if (selected == null)
            {
                return Result.Cancelled;
            }
            var projectId = selected.Id;

            // 1) Reset handshake
            supa.ResetHandshake(projectId);

            // 2) Download data
            var dbRooms = supa.GetRooms(projectId);
            var mappings = supa.GetMappings(projectId);

            var currentIso = DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss");
            var displayTs = $"{DateTime.Now:dd/MM/yyyy HH:mm} - {uiapp.Application.Username}";
            var updated = 0;
            var noMatch = 0;

            using (var tx = new Transaction(doc, "BIM Sync Handshake"))
            {
                tx.Start();

                foreach (var r in allRooms)
                {
                    var roomNumber = r.get_Parameter(BuiltInParameter.ROOM_NUMBER)?.AsString();
                    if (string.IsNullOrWhiteSpace(roomNumber))
                        continue;

                    var match = dbRooms.FirstOrDefault(x => string.Equals(x.RoomNumber, roomNumber, StringComparison.Ordinal));
                    if (match == null)
                    {
                        noMatch++;
                        continue;
                    }

                    try
                    {
                        // Pull: DB -> Revit
                        var roomNameParam = r.get_Parameter(BuiltInParameter.ROOM_NAME);
                        if (roomNameParam != null && !roomNameParam.IsReadOnly)
                            roomNameParam.Set(match.RoomNamePlanned ?? string.Empty);

                        var jsonParams = match.Parameters ?? new Dictionary<string, object>();
                        foreach (var m in mappings)
                        {
                            if (!jsonParams.ContainsKey(m.DbColumnName))
                                continue;
                            var v = jsonParams[m.DbColumnName];
                            var p = r.LookupParameter(m.RevitParameterName);
                            if (p != null && !p.IsReadOnly && v != null)
                                p.Set(Convert.ToString(v));
                        }

                        // Push: area + sync flag
                        var pArea = r.get_Parameter(BuiltInParameter.ROOM_AREA);
                        var sqm = GetSqmValue(pArea);
                        supa.PatchRoomSync(match.Id, sqm, currentIso);

                        // Timestamp in Revit
                        var ts = r.LookupParameter(SharedParameterHelper.TimestampParamName);
                        if (ts != null && !ts.IsReadOnly)
                            ts.Set(displayTs);

                        updated++;
                    }
                    catch
                    {
                        // Continua con la stanza successiva
                    }
                }

                tx.Commit();
            }

            TaskDialog.Show(
                "Sync",
                $"Progetto: {selected.ProjectCode} - {selected.ProjectName}\n" +
                $"Locali Revit: {allRooms.Count}\n" +
                $"Locali DB: {dbRooms.Count}\n" +
                $"Locali validati: {updated}\n" +
                $"Senza match: {noMatch}"
            );
            return Result.Succeeded;
        }

        private static double GetSqmValue(Parameter areaParam)
        {
            if (areaParam == null) return 0.0;
            var val = areaParam.AsDouble();
            return UnitUtils.ConvertFromInternalUnits(val, UnitTypeId.SquareMeters);
        }

        private static ProjectDto SelectProject(List<ProjectDto> projects)
        {
            using (var form = new SWF.Form())
            using (var combo = new SWF.ComboBox())
            using (var ok = new SWF.Button())
            using (var cancel = new SWF.Button())
            {
                form.Text = "Seleziona progetto";
                form.Width = 520;
                form.Height = 150;
                form.FormBorderStyle = SWF.FormBorderStyle.FixedDialog;
                form.StartPosition = SWF.FormStartPosition.CenterScreen;
                form.MinimizeBox = false;
                form.MaximizeBox = false;

                combo.Left = 12;
                combo.Top = 12;
                combo.Width = 480;
                combo.DropDownStyle = SWF.ComboBoxStyle.DropDownList;
                combo.DataSource = projects;
                combo.DisplayMember = "ProjectCode";
                combo.Format += (s, e) =>
                {
                    var p = e.ListItem as ProjectDto;
                    if (p != null) e.Value = $"{p.ProjectCode} - {p.ProjectName}";
                };

                ok.Text = "OK";
                ok.Left = 336;
                ok.Top = 50;
                ok.Width = 75;
                ok.DialogResult = SWF.DialogResult.OK;

                cancel.Text = "Cancel";
                cancel.Left = 417;
                cancel.Top = 50;
                cancel.Width = 75;
                cancel.DialogResult = SWF.DialogResult.Cancel;

                form.Controls.Add(combo);
                form.Controls.Add(ok);
                form.Controls.Add(cancel);
                form.AcceptButton = ok;
                form.CancelButton = cancel;

                var result = form.ShowDialog();
                if (result != SWF.DialogResult.OK) return null;
                return combo.SelectedItem as ProjectDto;
            }
        }
    }
}

