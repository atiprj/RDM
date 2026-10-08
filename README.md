# RoomDataManagementVercel

Porting dell'app Streamlit verso Vercel usando **Next.js (App Router)** + **Supabase**.

## Setup

1) Copia `.env.example` in `.env.local` e compila:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (solo se ti serve nel client; per ora usiamo l'admin server-side)
- `SUPABASE_SERVICE_ROLE_KEY` (serve alle API Route per leggere `user_permissions`)
- `SESSION_SECRET` (min 32 caratteri casuali, firma il cookie di sessione). Generalo con:
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

2) Installa dipendenze ed avvia:

```bash
npm install
npm run dev
```

Apri `http://localhost:3000`.

## Login (replica di Streamlit)

- La route `POST /api/login` verifica l'email su Supabase nella tabella `user_permissions`.
- Se autorizzato, salva un cookie httpOnly `user_email` firmato con HMAC (`SESSION_SECRET`):
  30 giorni con “Ricordami”, altrimenti fino alla chiusura del browser.
- `GET /api/me` rilegge il cookie, ne verifica la firma e valida l'utente.

## Controllo accessi API

Tutte le API Route passano da `src/lib/auth.ts`:

- `requireUser()` – cookie firmato valido + utente in `user_permissions`, altrimenti 401.
- `requireProjectAccess(projectId)` – come sopra + progetto in `allowed_projects`
  (super admin e project admin vedono tutto), altrimenti 403.
- `requireAdmin()` – super admin o project admin.

Rooms, items e mappings (lettura, scrittura, import, export, cancellazione) richiedono
`projectId` e operano solo su quel progetto. Le cancellazioni per `id` sono limitate al progetto.

## Deploy su Vercel

- Importa la repository su Vercel.
- Imposta le variabili ambiente come in `.env.example`.

## Ruoli utenti (Super Admin / Project Admin)

- Applica lo script SQL `docs/supabase-user-roles.sql` in Supabase SQL Editor.
- Nuovi campi in `user_permissions`:
  - `is_super_admin` (controllo totale)
  - `is_project_admin` (gestione utenti/progetti, ma non super admin)
- Compatibilita mantenuta con `is_admin` legacy.


## Geometrie 3D dei locali (Room Inspector)

- Eseguire una volta `docs/supabase-room-geometry.sql` nel SQL Editor di Supabase: crea `api_tokens`,
  `room_geometries` e il bucket privato `room-geometry`.
- **Tipo SR:** in *Mappings* aggiungere la colonna `SR_Code` collegata al parametro Revit del progetto
  che contiene il tipo di standard room. Il valore sta in `rooms.parameters.SR_Code`.
- **Main:** parametro Revit `SR_Main` sul locale (oppure mappato con la colonna `SR_Main`): se ha un valore,
  quel locale è la geometria di riferimento del suo tipo SR. Una sola Main per tipo SR e progetto.
- **Token Revit:** ogni utente genera il proprio token nella pagina *Token Revit*; solo i super admin
  possono eliminarli. Il plugin lo invia come `Authorization: Bearer rdm_...`.
- **API plugin:** `GET /api/revit/context`, `POST /api/revit/room-geometry/upload-url` (signed upload URL
  verso Supabase Storage), `POST /api/revit/room-geometry/commit`.
- **Viewer:** selezionando un locale si vede la Main del suo tipo SR; *Compare* affianca un altro locale dello
  stesso tipo con camera sincronizzata e confronto dell'inventario (attrezzature e arredi).

## Direzione dei parametri mappati (Sinc Locali)

Eseguire una volta `docs/supabase-mapping-direction.sql`. In *Mappings* ogni parametro ha una direzione:

- **Web → Revit** (default): Sinc Locali scrive in Revit il valore del sito.
- **Revit → Web**: Sinc Locali legge il parametro Revit e aggiorna `rooms.parameters` sul sito
  (un valore vuoto in Revit svuota il campo). Tipico per `SR_Code` quando il tipo SR è compilato nel modello.

Nell'import Excel la colonna opzionale `direction` accetta `web_to_revit` / `revit_to_web`;
se manca, la direzione già salvata non cambia.
