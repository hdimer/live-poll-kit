# Live Poll Kit

A drop-in live polling system for presentations, webinars, and classrooms. Visitors scan a QR code on your slide, answer on their phone, results update live. No accounts, no signup, no per-respondent cost.

Built on Vercel + Neon Postgres. Three HTML pages, two API endpoints, one schema. Deploys in five minutes.

## What it does

- **Multiple choice polls** with bar chart results
- **Word clouds** (open-ended text, sized by frequency)
- **Question groups** so you can chain several polls under one QR code
- **Two flows**: presenter-controlled (you advance manually) or auto-advance (audience self-paces)
- **QR code generator** that points to the right poll URL
- **Admin panel** to create, edit, activate, and reset questions
- **Public results page** for displaying live results full-screen

## Pages

| Path | Who it's for | What it does |
|------|-------------|-------------|
| `/poll-admin` | You | Create events, groups, questions. Generate QR codes. Activate questions in real time. Password-protected. |
| `/poll?id=<question-id>` | Audience | Vote on a single question. |
| `/poll?group=<group-id>` | Audience | Vote on a sequence of questions (the group). |
| `/poll-results?id=<question-id>` | Your screen | Show live results full-screen on the projector. |
| `/api/poll-qr?id=<question-id>` | Slides | SVG QR code pointing to the poll URL. Embed via `<img src="...">`. |

## Setup (5 minutes)

### 1. Get a database

Sign up free at [neon.tech](https://neon.tech). Create a project. Copy the connection string.

In the Neon SQL editor, paste and run the contents of `schema.sql`.

### 2. Deploy to Vercel

```bash
git clone <this-repo>
cd live-poll-kit
npm install
vercel
```

When prompted, link to a new project. After the first deploy, set environment variables:

```bash
vercel env add DATABASE_URL          # paste the Neon connection string
vercel env add ADMIN_SECRET          # any strong password you'll remember
vercel deploy --prod
```

That's it. Your site is live.

### 3. Use it

1. Open `https://yourdomain.com/poll-admin`
2. Enter the admin password (the value of `ADMIN_SECRET`)
3. Create an event, a group, and your first question
4. Right-click the QR code → "Save image as..." and drop it on your slide
5. When the slide goes up, click "Activate" in the admin panel
6. Watch responses come in

## Using QR codes in slides

For a slide-friendly QR code that always points to your active poll, embed:

```html
<img src="https://yourdomain.com/api/poll-qr?group=<group-id>" alt="Scan to vote" />
```

The `group` param means the QR stays stable across all questions in that group. The audience scans once, then answers each question as you activate it.

For a single-question QR (different image per question), use `?id=<question-id>` instead.

## Presenter flow vs auto-advance

- **Presenter mode** (default): you click "Activate" on each question when you're ready. The audience sees a "Waiting..." screen until then.
- **Auto-advance mode**: set on a group. The audience walks through all questions at their own pace as soon as they scan. Useful for pre-meeting surveys or async use.

Change the mode on a group from the admin panel.

## File map

```
api/
  _db.js           Neon connection helper
  poll.js          REST API for events, groups, questions, votes, results
  poll-qr.js       SVG QR code generator
public/
  poll.html        Public voting page (audience)
  poll-admin.html  Admin panel (you)
  poll-results.html Live results display (projector)
schema.sql         Database tables
vercel.json        Routes and CORS headers
```

## Customizing

**Visual styling.** The HTML files use CSS variables at the top of each `<style>` block. Change `--copper`, `--black`, etc. to rebrand.

**Domain in QR codes.** The QR generator infers the host from the request headers. If you want to hardcode a different URL (e.g., a marketing domain), set `PUBLIC_BASE_URL` in your env.

**Replacing the database.** The API uses `@neondatabase/serverless` because it works well on Vercel Functions. To swap to a different Postgres provider, edit `api/_db.js`. The schema is plain Postgres, no extensions required beyond `pgcrypto` (already available on Neon for `gen_random_uuid`).

## Limitations

- **No per-user identity.** Anyone with the URL can vote, and they can vote multiple times. Add a `device_id` cookie or auth layer if you need to prevent that.
- **No real-time push.** The voting/results pages poll the API on an interval. Fine for live audiences (you can see the numbers tick up). Not designed for thousands of concurrent voters.
- **No rate limiting.** Add Vercel's [Edge Config](https://vercel.com/docs/storage/edge-config) or a simple in-memory limiter if you're worried about spam.

## License

MIT. Use it however you want. A nod back if it helped is appreciated but not required.

## Credit

Extracted from [haimdimer.com](https://haimdimer.com), originally built for a live webinar series. If you ship something interesting with this, let me know.
