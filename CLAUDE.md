# TuroAgent — Claude Code Guide

## Project Overview

TuroAgent is a Next.js 14 fleet management dashboard for Turo car-sharing hosts. It combines a full CRUD data layer (Supabase) with an AI advisor (Claude via Anthropic SDK) to help hosts track revenue, expenses, maintenance, guests, and taxes.

## Tech Stack

- **Framework**: Next.js 14 (App Router, server components + client components)
- **Database**: Supabase (PostgreSQL) via `@supabase/supabase-js`
- **AI**: Anthropic SDK (`claude-sonnet-4-6` for chat, `claude-haiku-4-5` for tips)
- **Styling**: Tailwind CSS + inline CSS custom properties (no component library)
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
```

## Project Structure

```
app/
  api/                  # Route handlers (Next.js App Router)
    chat/route.ts       # Streaming SSE chat endpoint
    conversations/      # Conversation CRUD
    fleet/route.ts      # Vehicle CRUD
    trips/route.ts      # Trip CRUD + line items
    expenses/route.ts   # Expense CRUD (GET, POST, PATCH, DELETE)
    guests/route.ts     # Guest CRUD
    maintenance/route.ts# Maintenance CRUD + live status computation
    documents/route.ts  # Vehicle document vault
    tips/route.ts       # AI daily tips (data-aware, Haiku)
    upload/route.ts     # Supabase Storage file upload
  dashboard/            # KPI cards, revenue chart, maintenance alerts
  fleet/                # Vehicle CRUD, ROI tracker, document vault
  trips/                # Trip logging, line items, guest combobox
  expenses/             # Expense CRUD with edit support
  guests/               # Guest CRM, flag system, message templates
  maintenance/          # Service item tracker, auto-link to expenses
  calendar/             # Month calendar + quick trip creation
  reports/              # Per-vehicle P&L, Schedule C, CSV export

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
```

## Architecture Patterns

### API Routes
All route handlers follow the same pattern: `supabase` query → `NextResponse.json`. PATCH handlers accept `{ id, ...fields }` and update by id. DELETE handlers accept either `{ id }` in the body or `?id=` as a query param.

### AI Chat
The chat route (`app/api/chat/route.ts`) streams SSE. Each `data:` line is a JSON object with either `{ delta: string }` (token chunk), `{ done: true }` (stream end), or `{ error: string }`. The client (`ChatPanel.tsx`) accumulates deltas into the last message in state.

The system prompt is built in `lib/context.ts` via `buildSystemPrompt(ctx)` which concatenates the static role/knowledge base with a live fleet snapshot from Supabase.

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
| Guest flagging + templates | `app/guests/page.tsx` |
| Maintenance tracker | `app/maintenance/page.tsx` |
| Calendar + trip creation | `app/calendar/page.tsx` |
| P&L + Schedule C export | `app/reports/page.tsx` |
| AI Fleet Advisor (chat) | `components/ChatPanel.tsx` + `ChatPopup.tsx` |
| AI daily tips | `components/AITipsPanel.tsx` |
| Document vault | `app/fleet/page.tsx` (expandable per vehicle) |

## Maintenance → Expense Auto-Link

When a maintenance item with a recorded cost is marked complete, a modal prompts the user to log it as an expense. This keeps P&L accurate without double-entry. The flow calls `POST /api/expenses` with `category: 'maintenance'`.

## Database

Schema lives in `supabase/schema.sql`. Migrations in `supabase/migrations/`. The project uses two Supabase DB views:
- `ytd_summary` — aggregates net revenue by year
- `ytd_expenses_summary` — aggregates expenses by year

Supabase Storage buckets used: `vehicle-docs`, `trip-receipts`, `expense-receipts`.

## Do Not

- Do not expose `ANTHROPIC_API_KEY` to the client — it is server-only
- Do not import `supabase` client in client components — only in API routes and `lib/context.ts`
- Do not add `inputCls`/`inputStyle` as local constants in page files — import from `@/lib/ui`
- Do not reimplement confirm-delete UX inline — use `<ConfirmDelete />` from `@/components/ConfirmDelete`
- Do not create a new AppShell wrapper — the shell layout is inlined directly in each section's `layout.tsx`
