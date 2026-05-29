# TuroAgent

AI-powered Turo business management platform. Built with Next.js 14, Supabase, and the Anthropic Claude API.

## Features

- **AI Advisor** — Claude-powered chat with full fleet context injected on every message
- **Fleet management** — add vehicles, track mileage, status, daily rates
- **Trip logging** — log trips with auto net revenue calculation, auto mileage update
- **Expense tracking** — categorized expenses with per-vehicle and monthly breakdowns
- **Guest management** — flag system (great/caution/blocked), notes, message templates
- **Maintenance scheduler** — auto-seeded service intervals per vehicle, mark-complete flow
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
```

Get your Anthropic API key at [console.anthropic.com](https://console.anthropic.com)

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## First steps

1. Go to **Fleet** → Add your vehicle(s)
   - When you add a vehicle, 5 default maintenance items are auto-created (oil change, tire rotation, air filter, brake inspection, registration)
2. Go to **Trips** → Log your first trip
3. Go to **Expenses** → Log recurring costs (insurance, etc.)
4. Go to **Maintenance** → Set last-service dates and mileage for each item
5. The **AI Advisor** on the dashboard now knows your fleet and gives specific advice

---

## Architecture

```
app/
  dashboard/       # Overview: stats, revenue chart, alerts, AI chat
  fleet/           # Vehicle CRUD
  trips/           # Trip logging + table
  expenses/        # Expense log with category breakdown
  guests/          # Guest profiles, flags, message templates
  maintenance/     # Service schedule + mark-complete flow
  api/
    chat/          # POST — builds fleet context, calls Claude server-side
    fleet/         # GET/POST/PATCH/DELETE
    trips/         # GET/POST/PATCH
    expenses/      # GET/POST/DELETE
    guests/        # GET/POST/PATCH
    maintenance/   # GET/POST/PATCH
components/
  Sidebar.tsx      # Navigation
  ChatPanel.tsx    # AI chat UI
  StatCard.tsx     # Reusable metric card
lib/
  supabase.ts      # Supabase client
  types.ts         # TypeScript interfaces
  context.ts       # Fleet context builder + system prompt generator
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
