# Sandbox setup – Loaded Out

Notes for running Loaded Out in an isolated test environment that has no internet while the app runs.

## What to run

- **Test the web app.** The UI is a React 18 + Vite single-page app in `frontend/`, laid out for a phone (max. 430 px wide). Use a phone- or tablet-sized browser viewport. The same bundle is also wrapped as an Android app with Capacitor (`frontend/android/`), but the native build sends its API calls to the production domain, so it can't reach a local backend. Use the browser.
- **Backend:** FastAPI in `backend/` on port 8000, with PostgreSQL. All user data (accounts, meals, workouts, templates, budget, pantry, schedule, profile) lives on the server. A few things stay in the browser only: personal records, a local copy of workout history, the daily supplement checklist, the "onboarding done" flag and the offline request queue. A fresh browser profile per scenario keeps these clean.
- **Not needed:** MongoDB (it only stores profile pictures) and the MCP server in `mcp/` (it has no screen in the app).

## Run locally

Install dependencies while the sandbox still has internet (pip and npm need it); the app itself runs offline.

1. **PostgreSQL 15 or newer.** Either start the `db` service from `infra/docker-compose.yml` (it defines local-only credentials) or use any local Postgres with an empty database.
   ```bash
   docker compose -f infra/docker-compose.yml up -d db
   ```
2. **Backend**
   ```bash
   cd backend
   python -m venv .venv && . .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env            # then set the variables listed below
   export DATABASE_URL_SYNC=...    # Alembic and the exercise seeder read it from the shell, not from .env
   alembic upgrade head
   python seed_exercises.py
   uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
3. **Frontend**
   ```bash
   cd frontend
   npm install --legacy-peer-deps
   npm run dev                     # serves on port 5173 and proxies /api to port 8000
   ```
   Don't create a frontend `.env` file. With `VITE_API_URL` unset, the app calls the relative `/api/v1`, which the Vite dev server proxies to the backend. In dev mode the PWA service worker is enabled; if a stale bundle shows up, clear the site data.

   **Whatever serves the page must forward `/api/*` to the backend on port 8000.** `npm run dev` does this. If you serve the built `dist/` folder from a plain file server instead, add that forwarding rule (`infra/Caddyfile.staging` is a minimal example); without it every request gets "405 Method Not Allowed" and sign-up shows "Request failed". Quick check: opening `/api/v1/health` on the app's address must return `{"status":"healthy"}`, not the app's page.

## Environment variables

Backend, in `backend/.env` (the template is `backend/.env.example`):

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Async SQLAlchemy URL the app uses (`postgresql+asyncpg://…`). |
| `DATABASE_URL_SYNC` | Sync URL (`postgresql+psycopg2://…`) for Alembic and `seed_exercises.py`. Also export it in the shell for those two. |
| `SECRET_KEY` | Signs the login tokens. Any long random string; the backend logs a warning if it is left at the placeholder. |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins. The default already includes the dev server on port 5173. |

Leave these empty in the sandbox; each one switches on an online feature:

| Name | Feature |
|---|---|
| `GCP_PROJECT_ID`, `GCP_REGION`, `VERTEX_AI_MODEL`, `VERTEX_AI_MODEL_FALLBACKS`, `VERTEX_AI_FALLBACK_REGIONS` | Vertex AI (Gemini): chat, macro estimates, photo analysis, workout analysis and suggestions, exercise guidance |
| `ENABLE_GROQ_FALLBACK`, `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL` | Backup AI provider if Vertex AI fails |
| `MONGODB_URI`, `MONGODB_DB_NAME` | Profile picture storage |
| `WORKOUTX_API_KEY` | Exercise demo GIFs |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_NATIVE_REDIRECT_URI`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID` | "Continue with Google" and Google Calendar sync |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `APP_PUBLIC_URL` | Password-reset e-mails and the link inside them |

The frontend needs no environment variables for the web build.

## Seed data and test accounts

- **Exercise library:** `backend/seed_exercises.py` loads 873 exercises from `backend/seed_data/exercises.json`. J2 and J7 search this library ("Barbell Bench Press - Medium Grip", "Dumbbell Shoulder Press", "Pushups"). Its images point at a CDN and won't load offline; the list shows a dumbbell icon instead.
- **Don't run `backend/scripts/seed.py`.** It creates the owner's personal account and weekly schedule, not test data. `backend/scripts/import_workoutx.py` needs the internet.
- There is no test mode and no fake-data switch.
- **No pre-made accounts are needed.** Each journey creates its own account through Sign up, with an e-mail address ending in `@test.invalid` and the password `Test1234`. Passwords must be at least 8 characters and contain a letter and a digit.
- **Rate limits:** Sign in and Sign up allow 5 requests per minute per client IP (or per `X-Forwarded-For` address). If many scenarios share one IP, later sign-ups get "Rate limit exceeded. Please try again later." Give scenarios separate IPs or space them out.

## Features that need an online service

| Feature | Where in the app | Needs | Without internet |
|---|---|---|---|
| AI coach chat | AI tab | Vertex AI / Groq | Replies fail with an error. Not covered by the journeys. |
| AI macro estimate | Meals → Add to … → AI tab; Meals → AI Recipe Importer | Vertex AI | Error message, nothing is logged. Not covered. |
| Photo meal estimate | Meals → Add to … → Photo tab | Camera + Vertex AI | Analysis fails with an error message. Not covered. |
| Barcode lookup | Meals → Add to … → Barcode tab | Open Food Facts | "No nutrition data for this barcode", then offers photo or description instead. Not covered. |
| Online food search | Meals → Add to … → Foods tab | Open Food Facts | Offline fallback: the 44 built-in foods (Banana, Chicken Breast, Rice…) still appear and can be logged. The online results section stays empty. Used by J3 and J7. |
| AI workout logger | Workout → + → AI Log | Vertex AI | Offline fallback: with `GCP_PROJECT_ID` empty, the analysis returns a rough estimate based on type and duration ("GCP not configured; using metric-based estimate.") and the workout can still be logged. Not covered by the journeys. |
| AI pick of today's workout | Workout tab, top card | Vertex AI | Offline fallback: the card shows a "Suggested next" or "Quick start" suggestion based on history. |
| Coach guidance and demo GIF | Exercise detail sheet | Vertex AI, WorkoutX | A spinner or a placeholder shows; "Add to Workout" still works. |
| Sign in with Google | Sign-in screen, "Continue with Google" | Google OAuth | Error message. Use username and password instead. |
| Google Calendar | Schedule, "Connect" chip | Google OAuth | Error message. Not covered. |
| Password reset | Sign-in, "Forgot password?" | SMTP | No e-mail is sent. Not covered. |
| Profile picture | Profile & Settings | MongoDB | Upload fails without `MONGODB_URI`. Not covered. |
| MCP server | `mcp/` (no screen in the app) | An outside AI client | The app has no MCP settings, address or token screen, so there is nothing for a tester to do. Not covered. |
