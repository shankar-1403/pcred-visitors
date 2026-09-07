# PCRED Visitors

Front-desk visitor check-in for the PCRED office.

A walk-in uses the tablet at the door to say who they're here to meet, who they
are, and why. The person being visited is alerted **instantly** and can
**Approve**, **Decline**, or **Postpone** — and the answer appears on the
visitor's screen straight away, without anyone walking over.

**This is a completely standalone app.** Its own repo, its own Firebase
project, its own logins. It shares nothing with the PCRED website.

## Routes

Two doors, and only two: **`/` for visitors, `/staff` for the people who work
here.** Everything under `/staff` is behind the login; `/` never is.

| Route | Access | What it is |
|---|---|---|
| `/` | Public | The door kiosk. Full-screen, tablet-first check-in flow. |
| `/staff` | Staff | One front door per role: an admin gets the directory, a staff member gets their visitors. |
| `/staff/calendar` | Staff | Their own day: schedule, add events, visitor bookings marked apart. |
| `/login` | Public | Sign-in. Reached by being bounced from `/staff`, not linked. |
| `/api/visitors` | Public `POST` | Creates a request. Validates, rate-limits, and resolves the target staff member server-side. |
| `/api/availability` | Public `GET` | Free/busy slots for one staff member. |
| `/api/visits/confirm` | Staff `POST` | Writes an approved visit into the staff member's calendar. |
| `/api/calendar` | Staff `GET`/`POST` | Read and add events on **the caller's own** calendar. |
| `/api/staff-accounts` | Admin `POST` | Creates a staff login. |

## Setting it up for real

### 1. Create its own Firebase project

At [console.firebase.google.com](https://console.firebase.google.com):

1. **Add project** — call it something like `pcred-visitors`. **Do not reuse the
   website's project.**
2. **Build → Realtime Database → Create database.** Pick a region near you
   (`asia-southeast1` is a good default for India). Start in **locked mode**.
3. **Build → Authentication → Get started → Email/Password → Enable.**
4. **Project settings → General → Your apps → Web (`</>`)** and copy the config.

### 2. Point the app at it

```bash
cp .env.example .env.local
```

Fill in the seven `NEXT_PUBLIC_FIREBASE_*` values.

Until they are filled in, every screen shows a short "Firebase isn't connected
yet" notice rather than failing differently on each page.

### 3. Publish the database rules

The rules are in [`database.rules.json`](./database.rules.json). Because this is
a fresh database, you can paste the whole file — there is nothing to merge.

Either paste its contents into **Realtime Database → Rules → Publish**, or:

```bash
npx firebase-tools deploy --only database
```

Without this, every read is denied and the kiosk shows an empty staff list.

### 4. Lock down sign-up, then make the first admin


In **Authentication → Settings → User actions**, **untick "Enable create
(sign-up)"**. Without this, anyone who has the public web API key can mint
themselves an account. Logins are created from inside the app instead, through
the Admin SDK.

Then bootstrap the first admin by hand, because there is nobody yet who can
create one:

1. **Authentication → Users → Add user** — your own email and a password.
2. Copy the **User UID** it shows.
3. **Realtime Database → Data**, and add:

   ```
   roles/<that-uid>  =  { "role": "admin", "email": "you@pcred.org" }
   ```

Sign in at `/staff` and you are an admin. Everyone after this you create from
inside the app.

To create logins from the app, add the Admin SDK credentials to `.env.local`
(`FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`). Without them the
app still runs — the Create login button just reports that it is not configured.

### 5. Add the staff directory

Sign in and go to `/staff/directory`, then add everyone who should appear on
the kiosk. Put a person's **login email** on their record and their visitors alert
them directly; leave it blank and reception answers on their behalf.

## Roles

Two kinds of account.

The two roles see different apps. An admin **administers**; a staff member
**receives visitors**.

| | Admin | Staff |
|---|---|---|
| Visitors inbox | ❌ | ✅ their own |
| Their own calendar | ❌ | ✅ |
| Manage the directory | ✅ | ❌ |
| Create logins | ✅ | ❌ |

Adding someone to the directory creates their login in the same step — name,
designation, email and a starting password in one form. Leave the password
blank for someone who doesn't need an account.

**Someone who both administers and receives visitors needs two accounts** — an
admin login for running the system, and an ordinary staff login on their own
name for their visitors.

A staff member's browser doesn't fetch everyone's visits and hide them — it
issues a query constrained to their own address, and the database rules
**refuse** an unconstrained read from a non-admin. Hiding a tab is a courtesy;
the rule is the permission.

Anyone signed in with no role record is treated as ordinary staff, never as an
admin. Failing closed matters more than failing usefully.

⚠️ **Visitors for staff with no login currently reach nobody.** Their visits
belong to no inbox, and admins no longer have one. Either give everyone who
receives visitors a login, or ask for the oversight view (see *Not built yet*).

## Installing it on a phone

The app is a PWA, so it goes on a home screen without an app store, a developer
account, or any fee.

**Android.** Chrome offers an *Install* prompt; the app also shows its own
banner in the staff area. It then opens full screen with the PCRED mark as its
icon.

**iPhone.** Safari never offers a prompt — it has to be added by hand: **Share →
Add to Home Screen**. The app detects an iPhone and shows those instructions
instead of a button, because a button it cannot honour would be worse than
none. This step is not cosmetic: **iOS refuses to deliver notifications to a
site that has not been added to the Home Screen**, so skipping it means that
person silently receives nothing.

**The door tablet** should not be installed — run the browser in kiosk mode at
`/` instead, so a visitor has no address bar to wander off with.

What makes it installable: [`app/manifest.ts`](./app/manifest.ts), the icons in
`public/`, and [`public/sw.js`](./public/sw.js). That service worker
deliberately **caches nothing** — its job is installability, and later push.
Caching an app whose whole point is showing who is at the door right now risks
serving a stale visitor list, which is worse than not working offline.

Installability needs **HTTPS**. It will not work from `localhost` on a phone.

## Staying signed in

Staff sign in **once**. There is no session expiry and no automatic sign-out —
the sign-in survives reloads, browser restarts and phone reboots, and only ends
when someone presses **Sign out**.

This is deliberate. The app's job is to alert someone that a visitor is at
their door; an automatic sign-out would silently stop those alerts, and silence
looks exactly like "no visitors today". A timeout here would be the most
dangerous kind of failure.

## Each person's own calendar

`/staff/calendar` shows the signed-in person their own day — an hour-by-hour
timeline with overlapping meetings split into side-by-side lanes, a live "now"
line, and day-to-day navigation. The date is in the URL (`?date=YYYY-MM-DD`),
so a day can be linked and the back button steps through days.

They can add events, which go straight into their Google Calendar. Visits
booked at the front desk appear here automatically, marked in gold so they read
apart from meetings the person scheduled themselves.

**Two different levels of access, deliberately:**

| | Reads | Who sees it |
|---|---|---|
| Kiosk availability | `freeBusy` — busy blocks only, no titles | Anyone at the door |
| `/staff/calendar` | full events, with titles | Only that person |

`/api/calendar` takes the address from the **verified sign-in token**, never
from the URL or body. Being an admin grants nothing extra here: an admin can
see who visited whom, not what a colleague's private meetings are called.

## Calendar availability

The kiosk shows the visitor when the person they want to meet is actually free,
and lets them book a slot.

Availability is read through Google Calendar's **free/busy** endpoint, never
`events.list`. That returns only the blocks of time someone is occupied — no
titles, no attendees, no details. A stranger at the front desk must never be
able to infer who you are meeting.

When a booked visit is approved, the app writes it into the staff member's
calendar so the slot is blocked and nobody double-books it.

### Setting it up

1. In the Google Cloud project behind your Firebase project, **enable the
   Google Calendar API** and create a **service account**. Download its JSON key.
2. In the **Google Workspace admin console** → Security → API controls →
   **Domain-wide delegation**, add the service account's client ID with these
   scopes:

   ```
   https://www.googleapis.com/auth/calendar.freebusy
   https://www.googleapis.com/auth/calendar.events
   ```

   This is what lets the app read staff calendars without every person
   clicking through an OAuth screen.
3. Add to `.env.local`:

   ```
   GOOGLE_CALENDAR_CLIENT_EMAIL=...
   GOOGLE_CALENDAR_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   OFFICE_TIMEZONE=Asia/Kolkata
   ```

Leave these unset and the app falls back to **working hours** — each staff
record has its own from/until and slot length, set on `/staff`. The same
fallback catches a calendar outage, so a Google problem can never stop someone
checking in.

## Data model (Realtime Database)

```
staff/{staffId}
  name, designation, department, email, phone
  active                       // hidden from the kiosk when false
  useCalendar                  // read their free/busy; off = working hours only
  workingHours { start, end, days }
  slotMinutes                  // 15 / 30 / 60

visitor_requests/{requestId}
  visitorName, visitorPhone, visitorEmail, company, partySize
  purpose, purposeNote
  requestedFor      // chosen slot, or null for "meet now"
  calendarEventId   // set once an approval is written to the calendar
  staffId, staffName, staffDepartment, staffEmail
  status     // pending | approved | declined | postponed
  responseNote, postponedTo
  createdAt, respondedAt, respondedBy, respondedByName
```

`status`, `createdAt` and the staff fields are stamped by the API route, never
taken from the kiosk's request body — a tablet at the door cannot pre-approve
itself or address someone who isn't active. The route also rate-limits to 10
check-ins per hour per IP.

`staffEmail` is what links a visit to a person: it is matched, lowercased,
against the signed-in address.

## How the alert reaches staff

- **In-app**: a live database listener raises a modal and a chime (synthesised
  with the Web Audio API — there's no sound file to ship) on any signed-in page.
- **Browser notification**: a native OS popup, so it lands even when the tab is
  in the background. Staff grant permission once via the *Enable visitor alerts*
  button; if they decline, the in-app alert still works.

Both need a browser tab open somewhere. **Notifications with the app fully
closed need Web Push**, which is not built yet — see below.

## Kiosk behaviour

- Resets itself after 90 seconds of inactivity, so a half-filled form is never
  left on screen for the next visitor.
- Returns to the welcome screen 25 seconds after a request is answered.
- Touch targets are 56px+. The flow is Welcome → Who → You → Why → Review →
  Live status.

## Architecture note

Every hook and page reads and writes through [`src/lib/data.ts`](./src/lib/data.ts)
rather than touching `firebase/database` directly, so the data access stays in
one place.

## Not built yet

- **Web Push** — notifications with the app closed. Needs a service worker, a
  web app manifest, Firebase Cloud Messaging, per-device token storage, and an
  HTTPS deployment (it cannot work on localhost). Free to run; works on Android
  and on iPhone once the site is added to the Home Screen.
- Email / WhatsApp / SMS notification.
- Visitor check-in / check-out and an "in office now" board.
- Auto-escalation when nobody responds within N minutes.
- Badge printing, photo capture, ID scan.
