# Dashboard lock after 30 minutes — design

Status: approved by the owner on 2026-11-23, with choice 1 under "What this does not do" (the computers' own screen lock). Built in the same pull request as this file.

## Intent

The staff dashboard shows the most sensitive things on the site: patient
search with full names and contact details, the check-in history, the
audit log, PIN resets, device pairing. If it is left open on a computer
and nobody is there, it should stop showing and serving any of that by
itself. HIPAA calls this "automatic logoff".

## Decided by the owner

- The dashboard locks after **30 minutes** without activity.
- One person operates the admin side.

## Goals

1. After 30 minutes with no mouse, keyboard or touch on the dashboard,
   the page shows a lock screen instead of its contents, and the server
   refuses the dashboard's requests until it is unlocked.
2. The lock is enforced by the server, not only by the page: reloading
   the page, opening a new tab or calling the site directly does not get
   around it.
3. The rooms board, the kiosk and the waiting-room TV are not affected in
   any way.

## Non-goals

- Locking the rooms board. It runs unattended on the wall all day and
  shows only "First L." and room numbers. It keeps today's rule: a
  sign-in ends at 3 am.
- Locking the computer itself. That is the computer's own screen lock
  (see "What this does not do").

## Anti-goals

- Signing the whole browser out. That would throw a rooms board open in
  another tab back to the login screen in the middle of the clinic day.
- A lock that the page's own automatic refresh keeps open. The Check-ins
  tab refreshes itself every minute; that must not count as activity.

## Constraints found in the code

- A staff sign-in is one signed cookie (NextAuth, no server-side session
  store), valid until 3 am. Every staff request passes through
  `staffRoute` / `getAdminEmail`.
- Dashboard-only requests: patient search, the check-in history and its
  export, the audit log, Reset PIN, Practice Better sync, device pairing,
  music and Spotify settings. Shared with the rooms board and therefore
  NOT locked: rooms, doctors, visits, expected arrivals, finished visits,
  and checking a patient in by id.
- Google's sign-in cannot be told to ask for the password again. Checked
  against Google's documentation on 2026-11-23: the only options are "show
  nothing", "show the consent screen" and "show the account chooser".

## Approaches

**A. A lock screen drawn by the page only.** Simple, but a reload brings
the dashboard straight back. Rejected: it only looks like a lock.

**B. Sign out after 30 minutes idle.** Enforced by the server, but it ends
the sign-in for every tab, the rooms board included. Rejected (anti-goal).

**C. A "last active on the dashboard" time inside the sign-in itself
(chosen).** The sign-in cookie carries the moment of the last real
activity on the dashboard. Dashboard-only requests are refused once that
moment is more than 30 minutes old; everything the rooms board uses keeps
working. The page renews the moment while a person is actually using it,
and the server refuses to renew a moment that has already run out — only
signing in with Google again starts a new one.

## The design

- **What counts as activity:** a click, a key press, a touch or a scroll
  on the dashboard page. The page tells the server at most once a minute,
  and only if there was activity since the last time. Automatic refreshes
  never count.
- **What the person sees:** one minute before locking, a small notice:
  "The dashboard will lock in a minute. Click or press a key to keep it
  open." (Mouse movement alone does not count: a bumped desk is not a
  person.)
  Then the contents are removed from the page and replaced by:
  "Locked. The dashboard locks after 30 minutes without activity." with
  one button, "Sign in with Google to continue". After signing in they
  are back on the tab they were on. A half-typed search is not kept.
- **Opening the dashboard after 30 minutes on other pages** (for example
  after a morning on the rooms board) also shows the lock screen: the
  rule is "30 minutes since the dashboard was last used", wherever the
  person was meanwhile.
- **The rooms board's "Check in a patient" link** leads to the dashboard's
  patient search, so it meets the lock screen too when the dashboard has
  not been used for 30 minutes.
- **Unlocking** is an ordinary Google sign-in showing the account chooser.
  Once the sign-in log exists (a separate change), each unlock appears in
  it as a sign-in.

## What this does not do

Unlocking is as strong as Google's sign-in on that computer. If the
browser is still signed in to Google, unlocking takes two clicks and no
password, because Google offers no way for a site to demand the password
again. The lock therefore stops a dashboard left open from being read at
a glance or used by someone passing by who does not know to click
through — it does not stop a determined person at an unlocked computer.

Two ways to close that gap, for the owner to choose:

1. **Rely on the computer's own screen lock (recommended).** Set every
   computer that opens the dashboard to lock itself after 10–15 minutes.
   That also protects email and Practice Better, which this site cannot.
   Nothing more to build.
2. **Add an unlock code to the dashboard.** A code of the owner's
   choosing, asked for on the lock screen in addition to Google. It is a
   real barrier at the keyboard, but it is one more secret to keep, with
   its own "forgot the code" path, and about a day more work.

## Left to the builder

- Where the 30 minutes lives (one named constant, tested).
- The exact list of locked routes, held in one place with a test like
  `staff-route.test.ts`, so a new dashboard route cannot be left unlocked
  by accident.
- The look of the lock screen and the notice, in the existing staff look.
