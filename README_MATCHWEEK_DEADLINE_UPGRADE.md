# Matchweek Deadline Upgrade

This version lets admin set a separate result deadline for each matchweek.

## New admin feature
Go to:

Admin → Fast Result Entry → Matchweek result deadlines

You can set:
- Deadline date for Matchweek 1
- Deadline time for Matchweek 1
- Deadline date/time for Matchweek 2
- etc.

## Behavior
After a matchweek deadline passes:
- Blank results in that matchweek become 0-0
- Existing results stay unchanged
- Admin can still edit results later

## Important
This is still a static GitHub Pages website, so auto 0-0 runs when the website/admin page is opened after the deadline. Use "Apply Due 0-0 Now" after the deadline if needed.

## Setup
1. Upload all files to your league GitHub repo root.
2. Commit changes.
3. Wait 1-3 minutes.
4. Open /admin.html.
5. Press Ctrl + F5.
6. Go to Fast Result Entry.
7. Set deadlines for each matchweek.
