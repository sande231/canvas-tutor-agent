# Email and deployment

[Back to README](../README.md) · [Configuration](CONFIGURATION.md)

These are optional, existing mail features. `npm run preview` disables all email
and draft creation in that process; normal `npm start` enables the scheduler.
If `.env` already exists, edit it rather than copying over it.

**Credential storage:** scheduling mail in a normal server process writes the
Canvas token with the digest settings to the ignored `daily-digest-config.json`.
Environment-based deployments also supply a server-side Canvas token. This is
separate from the in-memory browser connection. Do not commit these credentials.

**Mac portability:** the existing installer, uninstaller and launchd plist use
machine-specific project/executable locations. Inspect and adapt them before using
these instructions on a different machine. This documentation task does not edit
or run those scripts. The underlying schedule remains unchanged.

The GitHub workflow uses Node 22.13.0, matching the package's minimum. This was the
only email-area code change during the reader updates; SMTP, scheduling, scripts
and launchd behavior were preserved.

The following mail/deployment instructions are retained verbatim from the previous
README. See [limitations](LIMITATIONS.md) before exposing the app publicly.

## Daily Focus Mail

Use **Daily Focus Mail** after Canvas is connected:

1. Add your email.
2. Choose a daily send time.
3. Click **Schedule**.
4. Click **Test Mail** to generate one immediately.

If email sending is not configured, the app saves `.eml` drafts in `outbox/`.

The daily email sends a **Canvas To Do** list plus **5 Canvas Tutor focus points** at your selected time. It includes upcoming Canvas items, course names, item types, due dates, Canvas links when available, what to start first, what to prepare next, and one end-of-day Canvas check.

Use **Mail Status** to see whether the app is in real-email mode or draft-outbox mode, and to view recent saved drafts.

To send real email, copy the example config:

```bash
cp .env.example .env
```

Then fill in either SMTP or Resend settings in `.env` and restart:

```bash
node server.js
```

SMTP example for Gmail:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
EMAIL_FROM="Canvas Tutor <your_email@gmail.com>"
```

Resend example:

```text
RESEND_API_KEY=re_your_key
EMAIL_FROM="Canvas Tutor <you@your_verified_domain.com>"
```

Use **Mail Status** after restarting to confirm it says real email instead of draft outbox.

The daily schedule runs only while `node server.js` is running.

### Background Daily Email On Mac

You can keep daily Canvas To Do emails running even when the browser tab is closed by installing the background mail agent:

```bash
./scripts/install-background-mail.sh
```

It starts the app in the background at:

```text
http://127.0.0.1:4200
```

The background agent starts when you log in and keeps the daily scheduler alive while your Mac is awake. If your Mac is asleep or powered off at the scheduled time, the local scheduler cannot send mail. For always-on mail, deploy the app to Render.

To remove the background agent:

```bash
./scripts/uninstall-background-mail.sh
```

To temporarily test Canvas To Do email every 2 minutes:

```bash
node scripts/enable-two-minute-mail-test.js
```

When testing is done, restore the normal daily schedule:

```bash
node scripts/restore-daily-mail.js
```

## Deploy To Render

This project includes `package.json` and `render.yaml` so Render can run it as a Node web service.

Recommended Render settings:

- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `RESEND_API_KEY`
- Environment variable: `EMAIL_FROM`
- Environment variable: `CANVAS_BASE_URL`
- Environment variable: `CANVAS_TOKEN`
- Environment variable: `DIGEST_EMAIL`
- Environment variable: `DIGEST_TIME` with value `07:30`
- Optional environment variable: `DIGEST_PROFILE_NAME`

For a personal always-on daily email, add your own Canvas token to Render environment variables. Do not commit it to GitHub. For a multi-student app, each student would need their own secure login/token flow instead of shared environment variables.

Render note: Free web services can spin down after inactivity. For the most reliable scheduled email, use a paid always-on web service or a Render Cron Job/service design.

This repo also includes a Render Cron command for daily email:

```bash
npm run send-digest
```

The `render.yaml` blueprint includes a cron service named `canvas-tutor-agent-daily-email`. Render cron schedules use UTC, so the included `30 11 * * *` schedule is 7:30 AM Eastern during daylight saving time. Adjust it in the Render dashboard if needed.

## Free Cloud Daily Email With GitHub Actions

For a no-cost setup that works even when your Mac is asleep, use the included GitHub Actions workflow:

```text
.github/workflows/daily-canvas-todo.yml
```

It runs `npm run send-digest` every day at `30 11 * * *`, which is 7:30 AM Eastern during daylight saving time. It can also be run manually from the GitHub **Actions** tab.

Add these repository secrets in GitHub:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `CANVAS_BASE_URL`
- `CANVAS_TOKEN`
- `DIGEST_EMAIL`
- `DIGEST_PROFILE_NAME`

GitHub Actions cron uses UTC, so adjust the cron time when daylight saving time changes if you want the email to stay exactly at 7:30 AM Eastern.
