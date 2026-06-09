# TuroAgent — Claude Code Guide

## Project Overview

TuroAgent is a Next.js 14 fleet management dashboard for Turo car-sharing hosts. It combines a full CRUD data layer (Supabase) with an AI advisor (Claude via Anthropic SDK) to help hosts track revenue, expenses, maintenance, guests, and taxes.

## Tech Stack

- **Framework**: Next.js 14 (App Router, server components + client components)
- **Database**: Supabase (PostgreSQL) via `@supabase/supabase-js`
- **AI**: Anthropic SDK (`claude-sonnet-4-6` for chat, `claude-haiku-4-5` for tips)
- **Styling**: Tailwind CSS + inline CSS custom properties (no component library)
- **Markdown rendering**: `react-markdown` + `remark-gfm` (chat + VIN report; shared via `lib/mdComponents.tsx`)
- **Language**: TypeScript (strict)

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run start    # Run production build
npx tsc --noEmit # Type check without compiling
```

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon key (public)
ANTHROPIC_API_KEY=              # Anthropic API key (server-only, never exposed to client)
VINAUDIT_API_KEY=               # Optional — enables accident/ownership history in VIN Lookup (~$0.50/lookup at vinaudit.com)
```

## Project Structure

```
app/
  api/                  # Route handlers (Next.js App Router)
    chat/route.ts           # Streaming SSE chat endpoint
    conversations/          # Conversation CRUD
    fleet/route.ts          # Vehicle CRUD
    trips/route.ts          # Trip CRUD + line items; POST and PATCH both sync fleet.current_mileage
    expenses/route.ts       # Expense CRUD (GET, POST, PATCH, DELETE)
    guests/route.ts         # Guest CRUD
    templates/route.ts      # Message template overrides (GET, PATCH — upsert by key)
    generate-message/route.ts # AI guest message generation (POST, streaming SSE)
    maintenance/route.ts    # Maintenance CRUD + live status computation
    documents/route.ts      # Vehicle document vault
    tips/route.ts           # AI daily tips (data-aware, Haiku)
    upload/route.ts         # Supabase Storage file upload
    vin/route.ts            # VIN analysis: NHTSA fetch + Claude streaming (POST)
    vin-lookups/route.ts    # Saved VIN report CRUD: GET (includes report_markdown), POST, DELETE
  dashboard/            # KPI cards, revenue chart, maintenance alerts
  fleet/                # Vehicle CRUD, ROI tracker, document vault
  trips/                # Trip logging, line items, guest combobox
  expenses/             # Expense CRUD with edit support
  guests/               # Guest CRM, flag system, message templates
  maintenance/          # Service item tracker, auto-link to expenses
  calendar/             # Month calendar + quick trip creation
  reports/              # Per-vehicle P&L, Schedule C, CSV export
  vin-lookup/           # VIN pre-purchase analysis (NHTSA + optional VinAudit + Claude)

components/
  Sidebar.tsx           # Nav sidebar (desktop sticky + mobile drawer)
  ChatPanel.tsx         # Full chat UI with conversation history
  ChatPopup.tsx         # Floating FAB wrapper around ChatPanel
  AITipsPanel.tsx       # Daily AI recommendations panel
  StatCard.tsx          # KPI stat card
  ConfirmDelete.tsx     # Shared confirm-delete component

lib/
  supabase.ts           # Supabase client singleton
  context.ts            # Fleet context builder + system prompt for AI
  types.ts              # All TypeScript interfaces
  ui.ts                 # Shared inputCls / inputStyle constants
  export.ts             # CSV download utility
  database.types.ts     # Supabase-generated DB types
  mdComponents.tsx      # Shared react-markdown component overrides (used in ChatPanel + VIN Lookup)
```

## Architecture Patterns

### API Routes
All route handlers follow the same pattern: `supabase` query → `NextResponse.json`. PATCH handlers accept `{ id, ...fields }` and update by id. DELETE handlers accept either `{ id }` in the body or `?id=` as a query param.

### AI Chat
The chat route (`app/api/chat/route.ts`) streams SSE. Each `data:` line is a JSON object with either `{ delta: string }` (token chunk), `{ done: true }` (stream end), or `{ error: string }`. The client (`ChatPanel.tsx`) accumulates deltas into the last message in state.

The system prompt is built in `lib/context.ts` via `buildSystemPrompt(ctx)` which concatenates the static role/knowledge base with a live fleet snapshot from Supabase.

Chat responses render via `react-markdown` + `remark-gfm`. The shared `mdComponents` overrides live in `lib/mdComponents.tsx` and are imported by both `ChatPanel.tsx` and `app/vin-lookup/page.tsx`. They cover all GFM elements — tables, ordered/unordered lists, inline bold, blockquotes, code, headers, and horizontal rules. Do not revert to a hand-rolled line splitter; the renderer handles full GFM including pipe tables.

### AI Tips
`app/api/tips/route.ts` uses `claude-haiku-4-5` to generate 4 personalized tips as a JSON array. Tips are grounded in actual fleet data (vehicle names, revenue numbers, maintenance alerts). The frontend (`AITipsPanel.tsx`) caches by fleet fingerprint (`date:vehicleCount:tripCount:alertCount`) so tips auto-refresh when fleet state changes.

### Styling Conventions
- No component library — all styles are inline `style={{}}` or Tailwind utility classes
- Color palette: `#1D9E75` (brand green), `#0F172A` (text), `#64748B` (muted), `#E2E8F0` (border)
- Shared input constants: import `{ inputCls, inputStyle }` from `@/lib/ui`
- Shared confirm-delete: import `ConfirmDelete` from `@/components/ConfirmDelete`

### State Management
No global store. Each page manages its own state with `useState` + `useEffect` fetching from the API routes. Data is refetched after mutations by calling the local `load()` function.

## Key Features

| Feature | Location |
|---|---|
| Fleet CRUD + ROI tracker | `app/fleet/page.tsx` |
| Trip logging + line items | `app/trips/page.tsx` |
| Expense CRUD (with edit) | `app/expenses/page.tsx` |
| Guest flagging + AI message templates | `app/guests/page.tsx` |
| Maintenance tracker | `app/maintenance/page.tsx` |
| Calendar + trip creation | `app/calendar/page.tsx` |
| P&L + Schedule C export (mileage deduction) | `app/reports/page.tsx` |
| AI Fleet Advisor (chat) | `components/ChatPanel.tsx` + `ChatPopup.tsx` |
| AI daily tips | `components/AITipsPanel.tsx` |
| Document vault | `app/fleet/page.tsx` (expandable per vehicle) |
| VIN pre-purchase analysis | `app/vin-lookup/page.tsx` + `app/api/vin/route.ts` |

## Schedule C — Mileage Deduction

The Schedule C section in `app/reports/page.tsx` supports two IRS-compliant deduction methods, toggled by the host in the UI:

**Standard mileage method** (default) — `totalMiles × IRS_RATES[year]`. The `IRS_RATES` constant (module-level) maps year → rate:
- 2023: $0.655/mi, 2024: $0.670/mi, 2025: $0.700/mi, fallback: $0.700/mi

Line 9 becomes the mileage deduction. Gas, oil, repairs, insurance, and depreciation are included in the rate and suppressed as separate lines. Parking fees and cleaning remain separately deductible on Line 27a.

**Actual expense method** — original behavior: Line 9 (fuel + registration + parking), Line 15 (insurance), Line 22 (maintenance), Line 27a (cleaning + other).

The two methods are mutually exclusive per IRS rules. A comparison callout in the UI shows both totals and which method saves more. If no mileage data is recorded for the selected year, a yellow warning prompts the host to log odometer readings. Mileage is sourced from `trips.miles_added` (already captured in the trip logging flow — no DB changes required). The CSV export branches on the active method and includes a note row identifying which was used.

Do not add a new IRS rate year without also updating `IRS_RATES` in `app/reports/page.tsx`. Do not combine both deduction methods in a single Schedule C export.

## Maintenance → Expense Auto-Link

When a maintenance item with a recorded cost is marked complete, a modal prompts the user to log it as an expense. This keeps P&L accurate without double-entry. The flow calls `POST /api/expenses` with `category: 'maintenance'`.

## Message Templates Architecture

Five default templates live as constants in `app/guests/page.tsx` (the `TEMPLATES` object). The system supports three capabilities:

**Richer auto-fill** — `computeFilled(raw, guest, trips)` replaces tokens using the guest's most recent trip:

| Token | Source |
|---|---|
| `[Guest Name]` | `guest.name` |
| `[Car]` | `trip.fleet.year/make/model` |
| `[Start Date]` | `trip.start_date` |
| `[End Date]` | `trip.end_date` |
| `[X]` | `trip.daily_rate` (rounded) |

**DB-backed customization** — `app/api/templates/route.ts` exposes `GET` (returns saved overrides as `{ [key]: body }`) and `PATCH` (upserts by key). The page merges DB overrides over the hardcoded defaults on mount. Only customized templates are stored in the `message_templates` table.

**AI generation** — `app/api/generate-message/route.ts` accepts `{ purpose, guestName, guestFlag, carName?, tripDates? }` and streams a Claude Sonnet response. Tone is automatically adjusted based on the guest flag (great/caution/blocked/none). The stream format is identical to `/api/chat` (`{ delta }` / `{ done: true }` / `{ error }`).

Do not add a `pickup_time` column to the `trips` table for the `[Time]` placeholder — that column does not exist and `[Time]` is intentionally left as a manual placeholder.

## Database

Schema lives in `supabase/schema.sql`. Migrations in `supabase/migrations/`. The project uses two Supabase DB views:
- `ytd_summary` — aggregates net revenue by year
- `ytd_expenses_summary` — aggregates expenses by year

Supabase Storage buckets used: `vehicle-docs`, `trip-receipts`, `expense-receipts`.

The `message_templates` table stores only host-customized template bodies (keyed by template slug). Rows are upserted on save; the hardcoded `TEMPLATES` constant in `app/guests/page.tsx` serves as the fallback for any key not in the DB.

## Do Not

- Do not expose `ANTHROPIC_API_KEY` to the client — it is server-only
- Do not import `supabase` client in client components — only in API routes and `lib/context.ts`
- Do not add `inputCls`/`inputStyle` as local constants in page files — import from `@/lib/ui`
- Do not reimplement confirm-delete UX inline — use `<ConfirmDelete />` from `@/components/ConfirmDelete`
- Do not create a new AppShell wrapper — the shell layout is inlined directly in each section's `layout.tsx`
- Do not replace `react-markdown` in `ChatPanel.tsx` with a hand-rolled line parser — the GFM renderer handles tables, inline bold, numbered lists, and blockquotes that a naive splitter cannot
- Do not redefine `mdComponents` locally in any page — import from `@/lib/mdComponents`
- Do not add a `pickup_time` column to `trips` for the `[Time]` template placeholder — leave it as a manual placeholder
- Do not redefine `computeFilled` locally in any component — it lives in `app/guests/page.tsx` and is the single source of truth for template token replacement
- Do not save AI-generated messages as template bodies — the "Save template" action saves the raw body (with placeholders), not the composed output

## VIN Lookup — Data Sources

`app/api/vin/route.ts` calls these endpoints in order:

1. **NHTSA VIN Decode** — `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/{VIN}?format=json` — year/make/model/trim/engine (free, no key)
2. **NHTSA Recalls** — `https://api.nhtsa.gov/recalls/recallsByVehicle` (free)
3. **NHTSA Complaints** — `https://api.nhtsa.gov/complaints/complaintsByVehicle` (free)
4. **NHTSA Safety Ratings** — `https://api.nhtsa.gov/SafetyRatings/modelyear/{year}/make/{make}/model/{model}` (free)
5. **NHTSA Investigations** — `https://api.nhtsa.gov/investigations/` (free)
6. **VinAudit** — `https://www.vinaudit.com/api/v2/vehicle_history/` — accident/ownership/title history (optional, requires `VINAUDIT_API_KEY`)

Items 2–6 are fetched in `Promise.allSettled()` in parallel after the VIN decode succeeds. Timeouts are handled via `AbortController` (5s each); failures produce "data unavailable" notes in the Claude prompt rather than hard errors. The full data set is streamed through Claude Sonnet as an 11-section markdown report rendered by `mdComponents`.
