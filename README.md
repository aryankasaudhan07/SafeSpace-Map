# SafeSpace Map

**AI safety companion for women in Delhi.** It warns you *before* you go, guides you *while* something is happening, and turns every anonymous report into protection for the next woman.
Built for **Tech Eximius 2.0** (Women Safety & Social Impact).

## Problem

Most harassment in public places (stalking, catcalling, groping on buses, dark stretches) is never reported. When something does happen, a frightened person has to work out alone who to call and where the nearest safe place is.

## Our USP: how we differ from existing safety apps

| Existing apps | SafeSpace Map |
|---|---|
| "Name and shame": upload a person's photo or criminal record. This risks defamation, mistaken identity, vigilantism and data-protection problems. | **Places and patterns, never people.** Gemini automatically removes names, phone numbers and handles. Nobody is accused, so it is safe to scale. |
| Static maps or a single SOS button | **AI that reasons about your exact situation:** "someone is following me" → urgency, the helpline to call, and the specific nearest staffed safe place with walking time |
| English only, needs an account | **English, Hindi and Hinglish**, fully anonymous with no login |
| Raw report lists | **AI area briefings** for any spot or metro station: risk level, patterns, peak times and tips |
| Needs constant internet and APIs | **1,781 real safe places bundled** (OpenStreetMap), with rule-based fallback if the AI is down. It never fails during a crisis. |

## Features

### Before you go
- **Safety heatmap:** hotspots weighted by severity, with filters by incident type and time of day
- **AI area check:** tap anywhere for a Gemini briefing of reports within 1 km, plus the nearest police station
- **Metro station safety check:** search all 238 Delhi-NCR stations to see what women report around each exit

### When something happens: SOS · Help now
- **One-tap helplines:** 112 (Emergency), 1091 (Delhi Police Women Helpline), 181 (Women in distress), 102 (Ambulance), 155370 (DMRC Metro)
- **AI "what should I do?" assistant:** describe the situation (or tap "Someone is following me", "Cab driver changed the route" and others) to get urgency, the number to call, step-by-step actions using real nearby places, and where to go
- **Nearest safe places:** police stations, hospitals, metro stations (CISF guarded) and petrol pumps, with walking time, a directions link and a call button
- **Share location:** one tap sends a Google Maps pin through the phone's share menu (Quick Share, Messages, WhatsApp…)
- **Live location tracking:** family or friends open a link and follow you on a map (position every 5 s, recent trail, police near you, "last seen" warning if the phone goes offline). Sharing ends automatically after 30 min to 4 h, and stopping wipes the position from the server.
- **Fake incoming call** to escape an uncomfortable situation

### After: protect the next woman
- **Anonymous reporting:** a pin, a description and a time of day. Gemini rejects spam, assigns a category and severity (1–5), writes a neutral title and **redacts personal details** automatically.

## What about false reports?

Reports are anonymous, so the system is built to stay trustworthy even when someone lies:

1. **Nothing to accuse anyone with:** reports describe places and patterns, never people. Gemini rejects reports that name or target a person, shop or business, so a false claim can't defame anyone. At most it nudges one spot's score.
2. **AI filter:** spam, rumours and forwards ("I heard…", "share this"), revenge posts, made-up stories and calls for violence or vigilantism are rejected with a polite reason.
3. **Community verification:** every report has "👍 I've seen this too" and "⚠️ Not accurate" buttons. Two or more confirmations mark it **Confirmed**. When three or more people dispute it, and disputes outnumber confirmations, it is **removed automatically**. One vote per device, and you can't confirm your own report.
4. **Trust weighting:** an unconfirmed report counts about half as much in the heatmap and risk levels, and old reports fade. A single unverified report can never make an area "high risk".
5. **Anti-flooding:** at most 5 reports per device per hour, and copy-paste duplicates are blocked. Devices are identified only by a salted hash, never by name, number or IP.

## Tech stack

Next.js 15 (App Router, TypeScript) · Tailwind CSS · Leaflet + leaflet.heat + OpenStreetMap · Google Gemini API (Gemini 4 Argon → 3.5 Flash → 3.1 Flash-Lite fallback chain, structured JSON output, timeouts) · OpenStreetMap safe-places dataset (police, hospitals, metro, fuel) · Supabase (Postgres) · Vercel

## Run locally

```bash
npm install
cp .env.example .env.local   # then add GEMINI_API_KEY
npm run dev
```

Open http://localhost:3000. Without Supabase, reports are saved to `data/reports.json`.

## Persistent storage (Supabase)

1. Create a free project at supabase.com.
2. In the SQL Editor, run `supabase/schema.sql`.
3. Under Project Settings → API, copy the Project URL and anon key into `SUPABASE_URL` / `SUPABASE_ANON_KEY`.

## Deploy (Vercel)

Import the GitHub repo in Vercel and add `GEMINI_API_KEY`, `GEMINI_MODELS`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` as environment variables.

## Data

- Safe places: © OpenStreetMap contributors (ODbL), exported via the Overpass API. Regenerate with `node scripts/build-safe-places.mjs <overpass-export.json>`.
- Map tiles: © OpenStreetMap contributors.
- The map includes clearly labelled **demo reports** so the heatmap is meaningful at launch. A toggle hides them.

## Roadmap (offline round)

Safest-route suggestions between two points · shake-to-SOS with automatic location SMS to trusted contacts · confirming and upvoting reports · weekly export for police and campus safety cells · PWA with offline helplines

In an emergency call **112** or the Women Helpline **1091 / 181**.
