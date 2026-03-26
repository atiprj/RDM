# RoomDataManagementVercel

Porting dell'app Streamlit verso Vercel usando **Next.js (App Router)** + **Supabase**.

## Setup

1) Copia `.env.example` in `.env.local` e compila:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (solo se ti serve nel client; per ora usiamo l'admin server-side)
- `SUPABASE_SERVICE_ROLE_KEY` (serve alle API Route per leggere `user_permissions`)

2) Installa dipendenze ed avvia:

```bash
npm install
npm run dev
```

Apri `http://localhost:3000`.

## Login (replica di Streamlit)

- La route `POST /api/login` verifica l'email su Supabase nella tabella `user_permissions`.
- Se autorizzato, salva un cookie httpOnly `user_email` (30 giorni se “Ricordami”).
- `GET /api/me` rilegge il cookie e valida l'utente.

## Deploy su Vercel

- Importa la repository su Vercel.
- Imposta le variabili ambiente come in `.env.example`.

