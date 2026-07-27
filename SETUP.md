# Setup — step by step

Three things to configure: a Gemini key, a Supabase project, and the Vercel
deployment. About 10 minutes total.

---

## 1. Gemini API key (free)

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with a Google account.
3. Click **Create API key** → **Create API key in new project**.
4. Copy the key (starts with `AIza...`).

That is the free tier. No billing setup, no card. The limits are roughly 10–15
requests per minute and a few hundred per day, which is fine for demoing —
one teardown uses about 12–18 requests.

> If you hit a rate-limit error mid-run, wait a minute and run it again, or set
> `GEMINI_MODEL=gemini-2.0-flash` which has a higher per-minute allowance.

---

## 2. Supabase project

### 2a. Create the project

1. Go to **https://supabase.com/dashboard** and sign in.
2. **New project**. Give it a name (`firmscope`), set a database password
   (save it somewhere, though this app does not need it), pick the region
   closest to you, and create.
3. Wait ~2 minutes for it to provision.

### 2b. Create the tables

1. In the left sidebar click **SQL Editor**.
2. Click **New query**.
3. Open [`supabase/schema.sql`](supabase/schema.sql) from this repo, copy the
   **whole file**, and paste it into the editor.
4. Click **Run**.

You should see `Success. No rows returned`. To confirm, open **Table Editor** in
the sidebar — you should now see `teardowns` and `teardown_events`.

Both tables have RLS enabled with **no policies**, which denies all browser
access. That is deliberate: this app only ever reaches Supabase from the server
using the service-role key, which bypasses RLS. Do not add public policies
unless you are also adding user accounts.

### 2c. Copy the two values you need

In the left sidebar, click the gear icon (**Project Settings**):

| Value | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Data API** → *Project URL* (looks like `https://abcdefgh.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **API Keys** → the **`service_role`** key. Click *Reveal* and copy it. |

⚠️ The `service_role` key bypasses all row-level security. Keep it server-side
only. It is deliberately **not** prefixed with `NEXT_PUBLIC_` so Next.js will
never ship it to the browser. Never paste it into client code, and never commit
`.env.local`.

---

## 3. Run it locally

```bash
cd firmscope
npm install
cp .env.example .env.local
```

Open `.env.local` and fill in:

```
GOOGLE_API_KEY=AIza...
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

Then:

```bash
npm run dev
```

Open http://localhost:3000, paste a law firm URL, and run a teardown. When it
finishes, check **Table Editor → teardowns** in Supabase — the row should be
there.

---

## 4. Deploy to Vercel

### 4a. Push to GitHub

```bash
cd firmscope
git init
git add .
git commit -m "FirmScope: law firm SEO teardown deep agent"
git branch -M main
git remote add origin https://github.com/<you>/firmscope.git
git push -u origin main
```

`.gitignore` already excludes `.env*` files, so your keys will not be committed.

### 4b. Import into Vercel

1. Go to **https://vercel.com/new**.
2. Import the `firmscope` repository.
3. **Before clicking Deploy**, expand **Environment Variables** and add all three:

   - `GOOGLE_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

4. Click **Deploy**.

Framework preset, build command, and output directory are all detected
automatically — leave them alone.

### 4c. Check it

Open the deployed URL and run a teardown. If it fails:

| Symptom | Cause |
| --- | --- |
| "GOOGLE_API_KEY is not configured" | Env var missing in Vercel, or you added it after deploying — redeploy. |
| "rate limit was hit mid-run" | Gemini free tier. Wait a minute and retry. |
| Teardown renders but says "not saved — Supabase off" | Supabase env vars missing or wrong. |
| "connection closed before the run finished" | The run exceeded the function time limit. Retry, or try a smaller site. |

> If you change an environment variable in Vercel, you must **redeploy** for it
> to take effect. Deployments → ⋯ → Redeploy.
