# Canvas Tutor

A student study canvas prototype that can connect to Canvas LMS through a local proxy.

## Safe Local Preview

Run `npm run preview` and open http://127.0.0.1:4177 (or use
`npm run preview -- 4188` for a different port). This binds to localhost and sets
`EMAIL_DISABLED=1`, which blocks the scheduler, Schedule/Test Mail endpoints,
email delivery, and draft creation, even when `.env` has provider credentials.
Canvas and tutor features remain available. Mail Status reports `disabled`.
The saved digest config/state are not changed. Stop with Ctrl+C.

Normal `npm start` / `node server.js` launches enable the scheduler, which checks
saved configuration every minute. Preview mode only affects this process; it
does not disable separately installed launchd jobs or cloud schedules.

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
cd /Users/sandeep/Documents/Codex/2026-05-12/canvas-tutor
node server.js
```

Then open the local URL printed in Terminal. If the port is busy, use a new one:

```bash
node server.js 4188
```

Keep your private keys in `.env`. Do not paste Canvas tokens, Resend keys, or SMTP passwords into GitHub.

## Board Notes and Grades

Study-board cards are saved locally in this browser and restored after refresh.
Use each card's Edit/Delete buttons; dragging, Auto Layout, and Reset Board also
save the resulting board. Only note fields are stored, not connection credentials.
Malformed saved entries are skipped. If browser storage is blocked or full, the
board remains usable but changes cannot persist. Storage is specific to the
browser and origin (including the preview port).

The Student Success Center shows a points-weighted **Graded-only average** of
loaded assignments, excluding missing/blank scores and including real zeroes.
This is not the full Canvas course grade: the current scan loads upcoming work.
When no eligible grades exist, it displays **No graded work**.

Run focused checks with `node --test tests/board-grades.test.js`.

## Canvas Connection

In the app, enter:

- School Canvas URL, for example `https://your-school.instructure.com`
- Canvas access token from your own Canvas account

Click **Connect**, then **Import Work**.

The app sends Canvas requests through the local `/api/canvas` proxy in `server.js`, which avoids direct browser CORS failures.

Use the **Agent** tutor tool to explain the project, diagnose Canvas reader problems, list what has already been fixed, and show which module files are still blocked or unreadable.

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
- Read `.txt`, `.md`, `.csv`, `.json`, `.html`, and other plain text files
- Extract text from normal text-based `.pdf` files and slides when Canvas allows downloads
- Extract text from `.docx` Word documents
- Extract text from `.pptx` PowerPoint slides
- Use optional OCR for image files when Tesseract is installed locally
- Read source-code files such as `.py`, `.js`, `.ts`, `.java`, `.c`, `.cpp`, `.cs`, `.sql`, and `.r`
- Open `.zip` files and extract useful notebooks, coding files, text files, PDFs, DOCX, PPTX, and images inside
- Mark scanned PDFs/images as needing OCR instead of pretending to read them
- Generate deeper study notes from that module
- Extract key points and key terms
- Generate a separate flashcard deck directly from readable module facts
- Create source-based multiple-choice quiz questions from sentences inside module pages/files/PDFs/notebooks
- Build learning goals, core concept explanations, coding practice tasks, and common mistakes
- Add the generated module note to the canvas

OCR note: text-based PDFs, DOCX, PPTX, notebooks, text files, code files, and zip contents can be read directly. Image files use OCR only if Tesseract is installed on the machine running the app. Scanned PDFs may still need OCR/PDF image conversion tooling.

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

## Files

- `index.html` - app shell and controls
- `styles.css` - layout and visual styling
- `app.js` - canvas notes, tutor actions, and Canvas client logic
- `server.js` - static file server, local Canvas API proxy, and daily digest scheduler
- `package.json` - Node start/check scripts for local use and Render
- `render.yaml` - Render web service blueprint
- `.env.example` - private email configuration template

## Application Navigation

Connect opens the dashboard in the same tab. The dashboard lists active Canvas
courses independently of upcoming assignments, with a separate seven-day deadline
list. The sidebar provides Settings, Study Board, Focus Sprint, Tutor Tools, and
course pickers for Planner, Goals, and Resources. Course workspaces have Overview,
Assignments, Modules, AI Tutor, Flashcards, Quizzes, Notes, Study Plan, Goals, and
Resources navigation. Tutor output expands in a collapsible panel. Shared rooms
and study buddies are explicitly Coming soon.

View navigation uses URL fragments containing only view names and course IDs;
browser Back works, and tokens remain in memory. After a full refresh, reconnect
to use Canvas; saved notes remain accessible without reconnecting. Settings shows
mail disabled in the safe preview. Arrange spaces board cards using measured card
heights, and focused cards can be moved with arrow keys.

The DOM integration check uses mocked Canvas responses and no real credentials.
To run it without adding application dependencies:

```bash
npm install --prefix /tmp/canvas-ui-check jsdom --no-audit --no-fund
NODE_PATH=/tmp/canvas-ui-check/node_modules node --test tests/navigation.test.js
node --test tests/board-grades.test.js
npm run check
```

These checks cover authentication errors and success, courses without deadlines,
course tabs and scoping, Back/dashboard navigation, note restoration, arrangement,
and disabled mail. They do not replace a visual browser check or a live Canvas test.

## Automatic Module Reading

Use Node 22.13+ and run `npm install` (PDF.js is now a runtime dependency).
Selecting a module loads every page of its item list, then retrieves Canvas page
bodies, discussion messages, assignment/quiz descriptions and files. Section
headings are skipped. AI Flashcards and AI MCQ Quiz refresh this selected module
before generation; switching modules or navigating discards stale results.

Public ExternalUrl sources are retrieved without Canvas credentials. Each redirect
is validated, private/reserved IPv4 destinations and IPv6 destinations are blocked,
and DNS answers are pinned to the connection. Downloads are limited to 20 MB and
five redirects. Login pages, denied requests, unsupported formats and empty bodies
show recovery instructions; uploading an accessible copy remains a fallback.
Scanned PDFs still require OCR or a text-based copy. External pages requiring
JavaScript/browser login cannot be read automatically.

PDF.js extracts PDF text with page labels. Office ZIP reading supports data
descriptors, DOCX bodies and numbered PPTX slides. Notebook and plain-text readers
remain supported. AI input is excerpted to at most 12,000 characters per source
and 45,000 total. The source report distinguishes readable, blocked and heading
items. Generated cards/questions show source titles, available page/section labels,
and supporting excerpts. The server rejects citations not found in the provided
source and quizzes whose answer is not among their choices. These checks do not
prove every model interpretation correct.

Run all offline checks (using the temporary jsdom setup described above):

```bash
NODE_PATH=/tmp/canvas-ui-check/node_modules node --test tests/*.test.js
```

Live verification: connect privately, open COSC201 → Week 4, then choose AI
Flashcards or AI MCQ Quiz. Check the discussion and external-link reading statuses
and Sources used. No real Canvas token or AI provider call is used by the tests.

### Flashcard / quiz failure repairs

The Responses request now includes an explicit JSON instruction in its input
message and a complete source-citation structure. Malformed, incomplete, refused,
empty or ungrounded output is shown as an error. Flashcards reveal their answers;
quizzes accept a choice before displaying correctness, explanation and citation.
Generated practice remains available when returning to the same course/tool tab.

File reading distinguishes metadata denial from download denial. It preserves
signed query strings, resolves `public_url` JSON to a real download URL, and retries
with freshly fetched metadata before reporting download failure. A sanitized
per-item trace reports stages and status codes, never tokens or signed URLs.

Legacy binary `.ppt` now uses **LibreOffice first**. LibreOffice 26.8.0.3 is
installed at `/Applications/LibreOffice.app`; the server detects its `soffice`
executable automatically. It converts binary presentations to PPTX, then uses
our existing slide and speaker-note extraction. On another machine, install
LibreOffice or set `LIBREOFFICE_PATH` to its `soffice` executable.

Conversion uses an isolated temporary profile, a 45-second limit, bounded output
and automatic cleanup. If conversion fails or produces no text, the installed
**catppt** reader remains available as a fallback. Image-only, encrypted or
damaged files can still require OCR or an unlocked text-based export.

`npm run setup:ppt` installs the small fallback reader (catdoc 0.97.2) into ignored
`.tools/catdoc`, using a pinned, checksum-verified release. It requires a C compiler
and make. Alternatively set `CATPPT_PATH` to an existing executable. catppt output
uses extracted **section** references because its stream does not reliably
preserve visible slide numbers and may include retained revision text; identical
blocks are deduplicated. Restart `npm run preview` after installing either reader.

To make room for LibreOffice, eight unused August Codex updater-cache copies were
removed (4.54 GiB recovered). Personal files and project data were preserved.
The official installer checksum was verified before direct installation from its
DMG after Homebrew's unpack step failed.

Public Google Drive/Docs/Slides viewer links are resolved to download/export URLs,
retaining resource keys. Simple linked documents in public HTML viewers can be
followed through the same destination checks. Login, error and short/meaningless
viewer text is rejected and never sent to AI as study content. This quality filter
is deliberately conservative; a very short legitimate note can also be excluded.

`tests/generation-regression.test.js` exercises actual request construction,
upstream errors, stale download recovery, permission denial, unusable viewers,
conversion dispatch, and Create-button → validated-server-response → interactive
rendering. Test study text and credentials are synthetic. A live OpenAI smoke test
with synthetic text returned four validated flashcards. The saved Canvas token
returned 401/expired, so the two actual Week 2 downloads were not live-verified.

### Student-focused study cards

Study Module and manual-upload study actions now use the same AI generation path
as Create flashcards, replacing the old template cards built from filenames and
slide-title fragments. Study results show important points and concept questions
with revealable answers. Source evidence and reading diagnostics are collapsed.
Important points and cards are checked against the selected module sources;
filename questions, repeated prompts and slide-index answers are rejected.
PowerPoint extraction includes linked speaker notes and removes slide-number,
date and footer placeholders. Heading-only decks are flagged as insufficient
instead of generating invented explanations. Existing board notes remain saved;
reopen a module to regenerate its study content with the new flow.

### Generation wait and recovery

Each request now asks for only the selected tool: up to five flashcards (plus
important points) or five quiz questions. GPT-5 requests use low reasoning effort;
the configured model is unchanged. The UI shows elapsed generation time and a
Cancel button. A 75-second server deadline covers both the provider request and
response body; an independent 85-second browser deadline prevents indefinite
loading if the proxy connection stalls. Failures show Retry, cancellation ignores
late results, and navigating away aborts the active browser generation request.
No template or invented questions are substituted on failure.

### Passage citations and generation verification

AI requests label actual source passages with request-local IDs. The model selects
a supporting passage; the server attaches its original text, filename and section.
This avoids discarding otherwise valid questions due to retyped-quote formatting
or numeric source IDs. Unknown or mismatched references remain rejected. Quiz
answer letters A–D are resolved to the corresponding choice; arbitrary invalid
answers are rejected. No generic fallback cards are substituted.

27 focused checks pass, including a real binary PPT extraction, passage references,
incorrect references, interactive flashcards/quiz answers, module switches, saved
notes, failed downloads and empty sources. Live calls to the configured model
using synthetic 9,570-character EDA material returned five cards and five quiz
questions in about seven seconds each. This does not verify private Week 2/5
Canvas files or external links; those must be retried in the connected preview.

A DOM-based live check also exercised both Create buttons through the running
preview and real AI service with synthetic Canvas page content: five visible
flashcards, five quiz questions, answer reveal, quiz feedback, and return-to-tab
retention all passed. Run `npm test` for the offline regression suite.

### Practice counts and AI availability

Choose 5, 10, 15, 20 or 30 cards/questions, or a custom count from 1 to 50,
and easy, medium, hard or mixed difficulty before generating. These preferences
are saved in this browser independently of notes; credentials are not saved
with them. The options also appear beside the AI buttons for uploaded material.
Settings and the AI Tutor tab show whether the server has an AI key configured
and which model it uses (`GET /api/ai-status`). This checks configuration, not
whether the provider will accept the key.

Generation runs sequential batches of at most 10, passing earlier questions to
avoid repetition and merging distinct, validated results. Two additional calls
at most can fill a shortfall. Cancel keeps completed items; switching modules
still discards late results. The displayed “Made N of M” count reports shortages
and provider failures without inventing replacement questions. Phase 3 indexes the extracted passages from across each source before selecting
concepts and supporting evidence for generation; it no longer uses the old
12,000-per-source / 45,000-total prefix excerpts.

The backend uses the Responses API's strict `text.format` JSON schema. The
configured default, `gpt-5-mini`, supports this format; an explicit unsupported
schema/model response triggers one fallback to JSON mode. Both paths use the
same grounding validation and server-attached source passages. See OpenAI's
[structured output guide](https://developers.openai.com/api/docs/guides/structured-outputs)
and [GPT-5 mini model capabilities](https://developers.openai.com/api/docs/models/gpt-5-mini).
Output budgets include reasoning headroom. An incomplete response records its
`incomplete_details.reason` (without content or secrets) and retries once with
fewer items. HTTP 429/5xx responses get one short delayed retry. All retries for
one batch share a 75-second server deadline; completed browser batches survive
later failures. See [reasoning token budgets](https://developers.openai.com/api/docs/guides/reasoning).

Phase 1 regression tests use mocked Canvas and OpenAI responses, including the
full 20-question module-to-quiz flow, smaller retries, top-ups, cancellation,
partial results and configuration checks. They do not establish live model
latency, account access or whether a particular module supports the chosen count.

### Full source extraction and session cache (Phase 2)

The reader retains full extracted text up to explicit safety limits. These are
separate from AI request sizes. Phase 3 indexes these passages in bounded
batches instead of sending only file prefixes. PDFs inside ZIP archives use
PDF.js, just like standalone PDFs.
Plain text and code preserve their complete bodies, rather than a code summary.

Canvas page, assignment and discussion headings appear as `Section: …` lines.
Same-origin Canvas `/files/<id>` links become child sources and use the normal
authenticated file-download route. Downloads are deduplicated by file ID within
the selected module; linked files are not crawled recursively. Four workers read
module items with progress updates. Extracted module content stays in memory for
the authenticated session, so **Generate again** reuses it. **Re-read module**
refreshes the Canvas material and clears session-generated practice; Phase 4 saved
sets remain reviewable until replaced. Reconnecting invalidates the extraction cache. Reloading the app also clears this cache.
Saved study notes are independent and remain in localStorage.

The source report shows extracted characters, page/slide counts when available,
notebook cells or archive members, and any safety truncation. Archive details
also show the individual file reports. No page count is invented for formats
such as plain text or DOCX, whose pagination depends on rendering. Image-only or
inaccessible material can still be unreadable; a successful download alone does
not count as usable study material.

All extraction limits are collected in `readerDefaults` near the top of
`server.js`. Override any key using `READER_<KEY>` in the server environment or
private `.env`, then restart. Values must be positive integers; invalid values
use the defaults. No dependencies were added.

| Reader setting | Default |
| --- | ---: |
| `READER_PDF_PAGES` | 2,000 pages |
| `READER_PDF_CHARS`, `READER_OFFICE_CHARS` | 2,000,000 characters each |
| `READER_NOTEBOOK_CELLS` | 20,000 cells |
| `READER_NOTEBOOK_CHARS`, `READER_TEXT_CHARS`, `READER_CODE_CHARS` | 2,000,000 characters each |
| `READER_HTML_CHARS`, `READER_OCR_CHARS`, `READER_LEGACY_PPT_CHARS` | 2,000,000 characters each |
| `READER_ZIP_FILES` | 1,000 supported files |
| `READER_ZIP_FILE_CHARS` | 2,000,000 characters per file |
| `READER_ZIP_TOTAL_CHARS` | 10,000,000 characters |
| `READER_ZIP_ENTRIES` | 10,000 archive entries inspected |
| `READER_ZIP_ENTRY_BYTES` | 32,000,000 bytes per entry |
| `READER_ZIP_TOTAL_BYTES` | 128,000,000 expanded bytes |

Network-download limits and SSRF protections remain in `safe-reader.js`.


### Whole-module concept indexing (Phase 3)

Before generating new practice, Canvas Tutor reads and indexes the module's
extracted passages. Small modules index automatically; larger modules first show
the number of indexing calls and offer **Full (every page)**, selected by default,
or **Quick (a sample of each file)**. Full sends every extracted passage in
batches targeting 18,000 text characters (at most 20,000). Quick selects the
beginning, middle and end of each readable source. Both modes disclose their
passage coverage; unreadable content and extraction safety limits still apply.
The estimates count initial indexing calls; retries and generation are additional.

`source-index.js` is shared by browser and Node. `buildEvidencePassages` assigns
IDs from the source ID, passage number and SHA-256 fingerprint of its section and
text. Reordering sources does not change IDs; changed evidence gets a new ID.
`POST /api/ai-index` validates the passage bundle, requests structured concepts,
and checks every evidence reference using the existing grounding validator.
Unknown references and unsupported concepts are discarded. Source material is
untrusted data and cannot override the indexing instructions. Indexing uses the
same Responses API [strict structured output format](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
as practice generation, with the existing bounded retries and deadlines.

The browser shows “Indexing part N of M” and supports Cancel. Completed parts
remain in `module.index`; failed parts have individual Retry buttons. Resume
retries unfinished parts without repeating completed calls, or the student can
explicitly generate from the available concepts. Normalized concept names merge
across parts, preserving all evidence references and the most important
explanation. Full indexing means all selected text was submitted, not that a
model is guaranteed to extract every possible fact.

Generation gives each available source a turn, then allocates additional
concepts proportionally to source length, preferring important concepts within
each source. Each call includes at most ten selected concepts and only their
supporting passages. The evidence supporting a merged explanation is retained;
large evidence sets are grouped into more calls rather than cut off. Generated
items must reference a selected `conceptId` and evidence belonging to it. The
server attaches the original text. A concept produces at most one item per set,
so a small index may produce fewer items than requested.

Coverage reports count the actual generated items and cited sources, total
readable sources, available concepts, completed indexing parts and Quick/Full
mode. They do not imply that a short quiz covers every concept. **Generate
again** reuses the session index. Re-reading a module, adding an upload,
reconnecting, or reloading invalidates it; saved study notes remain independent.
Small direct API requests remain supported, but requests exceeding 20,000 text
characters must use indexing instead of being silently truncated.

Phase 3 fixture checks cover browser/Node ID parity, changed evidence, full and
sampled passage coverage, partial failures and retries, cancellation and stale
results, source weighting, multi-passage concept evidence, and a question citing
an important fact found only at the end of the final source. Live model quality,
latency and account access still need a live Canvas/OpenAI check.

### Practice modes and saved progress (Phase 4)

The practice options include question types and flashcard styles as well as count
and difficulty. Quiz types are multiple choice, multi-select, true/false with an
explanation, fill in the blank, short answer, code output, find the bug, scenario,
matching, and ordering. Card styles are term/definition, why/how, cloze, comparison,
example/concept, and code/meaning. Code options appear once the selected module's
readable sources contain code or notebooks. Preferences are stored separately from
credentials. Generation still indexes the full module, respects Cancel, uses
batches of at most ten, and validates every concept and source reference.

`practice-core.js` supplies the browser and Node with the same type contracts.
Each generated card/question includes `type`, `difficulty`, `conceptId` and its
source citation. Type-specific fields include `answers` for multi-select,
`acceptedAnswers` for blanks, `pairs` for matching, `steps` in correct order for
ordering, and `code` for code questions/cards. New Responses requests use strict
schema variants (`anyOf` within the item array), with the existing JSON fallback.
Old untyped four-choice/card results migrate to multiple-choice/why-how and medium
difficulty; explicitly unknown types or invalid difficulties are rejected.
`validateGroundedResult` is unchanged: the server resolves passage IDs and attaches
the original evidence. Quality instructions require plausible distractors, a
clear answer, varied cognitive levels, no catch-all choices, and explanations of
the answer and the strongest distractor or likely misconception.

**Quiz review:** choose one question at a time or all on one page, optionally set
a timer, and finish for a score. Choices are shuffled per attempt and their order
survives reload. Missed answers show the correct solution, explanation and source.
“Retry only missed” starts a smaller attempt without deleting the original quiz;
“Retry full set” returns to it. Unanswered questions count as missed. Multi-select,
matching and ordering use all-or-nothing scoring. Blanks accept the model's listed
alternatives, ignoring case and repeated whitespace.

Short answers call `POST /api/ai-grade`, using the question's original stable
passage ID and full cited passage. The server validates that evidence before asking
the configured model for correctness and feedback. Source content and student
answers are untrusted data. AI grading is a study aid, not an instructor's grade.
Failures or cancellation leave an answer pending, show a provisional score, and
allow retry; pending grades never count as recorded mistakes. Navigation discards
late grading results. This endpoint has bounded timeouts, one transient-error
retry and structured-output fallback, and keeps the OpenAI key on the server.

**Flashcard review:** click the card or press Space to flip. After revealing the
answer, 1 means “Still learning” and 2 means “Know it”. Misses return in the same
review and reset to box 1. Successful reviews move through five Leitner boxes with
1, 3, 7, 14 and 30-day intervals. The due-today count includes new cards; “Review all
cards” is available for extra practice. CSV export contains front, back and source
(including code where relevant), with quoted multiline fields and spreadsheet
formula protection. Map Front/Back when importing into Anki or Quizlet.

**Weak spots and exams:** completed results update correct/missed totals by
`conceptId`, scoped to the course and module. A concept is weak when its last
response was wrong or misses exceed successes. Course Overview lists weak concepts;
“Practise my weak spots” reuses their saved items. New generation gives weak
concepts priority within each source while preserving Phase 3's source allocation.
Exam mode on Quizzes combines saved quizzes from two or more selected modules,
removes repeated concept/type pairs, and attributes outcomes to their original
modules. Generate those module quizzes first; building an exam makes no AI call.

**Saving:** latest generated sets per tool, quiz responses/timer/progress, Leitner
boxes, and concept results are stored under
`canvasTutor.practice.v1.<courseId>.<moduleId>`. `normalizeSaved` uses explicit
allowlists rather than serializing connection, module or API response objects.
No Canvas token or OpenAI key is stored. Corrupt data is ignored safely. If browser
storage is blocked or full, practice continues in memory with a visible warning.
Saved practice is accessible from the sidebar and connection screen without a
Canvas login. Refresh clears Canvas authentication and the full extraction/index
cache, but saved sets and progress remain. Re-reading a module invalidates its
session index; previously saved practice remains available until replaced by a
new set. Local browser storage is not a cross-device backup.

Phase 4 tests mock network/API calls. They cover every type (valid and malformed),
20-item generation, all ten rendered question inputs, scoring/retries, scheduling,
keyboard flips, CSV, reload recovery, credential exclusion, blocked storage,
short-answer feedback/failures/cancellation/stale responses, weak priorities,
exam attribution, timers and static script delivery. Earlier UI tests were updated
intentionally to assert the new flip-card and scored-quiz behavior instead of
`<details>` cards and per-question answer buttons. Live Canvas access, real model
quality across each type, AI grading accuracy and visual browser QA still require
live verification. No dependencies, email/digest behavior or Phase 5 features were
added.
