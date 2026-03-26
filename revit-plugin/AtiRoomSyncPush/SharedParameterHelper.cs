using System;
using System.IO;
using Autodesk.Revit.DB;

namespace AtiRoomSyncPush
{
    public static class SharedParameterHelper
    {
        public const string TimestampParamName = "DB_Last_Sync";

        public static bool EnsureSyncParameter(Document doc)
        {
            var sample = new FilteredElementCollector(doc)
                .OfCategory(BuiltInCategory.OST_Rooms)
                .WhereElementIsNotElementType()
                .FirstElement();

            if (sample != null && sample.LookupParameter(TimestampParamName) != null)
                return true;

            var app = doc.Application;
            var tempFile = Path.Combine(Path.GetTempPath(), "shared_params_sync_temp.txt");
            File.WriteAllText(tempFile, string.Empty);
            var oldPath = app.SharedParametersFilename;
            app.SharedParametersFilename = tempFile;

            try
            {
                using (var t = new Transaction(doc, "Ensure DB_Last_Sync parameter"))
                {
                    t.Start();
                    var file = app.OpenSharedParameterFile();
                    if (file == null) return false;

                    var group = file.Groups.get_Item("BIM_SYNC") ?? file.Groups.Create("BIM_SYNC");

#if REVIT2022_OR_GREATER
                    var opt = new ExternalDefinitionCreationOptions(TimestampParamName, SpecTypeId.String.Text);
                    var extDef = group.Definitions.Create(opt);
#else
                    var extDef = group.Definitions.Create(TimestampParamName, ParameterType.Text);
#endif

                    var cats = app.Create.NewCategorySet();
                    cats.Insert(doc.Settings.Categories.get_Item(BuiltInCategory.OST_Rooms));
                    var binding = app.Create.NewInstanceBinding(cats);

#if REVIT2022_OR_GREATER
                    doc.ParameterBindings.Insert(extDef, binding, GroupTypeId.Data);
#else
                    doc.ParameterBindings.Insert(extDef, binding, BuiltInParameterGroup.PG_TEXT);
#endif
                    t.Commit();
                }
                return true;
            }
            catch
            {
                return false;
            }
            finally
            {
                app.SharedParametersFilename = oldPath;
            }
        }
    }
}

