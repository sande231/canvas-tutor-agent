# Canvas Tutor Agent

A student study canvas prototype that can connect to Canvas LMS through a local proxy.

## Run In Codex

From this folder:

```bash
node server.js
```

Open:

```text
http://127.0.0.1:4177
```

Use this Node preview URL for Canvas connection. Do not use the `file://` page or the older Python preview ports.

If the port is busy, run with another port:

```bash
node server.js 4180
```

## Work Later

When you come back another day:

```bash
cd /Users/sandeep/Documents/Codex/2026-05-12/can-you-give-me-some-ideas
node server.js
```

Then open the local URL printed in Terminal. If the port is busy, use a new one:

```bash
node server.js 4188
```

Keep your private keys in `.env`. Do not paste Canvas tokens, Resend keys, or SMTP passwords into GitHub.

## Canvas Connection

In the app, enter:

- School Canvas URL, for example `https://your-school.instructure.com`
- Canvas access token from your own Canvas account

Click **Connect**, then **Import Work**.

The app sends Canvas requests through the local `/api/canvas` proxy in `server.js`, which avoids direct browser CORS failures.

After Canvas connects, the tutor panel shows your active Canvas courses as **Study Areas**. Pick a course to get a focused breakdown of upcoming assignments and what to study first.

Each course also has **Assignment Coach**:

- Reads upcoming assignments for the selected course
- Reads Canvas modules and module items
- Opens readable module content such as pages, assignment descriptions, discussions, quizzes, and file metadata
- Reads posted course notes from Canvas pages, announcements, and discussion posts
- Matches useful module material to the assignment
- Shows related posted notes to review before starting
- Explains the assignment in plain language
- Builds an assignment workspace with Understand First, Do The Work In Parts, Quiz Prep, and Before You Submit sections
- Creates practice questions from assignment instructions and related module material
- Builds a step-by-step assignment plan
- Shows rubric/full-credit clues when Canvas exposes a rubric
- Can add the plan to the canvas or start a Focus Sprint for that assignment

Each selected course also shows **Select Module**:

- Pick a Canvas module
- Load the course module outline quickly before deeply reading large module files
- Study the selected Canvas module
- Show how many module items were scanned and how many exposed readable content
- Open Canvas module files through the local proxy when Canvas allows downloads
- Read full text from text/HTML/RTF-style files
- Parse `.ipynb` notebooks into markdown and code cells
- Extract text from normal text-based `.pdf` files and slides when Canvas allows downloads
- Read source-code files such as `.py`, `.js`, `.ts`, `.java`, `.c`, `.cpp`, `.cs`, `.sql`, and `.r`
- Open `.zip` files and extract useful coding/text files inside
- Mark scanned PDFs/DOCX/slides as needing OCR or a document parser instead of pretending to read them
- Generate deeper study notes from that module
- Extract key points and key terms
- Generate a separate flashcard deck directly from readable module facts
- Create source-based multiple-choice quiz questions from sentences inside module pages/files/PDFs/notebooks
- Build learning goals, core concept explanations, coding practice tasks, and common mistakes
- Add the generated module note to the canvas

## Daily Focus Mail

Use **Daily Focus Mail** after Canvas is connected:

1. Add your email.
2. Choose a daily send time.
3. Click **Schedule**.
4. Click **Test Mail** to generate one immediately.

If email sending is not configured, the app saves `.eml` drafts in `outbox/`.

The daily email sends exactly **5 Canvas Tutor key points** at your selected time, including what to start first, which course/module to study, what to prepare next, and one end-of-day Canvas check.

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

## Deploy To Render

This project includes `package.json` and `render.yaml` so Render can run it as a Node web service.

Recommended Render settings:

- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `RESEND_API_KEY`
- Environment variable: `EMAIL_FROM`

Do not add Canvas access tokens to Render environment variables. Each student should enter their own Canvas URL and token in the app.

## Files

- `index.html` - app shell and controls
- `styles.css` - layout and visual styling
- `app.js` - canvas notes, tutor actions, and Canvas client logic
- `server.js` - static file server, local Canvas API proxy, and daily digest scheduler
- `package.json` - Node start/check scripts for local use and Render
- `render.yaml` - Render web service blueprint
- `.env.example` - private email configuration template
