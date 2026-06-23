# Fixtures Visible Only After Matchweek Deadline Is Set

This upgrade changes the public Fixtures page.

## New public behavior
`fixtures.html` only shows a matchweek if admin has set both:
- deadline date
- deadline time

Example:
- Matchweek 1 deadline set → Matchweek 1 fixtures visible to users
- Matchweek 2 deadline not set → Matchweek 2 fixtures hidden from users

## Admin behavior
Admin can still see and manage all fixtures from:
Admin → Fixtures + Schedule
Admin → Fast Result Entry

## Setup
1. Upload all files to your league GitHub repo root.
2. Commit changes.
3. Wait 1-3 minutes.
4. Open `/admin.html`.
5. Press Ctrl + F5.
6. Go to Fast Result Entry.
7. Set deadline for the matchweek you want users to see.
8. Open `fixtures.html`.
