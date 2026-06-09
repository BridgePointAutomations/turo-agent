# TuroAgent

AI-powered Turo business management platform. Built with Next.js 14, Supabase, and the Anthropic Claude API.

## Features

- **AI Advisor** — Claude-powered chat with full fleet context injected on every message
- **VIN Lookup** — Carfax-style pre-purchase analysis: NHTSA safety data + Claude Sonnet generates an 11-section report (vehicle decode, crash ratings, recalls, complaints, Turo verdict, earnings estimate, pros/cons, maintenance watchlist, negotiation guidance, pre-purchase checklist)
- **Fleet management** — add vehicles, track mileage, status, daily rates
- **Trip logging** — log trips with auto net revenue calculation, auto mileage update
- **Expense tracking** — categorized expenses with per-vehicle and monthly breakdowns
- **Guest management** — flag system (great/caution/blocked), notes, AI-powered message templates with richer auto-fill and persistent customization
- **Maintenance scheduler** — auto-seeded service intervals per vehicle, mark-complete flow
- **Schedule C tax prep** — per-year P&L with IRS Schedule C summary; toggle between standard mileage deduction (IRS rate × logged business miles) and actual expense method with a side-by-side comparison
- **Dashboard** — revenue chart, maintenance alerts, fleet overview, inline AI chat

---

## Setup

### 1. Clone and install

```bash
cd turo-agent
npm install
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the entire contents of `supabase/schema.sql`
3. Copy your project URL and anon key from **Project Settings → API**

### 3. Set up environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ANTHROPIC_API_KEY=sk-ant-your-key
VINAUDIT_API_KEY=               # Optional — adds accident/ownership history to VIN Lookup
```

Get your Anthropic API key at [console.anthropic.com](https://console.anthropic.com)

The `VINAUDIT_API_KEY` is optional. Without it, VIN Lookup uses free NHTSA data only (no accident/ownership history). With it, the report adds a Vehicle History section with accident records, owner count, title brands, and mileage history. Get a key at [vinaudit.com](https://www.vinaudit.com) (~$0.50/lookup).

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## First steps

1. Go to **VIN Lookup** → Paste a VIN + price + mileage to get a full pre-purchase analysis before buying
2. Go to **Fleet** → Add your vehicle(s)
   - When you add a vehicle, 5 default maintenance items are auto-created (oil change, tire rotation, air filter, brake inspection, registration)
3. Go to **Trips** → Log your first trip
4. Go to **Expenses** → Log recurring costs (insurance, etc.)
5. Go to **Maintenance** → Set last-service dates and mileage for each item
6. The **AI Advisor** on the dashboard now knows your fleet and gives specific advice

---

## Architecture

```
app/
  dashboard/       # Overview: stats, revenue chart, alerts, AI chat
  fleet/           # Vehicle CRUD
  trips/           # Trip logging + table
  expenses/        # Expense log with category breakdown
  guests/          # Guest profiles, flags, AI message templates
  maintenance/     # Service schedule + mark-complete flow
  vin-lookup/      # VIN pre-purchase analysis (NHTSA + Claude)
  api/
    chat/          # POST — builds fleet context, calls Claude server-side
    fleet/         # GET/POST/PATCH/DELETE
    trips/         # GET/POST/PATCH
    expenses/      # GET/POST/DELETE
    guests/        # GET/POST/PATCH/DELETE
    templates/     # GET/PATCH — DB-backed custom message template bodies
    generate-message/ # POST — Claude-generated guest message (streaming SSE)
    maintenance/   # GET/POST/PATCH
    vin/           # POST — NHTSA fetch + Claude streaming analysis
    vin-lookups/   # GET/POST/DELETE — saved VIN report CRUD
components/
  Sidebar.tsx      # Navigation
  ChatPanel.tsx    # AI chat UI
  StatCard.tsx     # Reusable metric card
lib/
  supabase.ts      # Supabase client
  types.ts         # TypeScript interfaces
  context.ts       # Fleet context builder + system prompt generator
  mdComponents.tsx # Shared react-markdown overrides (chat + VIN report)
supabase/
  schema.sql       # Full DB schema — run this once in Supabase SQL editor
```

---

## AI context system

Every chat message goes through `/api/chat`, which:
1. Queries your live Supabase data (fleet, recent trips, maintenance alerts, YTD financials)
2. Builds a structured "briefing" and injects it as the system prompt
3. Sends your message + history to Claude

The AI always knows your specific vehicles, rates, mileage, open maintenance items, and profit numbers — no re-explaining needed.
