# DealEngine CRM

A fully functional deal-matching CRM built for investor-focused real estate agents. Designed for sourcing distressed and undervalued properties in the Sacramento/Placer County market and matching them to cash investors based on their specific buy criteria.

**Live URL:** [crm.dimalytics.com](https://crm.dimalytics.com)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [File Reference](#file-reference)
- [Features](#features)
- [Deal Matching Logic](#deal-matching-logic)
- [Database Schema](#database-schema)
- [Authentication](#authentication)
- [Setup From Scratch](#setup-from-scratch)
- [Deployment](#deployment)
- [Making Changes](#making-changes)
- [Backups](#backups)
- [Troubleshooting](#troubleshooting)

---

## Overview

DealEngine is a single-page application (SPA) that runs entirely as static HTML/CSS/JS files hosted on Cloudflare Pages. There is no backend server. The browser communicates directly with a Supabase (PostgreSQL) database via Supabase's client SDK. Authentication is handled by Supabase Auth.

This means:

- **Zero hosting cost** — Cloudflare Pages free tier
- **No server to maintain** — no Python, Node, or Docker to keep running
- **Global CDN** — fast load times from anywhere
- **Accessible from any device** — laptop, phone, tablet, any browser
- **One-file database backups** — export CSVs from Supabase or use their built-in backups

---

## Architecture

```
Browser (any device)
    │
    ├── Static files served by Cloudflare Pages CDN
    │   ├── index.html (SPA shell)
    │   ├── css/style.css
    │   ├── js/supabase-config.js (DB client + helpers)
    │   └── js/app.js (all page rendering + routing)
    │
    └── Direct API calls to Supabase
        ├── Authentication (email/password via Supabase Auth)
        ├── CRUD operations (buyers, properties, contacts, activities)
        └── Row Level Security (only authenticated users can read/write)

Supabase (PostgreSQL)
    ├── buyers table
    ├── properties table
    ├── contacts table
    ├── activity_log table
    └── Auth (email/password user accounts)
```

**Key design decisions:**

- Client-side SPA routing with `history.pushState` — no page reloads when navigating
- All matching logic runs in the browser (JavaScript) rather than as database queries — keeps the app simple and the Supabase usage minimal
- Supabase anon key is exposed in the client code (this is expected and safe) — Row Level Security policies on every table ensure only authenticated users can access data

---

## Project Structure

```
dealengine-web/
│
├── index.html                 # SPA shell — topbar, nav, app container
├── _redirects                 # Cloudflare Pages SPA config (all routes → index.html)
├── _headers                   # Security headers for Cloudflare Pages
├── schema.sql                 # Full database schema + seed data (run once in Supabase)
│
├── css/
│   └── style.css              # All styles — dark theme, components, responsive
│
└── js/
    ├── supabase-config.js     # Supabase client init, helpers, matching logic, auth
    └── app.js                 # SPA router + all page rendering functions
```

**Total:** 6 source files, ~2,400 lines of code.

---

## File Reference

### `index.html` (35 lines)

The SPA shell. Contains:

- Top navigation bar with links to Dashboard, Buyers, Properties, Contacts, Activity Log
- Quick-add buttons (+Buyer, +Property, +Log Activity)
- Sign Out button
- The `#app` container div where all pages render dynamically
- Script tags loading Supabase SDK, config, and app logic

This file never changes between page navigations. The `#app` div's innerHTML gets replaced by JavaScript.

### `css/style.css` (~120 lines)

Complete dark-theme stylesheet. Defines:

- CSS custom properties (colors, border radius) in `:root`
- Layout: topbar (sticky), container (max-width 1280px)
- Components: cards, stat boxes, tables, badges, buttons, forms, filters
- Sortable table headers (cursor, hover color, arrow indicators)
- Utility classes: text-muted, money formatting, flex helpers
- Flash messages with auto-fade animation
- Detail page layouts (header, grid, section titles)
- Responsive breakpoints for mobile (768px)

Color palette:

| Variable  | Hex       | Usage                        |
|-----------|-----------|------------------------------|
| --bg      | #0f1117   | Page background              |
| --surface | #1a1d27   | Cards, topbar                |
| --surface2| #242836   | Inputs, hover states         |
| --border  | #2e3345   | Borders, dividers            |
| --text    | #e2e4ed   | Primary text                 |
| --text2   | #8b90a5   | Secondary/muted text         |
| --accent  | #4f8cff   | Links, primary buttons, blue badges |
| --green   | #34d399   | Success, positive money, POF verified |
| --yellow  | #fbbf24   | Warnings, follow-ups         |
| --red     | #f87171   | Danger, negative spread      |
| --orange  | #fb923c   | Contact role badges          |

### `js/supabase-config.js` (~290 lines)

Supabase client initialization and shared utility functions. Contains:

**Configuration:**
- `SUPABASE_URL` — project endpoint
- `SUPABASE_KEY` — anon public key
- `db` — initialized Supabase client instance

**Constants:**
- `CONDITION_RANK` — maps condition strings to numeric ranks for comparison (turnkey=1, cosmetic=2, medium_rehab=3, full_gut=4)

**Helper Functions:**
- `fmt(n)` — formats numbers as currency ($XXX,XXX)
- `fmtDate(d)` — formats dates
- `badge(text, color)` — generates badge HTML with appropriate color class
- `buyerStatusColor(s)` — returns badge color based on buyer status
- `propStatusColor(s)` — returns badge color based on property status
- `tierColor(tier)` — returns badge color based on portfolio tier (blue=1-5, yellow=6-10, orange=11-19, red=20+)
- `today()` — returns current date as YYYY-MM-DD
- `flash(msg, type)` — shows a flash message at top of page that auto-fades
- `exportCSV(data, filename)` — converts array of objects to CSV and triggers download

**Matching Logic:**
- `getMatchingBuyers(property, buyers)` — given a property and all buyers, returns filtered/sorted matches. Skips inactive, not_investor, and buyers with incomplete criteria.
- `getMatchingProperties(buyer, properties)` — given a buyer and all properties, returns filtered/sorted matches. Returns empty if buyer criteria are incomplete.

**Authentication:**
- `checkAuth()` — checks for existing Supabase session; shows login form if none
- `showLogin()` — renders the login form UI
- `handleLogin(e)` — processes login form submission via Supabase Auth
- `signOut()` — signs out and shows login form

**Sortable Tables:**
- `makeSortable(tableId)` — attaches click handlers to `th[data-sort]` headers
- `sortTable(tableId, col, type)` — sorts rows by data attributes, toggles asc/desc
- `updateSortIndicators(tableId)` — shows ▲/▼ arrow on active sort column

### `js/app.js` (~1,830 lines)

The core application. Contains the SPA router, data cache, and every page's render function.

**Data Cache:**
- `_cache` object stores fetched data per section (buyers, properties, contacts, buyerActivities)
- `invalidateCache(key)` clears a specific cache key; called after any mutation (save, delete, import, activity log)
- List pages check `_cache` before fetching — if data exists, it renders instantly without a Supabase round-trip
- Filter clicks, status button clicks, and tab switching all reuse cached data

**Router (lines 1-50):**
- `navigate(path)` — pushes to history and routes
- `route(path)` — pattern-matches the URL and calls the appropriate render function
- Click interceptor — catches all internal link clicks and routes them through the SPA
- `setActiveNav(page)` — highlights the current page in the topbar
- `popstate` listener — handles browser back/forward buttons

**Dashboard — `renderDashboard()`:**
- Fetches all buyers, properties, contacts, and recent activities in parallel
- Calculates follow-ups due (today or overdue) from buyers and contacts
- Aggregates counts by status for buyers and properties
- Counts activities from the past 7 days
- Renders stat cards, follow-up table, and recent activity table

**Buyers — 5 functions:**
- `renderBuyersList(params)` — list view with status filter buttons (color-coded pills with counts), search, strategy/zip/batch filters. Uses `_cache.buyers` for instant filtering. Sortable columns. Portfolio tier column with color-coded badges.
- `filterBuyerStatus(status)` — navigates with status param, reuses cached data (no re-fetch).
- `renderBuyerForm(id)` — add/edit form with all buyer fields including portfolio_tier dropdown
- `saveBuyer(action)` — insert or update buyer record
- `deleteBuyer(id)` — delete with confirmation, also removes related activity logs
- `renderBuyerDetail(id)` — full detail view showing buyer info (including portfolio tier, property address, DNC phones, alt phones), matching properties, activity history

**PropStream Buyer Import — 4 functions:**
- `handlePropStreamBuyerImport(input)` — reads CSV file, extracts batch name from filename
- `showPropStreamBuyerPreview(owners, batchName)` — preview table with checkboxes, portfolio tier badges
- `confirmPropStreamBuyerImport()` — batch inserts selected buyers with import_batch tag
- `toggleAllPropStreamBuyer(checked)` — select/deselect all checkboxes

**Call List — `renderCallList(params)`:**
- Dedicated outreach page at `/buyers/calllist` (accessed from Buyers list, not in main nav)
- Uses `_cache.buyers` and `_cache.buyerActivities` for instant filtering
- Status filter buttons (color-coded pills with counts) for callable statuses only
- `filterCallListStatus(status)` — navigates with status param, reuses cached data
- Filters to only callable buyers (have non-DNC phone, not inactive/not_investor)
- Shows outreach sequence step per buyer (Day 1 Call → Day 3 Text → Day 7 Call → Day 14 Text)
- Sortable by name, portfolio tier, sequence step, status
- Each row has: copy-phone buttons, DNC phones in red, copy-address button for PropStream lookup, "Log Call" button linking to activity form
- Sorted by outreach progress (fewer touches first) then portfolio tier descending
- Filterable by status, import batch, portfolio tier

**Properties — 5 functions:**
- `renderPropertiesList(params)` — list view with search/filter by status, condition, zip, price, DOM. Sortable columns.
- `renderPropertyForm(id)` — add/edit form with auto-calculating MAO and ADU fields
- `saveProperty(action)` — insert or update with calculated MAO and ADU
- `deleteProperty(id)` — delete with confirmation
- `renderPropertyDetail(id)` — full detail view with stat cards (price, MAO, spread, DOM), matching buyers, activity history

**Contacts — 4 functions:**
- `renderContactsList(params)` — list view with search/filter by role, import batch. Sortable columns.
- `renderContactForm(id)` — add/edit form
- `saveContact(action)` — insert or update
- `deleteContact(id)` — delete with confirmation

**PropStream Contact Import — 4 functions:**
- `handlePropStreamImport(input)` — reads CSV, extracts batch name
- `showPropStreamPreview(owners, batchName)` — preview with portfolio tier badges
- `confirmPropStreamImport()` — batch inserts with import_batch tag
- `toggleAllPropStream(checked)` — select/deselect all

**Shared CSV Parser — `parsePropStreamCSV(text)`:**
- Handles quoted and unquoted CSV fields
- Groups rows by owner name (Company Name or First+Last)
- Collects all unique phones (split into DNC and non-DNC), emails, property addresses
- Reads Portfolio Tier column
- Returns deduplicated array of owner objects

**Batch Management — 2 functions:**
- `renameBatch(table, oldName)` — prompts for new name, updates all records in batch
- `deleteBatch(table, batchName)` — deletes all records in batch (with activity log cleanup for buyers)

**Activities — 3 functions:**
- `renderActivitiesList(params)` — list view with filter by contact type and activity type. Sortable columns.
- `renderActivityForm(params)` — outreach sequence tracker with quick-action buttons (see below)
- `saveActivity(action)` — insert activity, update buyer status/criteria/follow-up, structured description with outcome/classification/engagement

**Outreach Sequence Tracker (in renderActivityForm):**
When logging activity for a new/contacted buyer, the form shows:
- 4-step progress bar showing where the buyer is in the outreach sequence
- Context-aware quick action buttons:
  - Call steps: Voicemail, Callback Requested
  - Text steps: Send Text (with copyable template)
  - All steps: Conversation Hot (opens criteria panel), Conversation Warm, Not Interested, Not Investor, Wrong Number
- Structured logging fields: Call Outcome, Contact Classification, Engagement Level
- Criteria panel for collecting buy criteria inline during hot conversations
- Auto-sets follow-up dates based on sequence position
- Text templates with buyer's first name for Day 3 and Day 14

**Global window functions:** All button handlers (delete, filter, export, save, calcMAO, quickAction, copyText, etc.) are attached to `window` so they're accessible from inline `onclick` attributes in rendered HTML.

---

## Features

### Dashboard
- Follow-ups due today or overdue (from buyers and contacts)
- Active buyer count broken down by status
- Property count broken down by status
- Activities logged this week
- Recent activity feed (last 20 entries)
- Quick-add buttons in the topbar

### Buyer Management
- Full CRUD (create, read, update, delete)
- **Status filter buttons** — color-coded pill buttons with live counts per status, always visible above filters. Clicking filters instantly (cached, no re-fetch).
- Search by name or email
- Filter by strategy, zip code, import batch
- Sortable columns (name, portfolio, status, strategy, price, condition, funding, POF, deals, follow-up, import batch)
- Tracks: name, entity, phone, phone_alt, dnc_phones, email, source, target zips, price range, property types, condition tolerance, strategy, funding method, POF status, deal count, portfolio tier, property address, preferred contact method, notes, import batch
- Detail page shows all matching properties and activity history
- Edit and Delete buttons directly on list rows
- PropStream CSV import with preview, deduplication, and batch tagging

### Call List
- Dedicated outreach page accessed from Buyers list (not in main nav)
- **Status filter buttons** — color-coded pill buttons with live counts for callable statuses
- Excludes inactive and not_investor status buyers
- Shows outreach sequence progress per buyer
- Copy-to-clipboard buttons for phone numbers and property addresses
- DNC phones shown in red for reference
- Direct "Log Call" button per buyer linking to activity form
- Sorted by outreach progress then portfolio tier
- Filterable by status, import batch, portfolio tier

### Property Management
- Full CRUD with auto-calculated fields
- **MAO auto-calculates** as you type: `ARV × 0.70 − Rehab Estimate High`
- **ADU potential auto-flags** when lot > 5,000 sqft and property type is SFR
- Search by address
- Filter by status, condition, zip, max price, min DOM
- Sortable columns (address, price, MAO, spread, DOM, beds, sqft, type, condition, status, matches)
- DOM indicator: 🔥 appears when DOM exceeds 60 days
- Spread calculation shows if the property is above or below MAO (green = below = good deal)
- Detail page shows stat cards, matching buyers with contact info, and activity history
- Match count badge on list view shows how many buyers match each property

### Contact Management
- Full CRUD for non-buyer contacts
- Role categories: listing agent, contractor, attorney, property manager, title company, other
- Filter by role and import batch
- Sortable columns (name, role, company, follow-up, import batch)
- Activity log per contact
- PropStream CSV import with batch tagging

### Activity Logging
- Quick-log form designed for speed (15-30 entries per day)
- Select contact type → contact dropdown auto-populates
- Activity types: call, text, email, meeting, offer submitted/accepted/rejected, note
- **Outreach sequence tracker** for new/contacted buyers with 4-step progress bar
- **Quick action buttons**: voicemail, callback, hot conversation, warm conversation, not interested, not investor, wrong number
- **Structured fields**: call outcome, contact classification (investor/not investor), engagement level (hot/warm/cold)
- **Criteria panel** appears on hot conversations for inline criteria collection
- **Text templates** with buyer name for Day 3 intro and Day 14 final follow-up
- Auto-updates `last_contacted`, `next_followup`, and `status` on the related buyer/contact
- "Save & Log Another" button for batch entry

### PropStream Import
- Available on both Buyers and Contacts list pages
- Parses PropStream CSV format (quoted/unquoted headers, Phone 1-5 with DNC flags, Email 1-4, Portfolio Tier)
- Deduplicates by owner name — same LLC with 3 properties becomes 1 record
- Separates DNC phones from callable phones
- Stores first property address for PropStream lookup
- Preview table with checkboxes, portfolio tier badges, select/deselect all
- Import batch tagged with CSV filename (minus .csv extension)
- Batch management: filter, rename, delete entire batches

### Import Batches
- Every PropStream import is tagged with the CSV filename
- Filter dropdown appears on Buyers/Contacts list when batches exist
- When filtering by batch: Rename and Delete Batch buttons appear
- Delete Batch removes all records in that batch (plus related activity logs for buyers)

### Sortable Tables
- All four list pages have clickable column headers
- Click to sort ascending, click again for descending
- Small ▲/▼ arrow shows current sort direction
- Numeric, date, and string sort types supported
- Sort happens instantly in-browser (no re-fetch)

### Data Caching
- List pages (Buyers, Properties, Contacts, Call List) cache fetched data in memory
- Status button clicks, filter changes, and tab switching reuse cached data — no Supabase round-trip
- Cache is automatically invalidated after any mutation: save, delete, import, batch rename/delete, activity log
- The `_cache` object lives at the top of app.js; `invalidateCache(key)` clears a specific key
- "Loading…" spinner only appears on first visit or after a mutation

### CSV Export
- Available on Buyers, Properties, and Contacts list pages
- Downloads all records (not just filtered view) as a CSV file

### Authentication
- Email/password login via Supabase Auth
- Session persists across browser tabs and refreshes
- Sign Out button in topbar
- Database locked via Row Level Security — unauthenticated requests get zero data

---

## Deal Matching Logic

The matching engine is the core feature. It runs client-side in JavaScript.

### A property matches a buyer when ALL of these are true:

1. **Buyer has complete criteria** — zip_codes, property_types, and condition_tolerance must all be non-null (unvetted imports are excluded)
2. **Buyer is active** — status is not `inactive` or `not_investor`
3. **Zip code** — the property's zip_code exists in the buyer's comma-separated zip_codes list
4. **Price range** — the property's list_price OR mao falls between the buyer's min_price and max_price
5. **Property type** — the property's type (sfr, multi, land, condo) exists in the buyer's property_types list
6. **Condition tolerance** — the property's condition is equal to or BETTER than the buyer's tolerance

### Condition hierarchy (best to worst):

```
turnkey (1) > cosmetic (2) > medium_rehab (3) > full_gut (4)
```

A buyer who tolerates `medium_rehab` will also match `turnkey` and `cosmetic` properties, but NOT `full_gut`.

### Match sorting:

**On a buyer's detail page** (showing matching properties):
- Properties closest to or below MAO come first (negative spread = good deal)
- Ties broken by DOM descending (longer DOM = more motivated seller)

**On a property's detail page** (showing matching buyers):
- Verified active and engaged buyers appear first
- Then criteria_collected, contacted, new

---

## Database Schema

### buyers

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL | Primary key, auto-increment |
| name | TEXT | Required |
| entity_name | TEXT | LLC or trust name, nullable |
| phone | TEXT | Primary non-DNC phone |
| phone_alt | TEXT | Comma-separated additional non-DNC phones |
| dnc_phones | TEXT | Comma-separated DNC phones (for reference, not calling) |
| email | TEXT | |
| source | TEXT | public_records, meetup, referral, online, other |
| zip_codes | TEXT | Comma-separated: "95747,95678,95677" |
| min_price | INTEGER | Minimum purchase price |
| max_price | INTEGER | Maximum purchase price |
| property_types | TEXT | Comma-separated: "sfr,multi,land,condo" |
| condition_tolerance | TEXT | turnkey, cosmetic, medium_rehab, full_gut |
| strategy | TEXT | flip, brrrr, rental_hold, wholesale |
| funding_method | TEXT | cash, hard_money, conventional, private_money |
| proof_of_funds_verified | BOOLEAN | Default false |
| deals_last_12_months | INTEGER | Default 0 |
| portfolio_tier | TEXT | PropStream portfolio size: "1-3", "4-5", "6-10", "11-19", "20-49", "50+" |
| property_address | TEXT | First property address from PropStream (for lookup) |
| preferred_contact | TEXT | call, text, email |
| status | TEXT | new, contacted, criteria_collected, engaged, verified_active, not_investor, inactive |
| notes | TEXT | Freeform |
| import_batch | TEXT | CSV filename this buyer was imported from |
| created_at | TIMESTAMPTZ | Auto-set on insert |
| last_contacted | DATE | Updated automatically when activity is logged |
| next_followup | DATE | Updated when activity with follow-up is logged |

### properties

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL | Primary key |
| address | TEXT | Required |
| city | TEXT | |
| zip_code | TEXT | Single zip — used for matching |
| list_price | INTEGER | Current asking price |
| original_list_price | INTEGER | Original list price |
| dom | INTEGER | Days on market |
| price_reductions | INTEGER | Number of price drops |
| beds | INTEGER | |
| baths | NUMERIC(3,1) | Allows 2.5, etc. |
| sqft | INTEGER | Living area |
| lot_sqft | INTEGER | Lot size — triggers ADU flag if >5000 + SFR |
| year_built | INTEGER | |
| property_type | TEXT | sfr, multi, land, condo |
| condition_estimate | TEXT | turnkey, cosmetic, medium_rehab, full_gut |
| arv | INTEGER | After-repair value (your estimate) |
| rehab_estimate_low | INTEGER | Low end of rehab cost |
| rehab_estimate_high | INTEGER | High end of rehab cost |
| mao | INTEGER | Auto-calculated: ARV × 0.70 − rehab_estimate_high |
| estimated_monthly_rent | INTEGER | Nullable |
| adu_potential | BOOLEAN | Auto-flags if lot >5000 sqft and SFR |
| comp_addresses | TEXT | Freeform — addresses of comps used for ARV |
| listing_agent_name | TEXT | |
| listing_agent_phone | TEXT | |
| listing_agent_contacted | BOOLEAN | |
| source | TEXT | mls, redfin, off_market, driving, referral |
| status | TEXT | identified, analyzed, agent_contacted, offer_submitted, under_contract, closed, dead |
| notes | TEXT | Freeform |
| created_at | TIMESTAMPTZ | Auto-set |

### contacts

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL | Primary key |
| name | TEXT | Required |
| phone | TEXT | |
| email | TEXT | |
| role | TEXT | listing_agent, contractor, attorney, property_manager, title_company, other |
| company | TEXT | |
| notes | TEXT | |
| import_batch | TEXT | CSV filename this contact was imported from |
| created_at | TIMESTAMPTZ | Auto-set |
| last_contacted | DATE | |
| next_followup | DATE | |

### activity_log

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL | Primary key |
| contact_type | TEXT | buyer, listing_agent, seller, other |
| contact_id | BIGINT | References buyer.id or contact.id depending on contact_type |
| activity_type | TEXT | call, text, email, meeting, offer_submitted, offer_accepted, offer_rejected, note |
| description | TEXT | What happened — includes structured prefix [Outcome: x | Type: x | Engagement: x] when logged via quick actions |
| followup_needed | BOOLEAN | |
| followup_date | DATE | |
| created_at | TIMESTAMPTZ | Auto-set |

---

## Authentication

Authentication uses Supabase Auth with email/password sign-in.

**How it works:**

1. On page load, `checkAuth()` calls `db.auth.getSession()` to check for an existing session
2. If no session exists, the login form is displayed
3. On successful login, Supabase returns a JWT that's stored in the browser automatically
4. All subsequent API calls include this JWT — Supabase verifies it server-side
5. Row Level Security policies on every table check `auth.role() = 'authenticated'` — unauthenticated requests return empty results

**To add another user:** Supabase Dashboard → Authentication → Users → Add User

**To change your password:** Supabase Dashboard → Authentication → Users → click the user → update

---

## Setup From Scratch

If you need to recreate this entire project from zero:

### 1. Supabase

1. Create a Supabase account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to SQL Editor → New Query → paste contents of `schema.sql` → Run
4. Go to Authentication → Users → Add User (create your login)
5. Go to Settings → API → copy your Project URL and anon public key
6. Update `SUPABASE_URL` and `SUPABASE_KEY` in `js/supabase-config.js`

### 2. GitHub

```bash
cd dealengine-web
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/dealengine.git
git branch -M main
git push -u origin main
```

### 3. Cloudflare Pages

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
2. Select the `dealengine` repo
3. Build command: (leave blank)
4. Build output directory: (leave blank or `/`)
5. Deploy

### 4. Custom Domain

1. In the Cloudflare Pages project → Custom domains → Add
2. Enter your subdomain (e.g., `crm.yourdomain.com`)
3. If the domain is already on Cloudflare, DNS is configured automatically

---

## Deployment

Deployment is automatic. Every push to the `main` branch on GitHub triggers a new deployment on Cloudflare Pages.

```bash
# Make changes to files, then:
git add .
git commit -m "description of changes"
git push
```

Cloudflare builds and deploys in approximately 15 seconds. No build step — it just copies the static files to the CDN.

---

## Making Changes

### Adding a field to a table

1. Run an `ALTER TABLE` in Supabase SQL Editor:
   ```sql
   ALTER TABLE buyers ADD COLUMN new_field TEXT;
   ```
2. Add the field to the form in `app.js` (find the relevant `renderXxxForm` function)
3. Add it to the save function's data object
4. Add it to the detail view if desired
5. Push to GitHub

### Changing the matching logic

Edit `getMatchingBuyers()` and `getMatchingProperties()` in `js/supabase-config.js`. Both functions take the full record and an array of candidates, filter them, and return sorted matches. Buyers with null zip_codes, property_types, or condition_tolerance are automatically skipped.

### Changing styles

Edit `css/style.css`. All colors are defined as CSS custom properties in `:root` — change them there for a global theme update.

### Adding a new page

1. Add a route pattern in the `route()` function in `app.js`
2. Create a `renderNewPage()` async function
3. Add a nav link in `index.html` if needed

---

## Backups

### Option 1: CSV Export (from the app)

Click "Export CSV" on any list page (Buyers, Properties, Contacts).

### Option 2: Supabase Dashboard

Table Editor → select a table → Export as CSV

### Option 3: Supabase Database Backup

Supabase Pro plan includes automatic daily backups. On the free plan, use the CSV export method or use `pg_dump` if you have direct database access enabled.

---

## Troubleshooting

**"Loading…" spinner never resolves:**
Open browser console (Cmd+Option+J on Mac). Look for red errors. Most common cause is a Supabase connection issue or RLS policy blocking unauthenticated access.

**"TypeError: db.from is not a function":**
The Supabase SDK hasn't loaded yet. Check that `index.html` loads the CDN script before `supabase-config.js`.

**Data not appearing after login:**
Check RLS policies in Supabase Dashboard → Authentication → Policies. Every table needs a policy allowing authenticated users.

**Changes not showing after git push:**
Cloudflare may serve cached files. Hard refresh with Cmd+Shift+R, or purge the cache in Cloudflare Dashboard → Caching → Purge Everything.

**Login not working:**
Verify the user exists in Supabase Dashboard → Authentication → Users. Check that the email is confirmed (Supabase may require email confirmation depending on settings — disable it in Authentication → Settings → Email Auth if needed).

**PropStream import shows 0 contacts:**
Check that the CSV has the expected headers (First Name, Last Name, Company Name, etc.). The parser matches by exact header name. Open browser console to check for parse errors.

**Buyers not showing in property matches:**
Buyers need complete criteria (zip_codes, property_types, condition_tolerance all non-null) and an active status (not inactive or not_investor) to appear in matches. Newly imported buyers have null criteria until you edit them or log a hot conversation.

**Portfolio tier not showing:**
Make sure you ran `ALTER TABLE buyers ADD COLUMN portfolio_tier TEXT;` and reimported your CSVs after deploying the latest app.js.
