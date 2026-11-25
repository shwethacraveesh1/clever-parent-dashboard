# Clever Parent Dashboard

A localhost prototype: guardians sign in with a magic link and see the last 7 days of their children’s school app use — only the children they’re verified for, and only the data categories each district allows.

## Run

```bash
npm install
npm run dev
```

That starts the API on [http://localhost:3001](http://localhost:3001) and the Vite UI on [http://localhost:5173](http://localhost:5173). Open the UI. Magic links are printed in the **server** console (token in the URL fragment).

Tests:

```bash
npm test
```

### Demo logins

| Email | What you’ll see |
|---|---|
| `ruth.okafor@example.com` | Two children (Maya, Leo) in Maple Unified — full categories |
| `dan.reyes@example.com` | Sam in Riverside ISD — no screen time or devices |
| `priya.l@example.com` / `erik.l@example.com` | Both see Ava; neither sees the other guardian |
| `jamie.brandt@example.com` | Can sign in; no students (`accessState: none`) |
| `chris.m@example.com` | Can sign in; pending verification empty state |

Seed usage is fixed to a window ending **2026-10-25T00:00:00Z** (`AS_OF`), so dashboards aren’t empty against “now”.

## Architecture

```
Browser (React/Vite)  →  /api (proxied)  →  Express
                                              ├─ auth (magic link + session)
                                              ├─ authz (Verified links + visibility allowlist)
                                              ├─ cleaning / aggregate
                                              ├─ services (dashboard)
                                              └─ DataSource (seed today, API tomorrow)
```

**Request flow for a dashboard.** Session cookie → `requireSession` sets `req.guardianId` → `requireStudentAccess` reloads Verified links and 404s if the student isn’t in that set → `dashboardService` fetches raw rows → cleans and aggregates → `buildDashboard` copies only allowlisted fields → audit line (`viewed` or `denied`).

**Why a swappable DataSource.** `SeedDataSource` and a stub `ApiDataSource` share one async interface (`getGuardian*`, `getStudent`, `getDistrict`, `getApps`, `getDevicesForStudent`, `getEventsForStudent`). Sources return **raw** records only. Cleaning, authorization, and district visibility live above them, so swapping the source doesn’t rewrite the rules. Methods are async even for seed data so callers don’t change when the source becomes a network call.

The React client renders what the API returns. It never filters by district or decides who may see whom.

## Key decisions

Full detail: [docs/DECISIONS.md](docs/DECISIONS.md). Short version:

| Topic | Choice | Rejected |
|---|---|---|
| Auth | Email magic link; hashed single-use token; server session | Passwords; Google/Apple SSO; district SSO for guardians |
| Authz | `getAuthorizedStudentIds` on every request; 404 not 403 | Client-side filtering; guardian ID in the request |
| Visibility | Build response from a category allowlist | Delete keys from a full object (new fields would leak) |
| Time window | Configurable `AS_OF` (default 2026-10-25) | Hardcoded dates; real “now” (empty UI) |
| Cleaning | Used ≠ duration; union overlaps; don’t invent minutes | Guessing duration; swapping start/end; summing overlaps |
| Stack | Express + Vite + concurrently | Next.js (authz middleware less explicit to walk through) |
| Data store | In-memory seed files | SQLite/Postgres for the prototype |

**Revocation.** The session stores only `guardianId`. Links are looked up again on every request, so a revoke takes effect immediately.

**Revoked / pending.** Both can log in. The API never says “revoked”. `accessState` is `ok` \| `pending` \| `none`. Pending links never return a student name.

## Authentication: why, and where it breaks

Parents log in rarely and forget passwords. Districts already have guardian emails, so email is the identifier we actually have. Unknown emails get the same “if that email is on file…” response. Tokens live 15 minutes, one use, stored hashed. The link is `{origin}/verify#token=…` so the token stays out of server access logs and Referer. Logout destroys the server session, not just the cookie. Verify always issues a **new** session ID (no fixation).

Where it breaks for real parents:

- An email proves inbox control, not guardianship.
- Stale or shared family emails; an ex-partner may still have the inbox.
- Some parents have no reliable email (phone/SMS would be needed).
- Email delivery delays on back-to-school day.

## Testing strategy (highest risk first)

```bash
npm test   # Vitest + Supertest (~176 server tests) + a few client format tests
```

1. **Cross-family matrix.** Every seed guardian × every student (plus a fake ID). Access only where a Verified link exists. Unauthorized and nonexistent students return the **identical** `{ "error": "not_found" }` body with no stack. No session → 401. G05 (revoked) and G06 (pending) get empty lists with different `accessState` values and no student names.
2. **Tampering.** Changing the student ID in the URL, or putting a `guardianId` in the body, query, or header, never changes who is authorized. Identity comes only from the session.
3. **D2 visibility deep scan.** Walks every key and every string value in Riverside’s dashboard JSON: no `minutes` / `devices` / `deviceIds` keys, and no value matching `/^DV\d+/`. That proves hidden categories aren’t just CSS.
4. **Revoke mid-session.** Flip a link to Revoked while a session is open; the next request is 404.
5. **Event cleaning.** One unit test per rule, plus §7 fixtures as hardcoded expected dashboards (not recomputed with the helpers under test).
6. **Auth.** Expired token, reused token, logout invalidates the server session, session fixation, unknown-email response parity.
7. **Audit.** Injected logger; assert `viewed` / `denied` lines.

**What this doesn’t test.** No browser/E2E suite. No load or email-delivery tests. No real Clever/SIS API. Rate limiting and multi-instance session stores are out of scope. The client is thin and largely covered by API contracts rather than component tests.

**Where the real risk is.** These tests prove the code enforces the guardian links correctly. They can't prove the links themselves are right. The biggest real-world risk isn't an authorization bug; it's the wrong adult being verified, or a revocation that reaches us late. That's a data and process problem (see extension 1).

**What I'd add next:** Playwright tests that log in as each guardian; a test that throws random student IDs at the API; contract tests so `ApiDataSource` returns the same shapes as the seed; a second authorization check at the database level as a backstop; alerts on spikes of denied requests in the audit log.

## Usage event cleaning

Messy seed cases and what we do with them:

| Seed | Problem | Rule |
|---|---|---|
| **E002 / E003** | Duplicate (identical content, different IDs) | Keep the lowest `event_id` (E002). Count as `duplicatesRemoved`. |
| **E004 / E005** | Cross-device overlap (CodeLab on Chromebook + home laptop) | Per-app time = **union** of intervals → CodeLab **75 min**, not 105. Per-device keeps each device’s own time (DV02 60, DV03 45). |
| **E006** | End before start | App still counts as **used**; duration unknown (we don’t swap times or invent minutes). |
| **E009** | Missing end | App still counts as **used**; duration unknown. UI shows “duration unknown” / “at least N min” on totals. |
| **E010** | Future timestamp (2027) | Dropped. Start after `AS_OF` (+5 min clock drift). Counted once in `dataQuality.futureDropped`. |

Full pipeline (order matters):

| # | Rule |
|---|---|
| 0 | Drop missing / unparseable start |
| 1 | Drop start after `AS_OF` (+5 min clock drift); count once |
| 2 | Drop start before the 7-day window |
| 3a | Same `event_id`, different content → prefer valid end; else last in; `conflictingDuplicate` |
| 3b | Identical content, different IDs → keep lowest ID |
| 4 | Missing end → used, duration unknown |
| 5 | End before start / bad end → used, duration unknown |
| 6–7 | Per-app / per-device time = union of intervals (overlaps not double-counted) |

**Core idea:** “Was it used?” and “for how long?” are separate. A valid start is enough to say an app opened; only a valid start and end give a duration. Hiding that a 13+ app opened is worse for a parent than showing it without minutes.

**Rejected:** guessing a default duration for missing ends; swapping start/end on E006; summing overlaps (inflates the number parents care about most).

## Assumptions

- Days are **UTC** for the prototype; production should use the district timezone.
- Estimated age ≈ grade + 5 (no birthdates).
- “Time per app” counts as screen time for district visibility.
- Home (browser extension) and school devices are shown together when devices are allowed.
- `AS_OF` is fixed in seed mode so demos aren’t empty.

## Open questions (PM / district admin)

- Tell a revoked guardian their access was revoked, or keep the generic message?
- When two guardians share a child, should either see that the other exists?
- Whose timezone defines “a day”?
- Show home-device usage with school devices, or separately?
- If visibility changes mid-year, does it apply to past data?
- Is “time per app” always screen time, or could a district allow one but not the other?
- Does “data sharing” mean what the app receives, or also what it shares onward?
- How fresh does data need to be?
- Are there students (18+, emancipated) whose guardians should see nothing?

## How I used AI

AI drafted the folder layout, data layer, cleaning pipeline, auth/authz, tests, and UI from `PROBLEM.md` / `DECISIONS.md`. I reviewed plans before code, checked seed rows against the tables, and verified cross-family 404s by hand (e.g. curl as G01 → ST03).

I overrode several AI defaults: session holds only `guardianId` (revocation is immediate); visibility is an allowlist, not key deletion; `dataQuality` never carries device IDs; conflicting same-`event_id` rows prefer the complete (valid-end) version. The model also surfaced a real gap — fetching with an upper bound hid future-dated E010 from the cleaning counter — and the missing distinction between pending and revoked guardians, which became `accountStatus` + `accessState`. I tightened the D2 test to scan values as well as keys, added an audit log, and put the magic-link token in the URL fragment.

## Known limitations

- **In-memory sessions and tokens** — lost on restart; not shared across processes.
- **No rate limiting** on `POST /api/auth/request-link` (email bombing / enumeration via timing side channels in a real mailer).
- **No window clipping** — a session that starts before the window and runs into it is excluded entirely; ideal fix is to clip intervals to the window.
- **UTC days** — not district-local.
- **Prototype auth** — email ≠ guardianship (see above).

## Written extensions

1. Guardian verification and access lifecycle. How would a real guardian get linked to their child?
How do you handle custody changes, revoking access, and adults on file who must not get
access? What would you build first for a pilot, and what would you build later?

Questions: Are court orders and "do not allow" adults recorded digitally? Who at the school handles disputes?

I'm assuming the school already keeps a list of each students parents from enrolment. The school is the authority not us. WE invite the adult the school has on file and they confirm with the code only the school could give them, such as one handed out at the school office. An email login alone is not enough because it only proves they own an inbox

To handle custody changes, the school updates its records and we pick the change either through like a regular sync or through a school admin screen. We never decide custody ourselves

To handle revoking access, the school removes the link and it takes effect on the Guardians next click because we check the links on every request. The guardian would see a generic message "you don't have access, contact school" - something like this.

The adults on file who must not get access, they go on a block list that always wins over any link. They might try a new email, so any new request matching their name and student goes to a person at the school for review, never approved automatically.

I would builf the pilot first for one district. The school uploads its guardian list, guardians confirm with a school code, staff can remove access from an admin screen, and every change is logged. Later, automatic syncing with school records, a "request access" flow approved by staff, text messages for parents without email, translations, and yearly re-confirmation because contact details go stale.

2. Device usage data. Usage events come from school-managed Chromebooks, iPads, and a
browser extension on home devices. They arrive late, duplicated, or out of order, and one student often uses several devices. How would you model, deduplicate, and aggregate this data?
What should a parent see when data is partial or delayed?

Question - Do devices send check-ins while a session is open? Which timezone defines a student's day? How long do we keep raw events?

For the model, I would keep every raw event in a log that is only ever added to, never edited, with the device's times and the time we received it. Dashboard numbers are calculated from that log.

Same event ID twice: keep the most complete version, the one with an end time. Same content under different IDs: keep one. Times far in the future: flag them, don't trust them.

Aggregate - Per student, per day, per app, and merge overlapping sessions across devices so the same minutes aren't counted twice. When a late event arrives, recalculate that day.

Parent should see these when the data is partial or delayed
When each device last reported, for example "Home laptop last reported Tuesday".
"At least 90 min" when some time couldn't be measured.
Recent days marked as possibly incomplete.
A clear difference between "no use" and "no data yet". Never show 0 when data is simply missing.

3. Scale and trust. The same product serves a 2,000-student district and a 300,000-student district,
with a login spike at back-to-school time. How would the design change between the two? How
would you keep children's data secure and auditable?

Question: How fresh does data need to be? Who at the district reviews the audit log? How long should we keep the data?

The same code and features for both; only how it runs changes. For the big district: calculate dashboard numbers ahead of time instead of on every page load, keep each district's data separate so one can't slow down another, and store sessions in a shared store instead of server memory. The small district runs fine on the basic setup.

The main pressure is login emails. Send them through a queue and an email provider built for bursts, limit how often one email or IP address can request links, roll out invites school by school instead of all at once, and load-test before school starts.

Check access in two places: in the app and again in the database, so one bug can't leak another family's data. Send parents only summaries, never raw events. Encrypt the data, and delete it after a set time.

Log every dashboard view, every denied request and every access change: who, what and when. Let district admins read that log, log Clever staff access too, and alert on suspicious patterns, such as one account hitting many "not found" errors