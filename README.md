# FitFuel

FitFuel is a web app that suggests **what to eat, from restaurants that actually deliver to you, based on your body, your goals and your training schedule**.

Most nutrition apps assume you cook every meal yourself. FitFuel starts from what you can order right now (Wolt and Korpa.mk in North Macedonia) and picks meals that fit your calorie and macro targets, respect your allergies, and suit when you train (for example, carbs before a workout and protein after one).

## What it does

- **Profile and goals:** you enter weight, height, age and activity level. The app calculates BMI and daily calorie and macro targets for your goal (lose fat, build muscle, gain weight, maintain, or improve endurance).
- **Food preferences and allergens:** you mark dietary restrictions and allergens, each with a severity. Menu items are classified against them, so unsafe dishes are filtered out or flagged.
- **Workouts:** you log training manually or **import it from Google Calendar**. Calories burned are estimated and added to your daily budget.
- **Location-aware restaurants:** live venues come from Wolt's public API, plus a scraped Korpa.mk list for the Skopje area. Only places that deliver near you are shown.
- **AI meal recommendations:** an LLM (local Ollama by default, or Anthropic Claude) picks dishes from nearby menus to fit your remaining targets and meal timing. It also explains *why* each dish was chosen (personalization transparency).
- **Blood and urine test analysis:** you upload a lab-results PDF. The app extracts the values, the AI summarizes them, and the findings feed into recommendations.
- **History:** you can view past meals and workouts.

## Tech stack

| Part      | Tech                                                                  |
|-----------|-----------------------------------------------------------------------|
| Frontend  | React 19 (Create React App), React Router                             |
| Backend   | Node.js + Express 5                                                   |
| Database  | SQLite via Node's built-in `node:sqlite` (file `backend/fitfuel.db`, created automatically) |
| Auth      | Email/password (bcrypt + JWT) and Sign in with Google (OAuth 2.0)     |
| AI        | Ollama (local, free) or Anthropic API                                 |
| Data      | Wolt public API, Korpa.mk scraper (Puppeteer), Google Calendar API    |

```
Timski-proekt/
├── src/              React frontend (pages, components, API client)
├── public/
└── backend/
    ├── server.js     Express entry point (port 3001)
    ├── db.js         SQLite schema / setup
    ├── routes/       auth, profile, workouts, recommend, bloodwork, korpa, geo
    ├── lib/          AI provider, nutrition math, allergens, Wolt, restaurants
    ├── korpaScraper.js
    └── .env.example  Template for the backend .env (copy this)
```

## Running locally

### Prerequisites

- **Node.js 22.5 or newer.** The backend uses the built-in `node:sqlite` module.
- **npm**
- **Ollama** (recommended, free) for the AI features: install it from <https://ollama.com>, then run:
  ```bash
  ollama pull llama3.1:8b
  ```
  You can use an Anthropic API key instead (see below).

### 1. Clone and install

```bash
git clone https://github.com/smileska/Timski-proekt.git
cd Timski-proekt

# frontend dependencies
npm install

# backend dependencies
cd backend
npm install
```

### 2. Create the backend `.env`

The `.env` file is **not committed to git** because it holds secrets, so each developer creates their own from the template:

```bash
# inside backend/
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Then edit `backend/.env`:

| Variable | Required? | What it is |
|---|---|---|
| `JWT_SECRET` | **Yes** | Any long random string, used to sign login tokens. |
| `AI_PROVIDER` | Yes | `ollama` (default) or `anthropic`. |
| `OLLAMA_URL`, `OLLAMA_MODEL` | If using Ollama | Defaults: `http://localhost:11434`, `llama3.1:8b`. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | If using Anthropic | Get a key at <https://console.anthropic.com/>. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | For Google sign-in and Calendar | See [Google Calendar setup](#google-sign-in--google-calendar-setup). |
| `GOOGLE_REDIRECT_URI` | For Google | `http://localhost:3000/oauth/google` |
| `GOOGLE_PLACES_API_KEY` | Optional | Only used to geocode restaurants missing from the built-in coordinate list. |
| `PORT` | Optional | Backend port, default `3001`. |
| `FRONTEND_ORIGIN` | Optional | Default `http://localhost:3000` (used for CORS). |

The app runs without the Google variables. Email/password login still works, and only the "Continue with Google" button and Calendar import are disabled.

### 3. Start the backend

```bash
cd backend
npm run dev        # auto-restarts on changes (or: npm start)
```

The backend runs on <http://localhost:3001>. Open <http://localhost:3001/api/health> to check it; it should return `{"status":"ok"}`. The SQLite database is created on first start.

### 4. Start the frontend

In a second terminal, from the project root:

```bash
npm start
```

The app opens at <http://localhost:3000>. The frontend calls the backend at `http://localhost:3001` by default. To point it somewhere else, set `REACT_APP_API_URL`.

### 5. (Optional) Load Korpa.mk restaurants

Wolt restaurants load live and need no setup. The Korpa.mk list is stored in `backend/korpa-data.json`, which is also git-ignored. To generate it:

```bash
cd backend
node korpaScraper.js
```

This uses Puppeteer (headless Chrome) and takes a few minutes. Without this file the app works normally but shows only Wolt restaurants.

## Google Sign-in & Google Calendar setup

FitFuel uses **one Google OAuth consent** for both signing in and reading your calendar. When a user clicks **Continue with Google**, they grant:

- `openid`, `email`, `profile` for login
- `https://www.googleapis.com/auth/calendar.events.readonly` for reading calendar events (read-only, the app never writes to your calendar)

The backend stores the access and refresh tokens in the `connections` table and refreshes them automatically. On the **Workouts** page, the **Google Calendar** button reads events from your primary calendar for the **next 48 hours**. It imports those that look like training, meaning the title or description contains words such as *gym, run, workout, yoga, bike, swim, HIIT* (plus some Macedonian ones such as *тренинг* and *фитнес*). Imported sessions count toward the day's calorie budget and meal timing.

Because the `.env` is not in the repo, each developer needs their own Google credentials (or the team shares one set privately, never through git):

1. Go to <https://console.cloud.google.com/> and create (or select) a project.
2. **Enable the Calendar API:** go to *APIs & Services → Library*, search for **Google Calendar API**, and click **Enable**.
3. **Configure the OAuth consent screen:** go to *APIs & Services → OAuth consent screen*.
   - User type: **External**
   - Add the scopes `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `.../auth/calendar.events.readonly`.
   - While the app is in **Testing** mode, add every Google account that will log in under **Test users**. Other accounts will be blocked.
4. **Create credentials:** go to *APIs & Services → Credentials → Create credentials → OAuth client ID*.
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000/oauth/google`
5. Copy the **Client ID** and **Client secret** into `backend/.env`:
   ```env
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
   GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/google
   ```
6. Restart the backend. Then click **Continue with Google** on the login page, or **Connect** under Profile → Google Calendar if you signed up with email.
   - On the consent screen, **keep the "See events on Google Calendar" box ticked**.

### Troubleshooting

| Message | Fix |
|---|---|
| *Google sign-in is not configured on this server* | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing from `backend/.env`. Add both and restart the backend. |
| `redirect_uri_mismatch` | The redirect URI in Google Cloud must match `GOOGLE_REDIRECT_URI` exactly (`http://localhost:3000/oauth/google`). |
| *The Google Calendar API is not enabled for this project* | Enable **Google Calendar API** in the Library (step 2), wait about a minute, then retry. |
| *FitFuel was not granted calendar access* | Sign out, then sign in with Google again and keep the calendar checkbox ticked. |
| `access_denied` / "app not verified" | Add your Google account as a **Test user** on the consent screen. |

## Useful scripts

| Where | Command | What it does |
|---|---|---|
| root | `npm start` | Frontend dev server (port 3000) |
| root | `npm run build` | Production build into `build/` |
| root | `npm test` | Frontend tests |
| backend | `npm run dev` | Backend with auto-restart |
| backend | `npm start` | Backend |
| backend | `node korpaScraper.js` | Scrape Korpa.mk into `korpa-data.json` |

## Notes

- The files `backend/.env`, `backend/fitfuel.db*`, `backend/uploads/` and `backend/korpa-data.json` are git-ignored. Each developer has their own local copies.
- To reset your local data, stop the backend and delete `backend/fitfuel.db*`. A fresh database is created on the next start.
