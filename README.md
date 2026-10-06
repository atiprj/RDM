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

