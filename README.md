# Canvas Tutor

Canvas Tutor (`canvas-tutor-agent`) connects to Canvas LMS, reads a course module,
and makes cited study guides, quizzes and flashcards. Students can also ask the
module tutor questions, review mistakes, practise weak concepts and save study
material in their browser. It uses vanilla JavaScript and a plain Node server:
no framework and no build step.

## Run locally

Use **Node 22.13.0 or newer**:

```bash
npm install
npm run preview
```

Open [http://127.0.0.1:4177](http://127.0.0.1:4177). For another port, use
`npm run preview -- 4188`. Use this Node URL rather than `file://` or a static-only
server. Stop the preview with Ctrl+C.

`npm run preview` binds to localhost and sets `EMAIL_DISABLED=1`. It blocks the
scheduler, Schedule/Test Mail endpoints, email delivery and draft creation, even
if private provider credentials exist. Mail status reports `disabled`. It does
not modify saved digest configuration or affect separate processes, launchd jobs
or cloud schedules. **Normal `npm start` / `node server.js` enables the existing
scheduler.** Use the preview command for development.

Copy `.env.example` to a private `.env` to configure AI and optional reader tools,
then restart. `OPENAI_API_KEY` stays on the server; `OPENAI_MODEL` defaults to
`gpt-5-mini`. The optional multi-model picker was not added: one configured model
is used throughout indexing, generation, chat and short-answer grading.
Never commit `.env` or paste keys/tokens into GitHub.

## Connect and navigate

Enter your school Canvas URL and your own access token, then choose **Connect**.
The browser forwards that in-memory token through the authenticated Node proxy;
it does not substitute saved mail credentials. A Canvas 401 shows an error beside
Connect and stops automatic retries. Replace an expired token privately using
your Canvas account settings, then reconnect. Tokens are never placed in URLs or
browser storage. The OpenAI key is never sent to the browser.

Successful connection opens the dashboard in the same tab. It lists active
courses, including those without upcoming work, and a seven-day deadline list.
Click a course for Overview, Assignments, Modules, AI Tutor, Flashcards, Quizzes,
Notes, Study Plan, Goals and Resources. Sidebar views include Planner, Goals,
Resources, Study Board, Focus Sprint, Tutor Tools, Saved Practice and Settings.
Settings contains the connection and Daily Focus Mail controls. Tutor output is
collapsible; shared rooms and study buddies are labelled Coming soon.

Use Modules to inspect sources, Flashcards/Quizzes to choose practice options,
and AI Tutor to select a module for a guide or conversation. Files are read
through Canvas automatically. Manual upload is a fallback when you have a
permitted copy of a blocked source. Assignment planning still uses loaded
assignment descriptions, rubrics and related module material.

Navigation supports keyboard controls and browser Back; URL fragments contain
view and course IDs only. Refresh clears Canvas authentication and the session's
extraction/index cache. Reconnect for fresh Canvas data; saved board notes,
guides, cards, quizzes and progress remain available in the same browser/origin.

Board cards persist edits, deletions, dragging and layout changes. Malformed saved
data is ignored; blocked/full storage produces a visible warning. The board is a
separate view, with measured card heights for arrangement and arrow-key movement.
Graded-only averages exclude null/blank scores and include numeric zero. They
cover loaded assignments, not the complete Canvas grade; empty grades show
**No graded work**.

## Source access and supported formats

The reader paginates module items and reads Canvas pages, discussion bodies,
assignment/quiz descriptions and downloadable files. SubHeaders are headings,
not failed documents. Headings are retained, and same-origin `/files/<id>` links
inside page/assignment/discussion bodies become deduplicated child sources,
one level deep. Four readers run concurrently and the session cache is reused.
**Re-read module** refreshes sources and invalidates the session index.

| Format | Reader |
| --- | --- |
| PDF, including PDFs in ZIPs | PDF.js; optional OCR for pages without extracted text |
| DOCX | Document-body XML |
| PPTX | Slide text and linked speaker notes; optional OCR for slides without text |
| XLSX | Named worksheet XML, shared/inline strings, raw cell values and labelled formula caches |
| PPT, ODP | LibreOffice → PPTX; catppt remains a fallback for legacy PPT |
| DOC, RTF, ODT | LibreOffice → DOCX |
| XLS, ODS | LibreOffice → XLSX |
| IPYNB/PYNB | Markdown, code and raw cells |
| Text, Markdown, CSV, JSON, HTML, source code | Text extraction |
| PNG, JPEG, TIFF, BMP | Optional Tesseract OCR |
| ZIP | Supported document types above; no recursive ZIP expansion |

Sources and reading details show characters, pages/slides, sheets/cells or archive
members where available, plus OCR counts, failed pages and safety limits. Raw text
is retained up to explicit limits; the quality filter can still reject headings,
login pages or meaningless text as insufficient for study questions.

External URLs never receive Canvas credentials. `safe-reader.js` validates every
redirect, blocks private/reserved IPv4 and IPv6 destinations, pins DNS to the
connection, and limits downloads to 20 MB and five redirects. Public Drive/Docs/
Slides viewers can resolve to accessible exports; simple linked documents can be
followed. Browser-login/JavaScript-only pages and permission denials remain blocked.
Canvas downloads preserve signed query parameters, refresh stale metadata and
report status codes without showing tokens or signed URLs.

## Development checks and file map

```bash
npm test
npm run check
```

Tests use fixtures and mocked Canvas/OpenAI fetches. Installed LibreOffice/catppt
readers also have local fixture checks; missing executables can skip those tests.
No test sends email or uses real Canvas/API credentials. Syntax checks alone do
not establish successful generation. Live accounts and visual browser behavior
need separate checks.

- `app.js`, `ui.js`, `index.html`, `styles.css`: browser, navigation and study board.
- `source-index.js`: shared stable passages, indexing, selection and coverage.
- `practice-core.js`, `practice-ui.js`: type validation, quiz/review and persistence.
- `tutor-core.js`, `tutor-ui.js`: guide schema, passage retrieval and conversation UI.
- `server.js`: API proxies, readers, AI validation and existing mail service.
- `safe-reader.js`, `source-quality.js`: network destination checks and text quality.
- `tests/`: fixture-based regression checks. `AGENTS.md`: project working rules.
- `.env.example`: configuration; `render.yaml`: deployment blueprint.

### Practice counts and AI availability (Phase 1)

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
| `READER_OCR_PAGES` | 30 pages requiring OCR per document |
| `READER_OCR_PAGE_TIMEOUT_MS` | 20,000 ms per OCR tool operation |
| `READER_OCR_TIMEOUT_MS` | 120,000 ms per document OCR loop |

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
live verification.

### Study guides and module conversations (Phase 5)

The AI Tutor tab now opens a selected module's tutor workspace. Read and index
the module first (Full or Quick), then ask a question or create a study guide.
The guide has its own prompt and strict schema: overview, explained key concepts,
key terms, worked examples from the sources, common mistakes, check-yourself
questions with answers, and a suggested study order. Each entry includes its
original source passage. Unsupported sections are explicitly empty rather than
filled with invented examples. Guide generation traverses every available indexed
concept in bounded calls, independently of the flashcard-count preference. Partial
failures and cancellation keep completed sections and report missing coverage;
a Quick or incomplete index is identified. Guides are saved with existing practice
sets and can be reopened after refresh, including without Canvas authentication.

Module chat uses `POST /api/ai-chat`. Shared `tutor-core.js` ranks indexed passages
against the question using keyword relevance and BM25-style weighting. The browser
sends up to eight whole passages (12,000 characters combined) and the last six
conversation turns. Short follow-up questions also use recent student questions
for retrieval. Answers must cite supplied evidence IDs; the server attaches the
original text using the existing grounding validator. Unknown citations fail
visibly. If the retrieved files cannot answer, the tutor says so explicitly. This
version deliberately does not append general-knowledge answers. Retrieval searches
the available index, so Quick/partial indexing and keyword mismatches can limit
what the tutor finds.

Choose **Just explain** or **Guide me with hints**. Hints mode asks a leading
question without giving the final answer; use **Reveal answer** or explicitly ask
for the answer when ready. Flashcards and quiz questions also provide **Explain
this**, **Explain it more simply**, **Give me another example**, and **Quiz me on
this**. These use only that item's original evidence and retain practice progress.
Another-example requests explain source examples only; they do not invent an
example and attribute it to a file. Exam items retain their original module scope.

Chat requests are canceled when changing modules, leaving the view, changing
teaching style, or pressing Cancel. Late replies cannot replace the current view.
Conversations remain in tab memory, not localStorage. Requests use `store: false`
and manually supplied recent history, following the Responses API's
[conversation-state guidance](https://developers.openai.com/api/docs/guides/conversation-state).
Provider timeouts, transient failures and unsupported structured-output formats
use the existing bounded request pattern. API keys remain on the server.

The unused offline module generators were removed: their file-title prompts,
hard-coded definitions and placeholder distractors did not meet the same evidence
requirements. Without an API key, saved practice and source reading still work;
new AI guides, indexing and conversations clearly require server configuration.
No new dependencies or email/digest changes were introduced.

Phase 5 regression checks mock Canvas and model responses. They cover all seven
cited guide sections, last-source coverage, partial results, guide reload and
credential exclusion, relevant-passage ranking, unsupported questions, hints and
reveal, all four item actions, quiz progress, cancellation, stale replies, provider
errors and static delivery. The navigation test intentionally now expects the
tutor module picker instead of the old generator-only panel. Live Canvas access,
real model explanations/hint quality and visual browser QA remain unverified.

### Office formats and optional OCR (Phase 6)

`processLibreOffice` handles legacy and OpenDocument conversion. Each conversion
uses a fresh temporary directory and LibreOffice profile, a 45-second timeout,
bounded command output and cleanup on success or failure. The converted document
then uses the same full-text reader as a native DOCX/PPTX/XLSX. The original source
filename stays on citations. LibreOffice's supported exports are described in its
[conversion filters](https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html).

Install LibreOffice on the machine running the server. The reader detects the
standard macOS application and common Linux/Homebrew paths; otherwise set
`LIBREOFFICE_PATH` to the `soffice` executable. For PPT only, `CATPPT_PATH` or the
ignored `.tools/catdoc/bin/catppt` can provide a text-only fallback. The existing
`npm run setup:ppt` installs that fallback using a pinned/checksummed source and
requires a C compiler and make. catppt references are sections rather than reliable
slide numbers and may include revision text.

XLSX is read without a new dependency, using workbook relationships, shared strings
and worksheet cells, following the [SpreadsheetML structure](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/structure-of-a-spreadsheetml-document).
Each sheet begins with `Section: <sheet name>`. Cell addresses, zeroes, strings and
booleans are retained. Formula text and cached results are labelled; formulas,
macros and external workbook links are not executed by the XML reader. Formatting,
charts and date-display conversion are not reconstructed. Missing worksheet/string
parts are reported as partial extraction.

PDF pages with no extracted text use Poppler's `pdftoppm` to rasterize one page at
a time, then Tesseract. Image-only slides are first rendered to PDF by LibreOffice;
existing slide text remains intact. Standalone images need only Tesseract.
[Tesseract accepts image input, not PDF directly](https://tesseract-ocr.github.io/tessdoc/InputFormats.html).
Tools are optional: missing executables produce specific installation/recovery
messages. No packages are installed automatically.

Configure `PDFTOPPM_PATH` and `TESSERACT_PATH` if the commands are not on PATH.
`OCR_LANG` defaults to `eng`; language packs must be installed in Tesseract, and
multiple languages can use a value such as `eng+spa`. Restart the preview after
installation/configuration. Reader requests stream conversion and OCR progress
into a `role="status"` message. Late progress/results from an old module are ignored.

Default OCR limits are 30 pages requiring OCR per document, 20 seconds per tool
operation and 120 seconds for the document's OCR loop. Raster images are bounded
at 2,200 pixels on their longest side. Override these with `READER_OCR_PAGES`,
`READER_OCR_PAGE_TIMEOUT_MS` and `READER_OCR_TIMEOUT_MS`; text output also obeys
`READER_OCR_CHARS` and the format's character limit. Failed pages and unattempted
pages remain visible, while successful text is kept. Conversion/tool probing is
additional to the OCR loop budget. ZIP member documents each have their own OCR
budget. Full indexing cannot recover text omitted by reading limits.

The mail workflow now uses Node 22.13.0 to match the minimum in `package.json`.
No mail functions, SMTP, schedules, scripts or launchd files were changed.
`npm run preview` continues to disable email.

### Review findings and remaining limits

The six-phase diff was reviewed for grounding, storage, stale requests and reader
limits. Unused regex PDF extraction, old MCQ rendering, unused page-fetch helpers,
unused download-debug formatting and the OS metadata text fallback were removed.
The old offline module generators were removed in Phase 5. Diagnostic logging is
limited to existing operational messages and incomplete-response reasons; no
source text, prompts or credentials are logged by these changes.

Remaining fragile areas:

- Model citations establish a real supporting passage, not a proof of semantic
  correctness. Real explanations, distractors, hints and short-answer grading
  still need student/instructor judgment and live model evaluation.
- OCR can misread symbols, code, tables and diagrams. It runs on pages/slides with
  no extracted text; a page containing a small text layer plus a large diagram
  may still need an OCR-readable export. Speaker notes, text boxes and diagram
  reading order can differ from the visual layout. OCR is labelled in coverage.
- Readers use bounded ZIP/XML parsing, not a full Office layout engine. DOCX body
  text does not include every possible header, embedded object or annotation.
  XLSX styles/charts and encrypted or damaged files remain limited. ZIP64 and
  unusual namespace/layout variants need more fixtures.
- Large modules require many AI calls, time and provider usage. Indexing can miss
  concepts, and a short quiz cannot test everything. Coverage and shortfalls are
  reported; Quick mode is a sample. Keyword chat retrieval can miss a relevant
  passage with different vocabulary.
- Browser storage is finite and tied to an origin. Saved study content survives
  refresh, but session extraction, the index and chat do not. Some older course
  note/goal controls predate the guarded board/practice storage helpers.
- Conversion/OCR processes are bounded but are not an OS sandbox. This remains a
  personal local application; public multi-user deployment needs authenticated
  endpoints, resource/concurrency quotas and process isolation. Reading work
  already started on the server may finish after navigating away, while late UI
  updates are discarded.

Phase 6 fixtures cover every conversion dispatch, cleanup/failures, XLSX cell
extraction, archive dispatch, missing OCR tools, mixed native/OCR PDFs, image-only
slides, limits, partial failures, streamed progress and unchanged legacy paths.
A local smoke check also converted and read synthetic RTF, DOC, ODT, XLS, ODS
and ODP with the installed LibreOffice; existing PPT checks passed. Poppler and
Tesseract were absent on this machine, so successful OCR was tested with mocked
tools, not real recognition. The full suite passed 133 tests with zero skipped;
`npm run check` passed. Live Canvas permissions/downloads, live OpenAI quality,
real OCR accuracy and visual browser QA remain unverified.

## Optional email and deployment (existing functionality)

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
