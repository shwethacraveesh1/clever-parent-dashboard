Problem: Clever Parent Dashboard

Background

Clever serves 30M+ students and their teachers. Parents have had no visibility into the apps and devices their children use at school, and they want it: which apps, how much screen time, what content their children can reach, and how their data is used.

Constraints
Schools stay in control. A guardian sees data only about their own child. Each district decides which categories of data guardians may see.
Guardian identity is messy. Districts don't manage guardian identities the way they manage students and teachers. Contact info goes stale. Districts keep records of adults who must NOT see or pick up a student. Proving someone is a legitimate guardian is an unsolved problem.
US K-12 context. State assumptions and questions where unsure.
What a guardian must be able to do
Log in and log out.
See the children linked to them, and only those children.
Per child, see a dashboard for the last 7 days: apps used, time per app, devices used, each app's category and age rating, and what data each app receives.
See only the data categories the child's district allows.
Required in the prototype
[ ] Real authentication (defend the choice in README: why it fits, where it breaks for real parents)
[ ] Server-side authorization: a guardian can't load another family's data, even by editing a URL or API call
[ ] District visibility settings honored
[ ] Edge cases: guardian with several children, guardian with no verified links, revoked guardian
[ ] Swappable data layer (seed data today, real API tomorrow)
[ ] Testing strategy in README, including how to prove one guardian can't read another family's data
[ ] Messy usage data handled, with rules written down
[ ] Platform: web app on localhost, ideally one command to run
README must cover
How to run (one command ideal)
Key architectural decisions and rejected alternatives
Assumptions, and questions for a PM or district admin
How AI was used: what was delegated, how output was checked, where it got something wrong
Written extensions (1–2 paragraphs each, no code)
Guardian verification and access lifecycle: how a guardian gets linked; custody changes; revoking access; adults on file who must not get access; what to build first for a pilot vs later.
Device usage data: events from Chromebooks, iPads and a home browser extension arrive late, duplicated, out of order; students use several devices. How to model, dedupe, aggregate; what a parent sees when data is partial or delayed.
Scale and trust: 2,000-student vs 300,000-student district, back-to-school login spike. How the design changes; how to keep children's data secure and auditable.
Seed data
A. Districts
District ID	Name	Students	Guardians may see
D1	Maple Unified	2,100	Apps, screen time, devices, content ratings, data sharing
D2	Riverside ISD	310,000	Apps, content ratings, data sharing. Screen time and devices hidden
B. Students
Student ID	Name	Grade	District
ST01	Maya Okafor	3	D1
ST02	Leo Okafor	7	D1
ST03	Sam Reyes	5	D2
ST04	Ava Lindqvist	10	D1
ST05	Noah Brandt	8	D2
C. Guardians
Guardian ID	Name	Email	Linked students	Link status	Why it's here
G01	Ruth Okafor	ruth.okafor@example.com	ST01, ST02	Verified	Several children
G02	Daniel Reyes	dan.reyes@example.com	ST03	Verified	District hides some categories
G03	Priya Lindqvist	priya.l@example.com	ST04	Verified	Shares a student with G04
G04	Erik Lindqvist	erik.l@example.com	ST04	Verified	Second guardian on the same student
G05	Jamie Brandt	jamie.brandt@example.com	ST05	Revoked	Access revoked. Must see nothing
G06	Chris Moreno	chris.m@example.com	None	Pending	No verified links yet
D. Apps
App ID	Name	Category	Age rating	Data the app receives
A1	MathQuest	Math practice	6+	Name, grade, school
A2	ReadAlong	Reading	4+	Name, grade, reading level
A3	CodeLab	Computer science	9+	Name, email, grade
A4	VideoHub EDU	Video	13+	Email
A5	ChatTutor	AI tutoring	13+	Name, email, grade, chat history
A6	SciSim	Science	9+	Name, grade
E. Devices
Device ID	Student	Type	Managed by school
DV01	ST01	Chromebook	Yes
DV02	ST02	Chromebook	Yes
DV03	ST02	Home laptop (browser extension)	No
DV04	ST03	iPad	Yes
DV05	ST04	Chromebook	Yes
DV06	ST04	Home laptop (browser extension)	No
DV07	ST05	Chromebook	Yes
F. Usage events (sample, times in UTC)
csv
event_id,student_id,device_id,app_id,start,end
E001,ST01,DV01,A1,2026-10-19T14:00:00Z,2026-10-19T14:25:00Z
E002,ST01,DV01,A2,2026-10-19T15:00:00Z,2026-10-19T15:40:00Z
E003,ST01,DV01,A2,2026-10-19T15:00:00Z,2026-10-19T15:40:00Z
E004,ST02,DV02,A3,2026-10-20T16:00:00Z,2026-10-20T17:00:00Z
E005,ST02,DV03,A3,2026-10-20T16:30:00Z,2026-10-20T17:15:00Z
E006,ST02,DV03,A4,2026-10-20T22:10:00Z,2026-10-20T21:50:00Z
E007,ST03,DV04,A6,2026-10-21T13:00:00Z,2026-10-21T13:45:00Z
E008,ST04,DV05,A5,2026-10-22T18:00:00Z,2026-10-22T19:30:00Z
E009,ST04,DV06,A4,2026-10-22T23:00:00Z,
E010,ST04,DV06,A5,2027-03-01T10:00:00Z,2027-03-01T10:20:00Z
E011,ST05,DV07,A1,2026-10-23T14:00:00Z,2026-10-23T14:30:00Z
E012,ST03,DV04,A2,2026-10-24T15:00:00Z,2026-10-24T15:20:00Z

Known problems to handle: duplicate (E002/E003), cross-device overlap (E004/E005), end before start (E006), missing end (E009), future timestamp (E010).