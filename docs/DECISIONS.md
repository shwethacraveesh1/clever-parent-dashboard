1. Time window ("last 7 days")
Decision: Configurable AS_OF timestamp, default 2026-10-25T00:00:00Z. Window = (AS_OF - 7 days, AS_OF) → 2026-10-18T00:00Z to 2026-10-25T00:00Z.
Why: The seed events are from Oct 19–24, 2026. Using the real "now" would show empty dashboards. In production, AS_OF = now.
Rejected: Hardcoding dates into queries (not testable); using real now (no data to show).
Assumption: Days are UTC for the prototype. Real product should use the district's timezone.
2. Authentication
Decision: Passwordless magic link by email. In dev, the link is printed to the server console.
Token: random, single-use, expires in 15 min, stored hashed.
Session: server-side session, httpOnly, SameSite=Lax, Secure in prod, 8-hour expiry.
Logout destroys the server session, not just the cookie.
Unknown email gets the same response as a known one ("If that email is on file, we sent a link") so the login form doesn't reveal who is registered.
Why: Parents log in rarely and forget passwords. Districts already have guardian emails, so email is the identifier we actually have.
Where it breaks for real parents:
An email proves you control an inbox, not that you're the child's guardian.
Stale or shared family emails; an ex-partner may still have access to an old inbox.
Some parents have no reliable email; phone/SMS would be needed.
Email delivery delays on back-to-school day.
Rejected: Username/password (reset flows, credential stuffing, weak passwords); Google/Apple sign-in (still only proves an email, adds setup); district SSO (districts don't manage guardian identities, which is the whole problem).
3. Authorization (server-side)
Decision: One function, getAuthorizedStudentIds(guardianId), returns only students with a Verified link. Every student route goes through middleware that checks the requested ID is in that set.
Requests for a student not in the set return 404, not 403, so the API doesn't confirm which student IDs exist.
The guardian ID always comes from the session, never from the URL, query or body.
The session stores only the guardian ID. Links are looked up again on every request, so a revocation takes effect right away, without waiting for the session to expire.
requireStudentAccess is mounted on the whole /api/students/:studentId router (not per route), so every sub-path is checked the same way.
Unauthorized and nonexistent students return the identical JSON body `{ "error": "not_found" }` with no stack traces.
Magic-link URL format: `{appOrigin}/verify#token=...` (token in the fragment).
Verify always issues a new session ID and destroys any prior cookie value (no session fixation).
Audit: one JSON line per dashboard view and per denied access: { ts, guardianId, studentId, outcome: "viewed"|"denied" }. No names or stacks.
Rejected: Filtering in the React app (anyone can call the API directly); putting guardian ID in the request (trivially edited).
4. Link status edge cases
Guardian	Status	Behavior
G01	Verified, 2 children	Sees ST01 and ST02, switches between them
G03 / G04	Verified, same child	Both see ST04 independently; neither sees the other guardian
G06	Pending	Can log in. Empty state: "We're still verifying your link to a student. Contact your school."
G05	Revoked	Can log in. Sees no student names or data. Generic message: "You don't have access to any students. Contact your school."
Why generic wording for revoked: Revocation may be tied to custody or safety issues. Saying "revoked" or naming the student could cause harm. The API returns an empty list, so there's nothing to leak.
Guardian records carry accountStatus: "active" | "pending_verification" (G06 is pending_verification).
GET /api/students returns { students, accessState } with accessState "ok" | "pending" | "none". Precedence, first match wins:
ok: any Verified link. students lists only Verified-linked students; Pending links stay hidden (no names or IDs).
pending: no Verified link, and the account is pending_verification or has a Pending link.
none: everything else, including revoked. The API never says "revoked".
A Pending link never returns the student's name (or any other student field). Link statuses other than exactly "Verified" grant nothing.
Rejected: Blocking login for revoked guardians (gives a confusing error; also lets someone test which emails are revoked).
5. District visibility
Decision: Each district has an allowlist of categories: apps, screenTime, devices, contentRatings, dataSharing.
D1: all five.
D2: apps, contentRatings, dataSharing.
The server builds the response only from allowed categories (an allowlist), rather than removing hidden fields from a full object. A field added later then stays hidden until it's mapped to an allowed category. Hidden fields are absent, not null and not hidden by CSS.
dataQuality for a district that hides devices must not include device IDs.
Time per app counts as screen time, so it's hidden for D2.
Field → category mapping (anything not listed is never sent):
Always: student id and name, window, hiddenCategories.
apps: the app list (id, name, category) and dataQuality counts. Without apps there are no app rows at all.
screenTime: per-app minutes and hasUnknownDuration; total { minutes, hasUnknownDuration }.
devices: per-app deviceIds; the devices list (id, type, managed by school).
devices + screenTime: per-device minutes (needs both).
contentRatings: per-app ageRating and the age flag.
dataSharing: per-app dataReceived.
Default deny: if a district's settings are missing, show nothing but the student's name.
The response includes a hiddenCategories list so the UI can say "Your district doesn't share screen time or devices", instead of looking broken.
6. Usage event cleaning

Run in this order. Each rejected or adjusted event is counted in a dataQuality summary.

#	Rule	Seed case	Result
0	Drop events with a missing or unparseable start (we can't say when, or whether, the app was used)	none in seed	Excluded
1	Drop events whose start is after AS_OF (+5 min clock-drift allowance)	E010 (2027)	Excluded
2	Drop events outside the 7-day window (events already dropped by rule 1 aren't counted again)	none in seed	Excluded
3a	Repeated event_id: identical copies count as duplicatesRemoved. If the content differs, prefer the version with a valid end (parseable, not before start); if tied, keep the last in input order; count as conflictingDuplicate. Devices resend an event once the session ends, so the complete version should win	none in seed	One version kept
3b	Dedupe identical (student, device, app, start, end) across different event_ids; keep lowest event_id (natural order, E9 < E10)	E002/E003	Keep E002
4	Missing end → app counts as used, duration unknown (not guessed)	E009	VideoHub used, no minutes
5	End before start, or an unparseable end → app counts as used, duration unknown, flagged invalid	E006	VideoHub used, no minutes
6	Time per app = union of that app's intervals across all devices (overlaps not double-counted)	E004/E005	CodeLab = 75 min, not 105
7	Time per device = that device's own intervals	E004/E005	DV02 60 min, DV03 45 min
Core principle: "Was the app used?" and "For how long?" are separate questions. A valid start time is enough to say an app was opened; only a valid start and end give a duration. For a parent, hiding that a 13+ app was opened is worse than showing it without minutes.
Rejected:
Guessing a duration for missing end (e.g. 30 min default): invents data.
Swapping start/end on E006: we don't know which value is wrong.
Summing overlaps: inflates screen time, the number parents care most about.
Daily total = sum of per-app totals (a student could run two apps at once; fine for prototype).
The total carries hasUnknownDuration, so the UI can say "at least 90 min" when some usage couldn't be timed (ST04).
Window bounds: start >= AS_OF - 7 days, and start <= AS_OF + 5 min (the drift allowance in rule 1 means a start a few minutes past AS_OF is kept, not dropped by rule 2). Events dropped by rule 0 or 1 are not counted again later; dataQuality holds counts only, never device or event IDs.
Fetching: the service asks the data source for events with start >= window start only, with no upper bound, so future-dated events reach rule 1 and get counted instead of disappearing silently.
Known limitation: events are assigned to the window by start time, so a session that starts before the window start and runs into it is excluded entirely. Ideal fix: clip each interval to the window and count only the part inside it.
7. Expected dashboards (test fixtures)

AS_OF = 2026-10-25T00:00:00Z

ST01 Maya (D1, via G01)

MathQuest 25 min, ReadAlong 40 min. Total 65 min. Devices: DV01.
Data quality: 1 duplicate removed.

ST02 Leo (D1, via G01)

CodeLab 75 min (DV02 60, DV03 45). VideoHub EDU used, duration unknown (DV03).
Devices: DV02, DV03. Data quality: 1 invalid time range.
Flag: VideoHub EDU is 13+; Leo is grade 7 (~age 12).

ST03 Sam (D2, via G02)

Apps: SciSim, ReadAlong, with category, age rating, data received.
No minutes, no devices in the response. hiddenCategories: [screenTime, devices].

ST04 Ava (D1, via G03 and G04)

ChatTutor 90 min (DV05). VideoHub EDU used, duration unknown (DV06).
Devices: DV05, DV06. Data quality: 1 missing end, 1 future event dropped.

ST05 Noah: not visible to anyone (G05 revoked).

8. Age-rating flag
Decision: Show a badge when app age rating > student's estimated age.
Assumption: age ≈ grade + 5 (grade 3 ≈ 8, grade 7 ≈ 12, grade 10 ≈ 15). We don't have birthdates.
Shown only if the district allows contentRatings.
9. Data layer
Decision: A DataSource interface with async methods:
getGuardianByEmail(email)
getGuardian(guardianId) (added: the session holds only the guardian ID, so /api/auth/me and accessState look the guardian up by ID)
getGuardianLinks(guardianId) → [{ studentId, status }]
getStudent(studentId)
getDistrict(districtId) (includes visibility settings)
getApps(appIds)
getDevicesForStudent(studentId)
getEventsForStudent(studentId, from, to)
SeedDataSource reads JSON files in /seed. A future ApiDataSource implements the same methods.
Methods return raw data only. Cleaning, authorization and visibility live in the service layer, so swapping the source doesn't change any rules.
Async even for seed data, so callers don't change when it becomes a network call.
Rejected: SQLite/Postgres for the prototype (setup cost, not what's being evaluated); putting logic inside the data source (would have to be rewritten per source).
10. Stack
Node + Express API, React (Vite) frontend, concurrently so npm run dev starts both.
Tests: Vitest + Supertest.
Rejected: Next.js (fine, but auth/authorization middleware is less explicit to walk through).
11. Testing priorities (highest risk first)
Cross-family access: for every guardian × every student, assert access only where a Verified link exists. G01 → ST03 is 404. G05 → ST05 is 404. G06 gets []. No session → 401.
Tampering: changing the student ID in the URL, or sending a guardian ID in the body, never changes what's returned.
Visibility: D2 response JSON contains no minutes or devices keys anywhere.
Event cleaning: one unit test per rule in section 6, using the fixtures in section 7.
Auth: expired token, reused token, logout invalidates session.
Open questions for PM / district admin
Should a revoked guardian be told their access was revoked, or see a generic message?
When two guardians share a child (G03/G04), should either be able to see the other exists?
Which timezone defines "a day": the district's, the school's, or the parent's?
Should home-device (browser extension) usage be shown with school devices, or separately?
Can a district change visibility mid-year, and does that apply to past data?
Is "time per app" really screen time, or could a district allow one but not the other?
What counts as "data sharing": what the app receives, or also what it shares onward?
How fresh does data need to be? Is "as of yesterday" acceptable?
Are there students (e.g. 18+, emancipated) whose guardians should see nothing?