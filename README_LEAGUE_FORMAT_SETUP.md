# EFL League Format Website

This is a separate league-format website.

## Main features
- League format, no bracket page
- Default league size: 20 teams
- Maximum: 48 teams
- Bulk team paste
- Single round-robin or home-and-away fixtures
- Fixtures separated by Matchweek
- Results use the same clean layout as fixtures
- League table with centered number columns
- Optional fixture date/time
- Result deadline with automatic 0-0 draw after deadline
- Admin can still edit results after auto 0-0
- No visible default PIN

## First-time setup
1. Upload all files to a new GitHub repository, or a new folder/repo for this league site.
2. In Supabase, open SQL Editor.
3. Run `supabase-setup.sql`.
4. Open `/admin.html`.
5. Create your admin PIN.
6. Go to League Settings.
7. Set league size, usually 20.
8. Paste teams from Bulk Teams.
9. Generate fixtures.

## Important
This site uses the Supabase table:

`efl_league_data`

Your older tournament/UCL website can still use:

`efl_data`

So both websites can share the same Supabase project without overwriting each other.
