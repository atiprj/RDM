# AtiRoomSyncPush (Revit C# Plugin Scaffold)

Questo scaffold replica la logica del tuo script pyRevit `Push.pushbutton/script.py`:

- legge `projects` da Supabase REST
- resetta handshake (`is_synced = null`) per il progetto selezionato
- scarica `rooms` + `parameter_mappings`
- matcha le stanze per `ROOM_NUMBER`
- aggiorna in Revit:
  - `ROOM_NAME` con `room_name_planned`
  - parametri mappati (`revit_parameter_name`) da `rooms.parameters[db_column_name]`
  - parametro `DB_Last_Sync` (creato alla prima sync)
- aggiorna su Supabase:
  - `area`
  - `is_synced = true`
  - `last_sync_at = now`

## Configurazione

Imposta queste costanti in `SupabaseClient.cs`:

- `UrlBase` (es: `https://<project>.supabase.co/rest/v1`)
- `ApiKey` (anon key)

## File principali

- `PushSyncCommand.cs`: comando Revit
- `SupabaseClient.cs`: REST client Supabase
- `Models.cs`: DTO base
- `SharedParameterHelper.cs`: creazione/lookup parametro `DB_Last_Sync`

## Nota

Questo è uno scaffold pronto a essere integrato nel tuo add-in Revit.
Adatta namespace, registrazione comando (AddIn manifest) e UI di selezione progetto alla tua toolbar.

