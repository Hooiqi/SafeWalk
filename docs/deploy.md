# Putting SafeWalk online (website)

One website address serves everything:

| Path | What |
|---|---|
| `/` | Landing page (first page people see) |
| `/app/` | Student and staff app (Flutter web) |
| `/dashboard/` | USM Security dashboard |
| `/t/<token>` | Trusted-contact tracking links |

Three free services are used: **Supabase** (database, login, photo storage),
**Render** (the Node server: API, live updates, ETA watchdog) and **Netlify**
(the website files). Do the steps in order; each step needs an address from
the one before. Keys are typed into those services' dashboards only, never
into chat, code or git.

## 1. Supabase project (database and login)

1. supabase.com > **New project**. Region **Southeast Asia (Singapore)**.
   Save the database password somewhere safe.
2. From the repository folder, link it and create the tables
   (the project ref is in the project URL, `https://<ref>.supabase.co`):

   ```bash
   npx supabase link --project-ref <ref>
   ```

   ```bash
   npx supabase db push
   ```

3. **Authentication > Sign In / Providers > Email**: for a demo, turn
   **Confirm email** off. Supabase's built-in email sends only a few emails
   per hour, so confirmations would get stuck. Turn it back on once a real
   SMTP sender is set (Authentication > Emails > SMTP Settings).
4. **Security staff**: SQL Editor:

   ```sql
   insert into public.security_staff (admin_email, full_name, role)
   values ('officer@example.com', 'Officer name', 'SECURITY_ADMIN');
   ```

   Then **Authentication > Users > Add user > Create new user** with the same
   email, tick **Auto Confirm User**.
5. Note down (Project Settings > API Keys, and the **Connect** button):
   - Project URL `https://<ref>.supabase.co`
   - **Publishable** key `sb_publishable_...` (public, goes in the website)
   - **Secret** key `sb_secret_...` (server only, report photos)
   - **Session pooler** connection string (port 5432). Render cannot reach
     the "Direct connection" address.

## 2. Render (the server)

1. render.com > **New > Blueprint** > connect GitHub > repository
   `Hooiqi/SafeWalk`, branch with this code. Render reads `render.yaml`.
2. Fill in the values it asks for:
   - `DATABASE_URL`: the Session pooler string, with your database password
   - `SUPABASE_URL`: `https://<ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: the **secret** key
   - `CORS_ORIGINS` and `TRACKING_PAGE_URL`: put `https://example.com` and
     `https://example.com/t/` for now; step 4 replaces them.
3. Deploy. When it is live, open `https://<server>.onrender.com/health`:
   it must show `{"status":"ok"}`. Note the server address.

**Free plan limit:** Render's free server sleeps after 15 minutes without
visits and takes about a minute to wake. While asleep, the ETA watchdog does
not run, so an overdue walk is escalated only when it wakes. For a demo, keep
it awake with a free monitor (for example UptimeRobot, a check of `/health`
every 5 minutes), or use Render's Starter plan.

## 3. Build the website (on the laptop)

1. Copy `deploy/site.example.json` to `deploy/site.json` and fill in:
   `API_URL` (the Render address), `SUPABASE_URL` and the **publishable** key.
   This file holds only public values and is not committed.
2. Build everything into the `site` folder (needs Node and Flutter):

   ```bash
   npm run build:site
   ```

3. Go to **app.netlify.com/drop**, sign in, and drag the **`site` folder** onto
   the page. Then **Site configuration > Change site name**, for example
   `safewalk-usm`, giving `https://safewalk-usm.netlify.app`.

To update the website later: run `npm run build:site` again and drag the
`site` folder onto the site's **Deploys** page.

## 4. Connect the pieces

1. Render > the server > **Environment**:
   - `CORS_ORIGINS` = `https://safewalk-usm.netlify.app`
   - `TRACKING_PAGE_URL` = `https://safewalk-usm.netlify.app/t/`

   Save; Render restarts the server.
2. Supabase > **Authentication > URL Configuration**:
   - Site URL: `https://safewalk-usm.netlify.app/app/`
   - Redirect URLs: add `https://safewalk-usm.netlify.app/**`

## 5. Check it

- `https://safewalk-usm.netlify.app/` shows the landing page; its buttons open
  the app and the dashboard.
- Create a student account in the app, sign in, allow location.
- Sign in to `/dashboard/` as the staff account; pin the safe points
  (Safe points page), or load the ones pinned locally (see below).
- Start a journey, open the shared link on another phone: the live map loads.
- Raise an SOS: the dashboard alarm sounds.

Phones only allow location on `https://` sites, which Netlify provides.

## Safe points pinned on a laptop

The cloud database starts with the 21 places but no map positions. Either pin
them again on the online dashboard, or export them from the local database
(Studio > Table Editor > `safe_point` > Export as CSV) and turn the
coordinates into a migration so every database gets them.
