using System;
using System.Reflection;
using Autodesk.Revit.UI;

namespace AtiRoomSyncPush
{
    public class App : IExternalApplication
    {
        public Result OnStartup(UIControlledApplication application)
        {
            const string tabName = "ATI";
            const string panelName = "Room Sync";

            try
            {
                application.CreateRibbonTab(tabName);
            }
            catch
            {
                // Tab gia esistente
            }

            RibbonPanel panel = null;
            foreach (var p in application.GetRibbonPanels(tabName))
            {
                if (string.Equals(p.Name, panelName, StringComparison.OrdinalIgnoreCase))
                {
                    panel = p;
                    break;
                }
            }
            panel = panel ?? application.CreateRibbonPanel(tabName, panelName);

            var assemblyPath = Assembly.GetExecutingAssembly().Location;
            var buttonData = new PushButtonData(
                "AtiRoomSyncPushButton",
                "Sync Rooms",
                assemblyPath,
                "AtiRoomSyncPush.PushSyncCommand"
            );

            panel.AddItem(buttonData);
            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            return Result.Succeeded;
        }
    }
}

