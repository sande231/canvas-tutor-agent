# Architecture

[Back to README](../README.md) · [Configuration](CONFIGURATION.md) · [Limitations](LIMITATIONS.md)

The browser runs vanilla JavaScript; a plain Node server serves an explicit static
file allowlist and API routes. There is no build step. Shared modules are loaded
by browser scripts and `require` in Node. Browser orchestration makes network
requests; shared modules provide pure passage, schema, quality and practice logic.

## Routes and responsibilities

| Route | Responsibility |
| --- | --- |
| `POST /api/canvas` | Authenticated Canvas JSON proxy; pages/discussions/assignments return HTML bodies that the browser normalizes. |
| `POST /api/canvas-file-text` | Fetch file metadata and bytes, refresh URLs when needed, extract text on the server. |
| `POST /api/local-file-text` | Read an uploaded file's base64 payload. |
| `POST /api/external-text` | Retrieve public sources without Canvas credentials, then extract text. |
| `GET /api/ai-status` | Return `{ configured, model }`, never the API key. |
| `POST /api/ai-index` | Extract concepts with validated evidence references. |
| `POST /api/ai-tutor` | Generate typed practice or a study guide from selected indexed concepts. |
| `POST /api/ai-chat` | Answer using retrieved or item-specific passages and recent turns. |
| `POST /api/ai-grade` | Grade a cited short answer with model feedback. |

Mail routes are `POST /api/daily-digest/config`, `POST /api/daily-digest/test` and
`GET /api/daily-digest/status`; see [Email](EMAIL.md). Preview blocks mail mutations.

## Connect and navigate

Enter your school Canvas URL and your own access token, then choose **Connect**.
The browser forwards that in-memory token through the authenticated Node proxy;
it does not substitute saved mail credentials. A Canvas 401 shows an error beside
Connect and stops automatic retries. Replace an expired token privately using
your Canvas account settings, then reconnect. The study connection never places
tokens in URLs or browser storage. Optional mail scheduling stores a token
server-side; see [Email](EMAIL.md). The OpenAI key never reaches the browser.

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

## Source reading and session cache

The reader retains full extracted text up to explicit safety limits. These are
separate from AI request sizes. Concept indexing reads these passages in bounded
batches instead of sending only file prefixes. PDFs inside ZIP archives use
PDF.js, just like standalone PDFs.
Plain text and code preserve their complete bodies, rather than a code summary.

Canvas page, assignment and discussion headings appear as `Section: …` lines.
Same-origin Canvas `/files/<id>` links become child sources and use the normal
authenticated file-download route. Downloads are deduplicated by file ID within
the selected module; linked files are not crawled recursively. Four workers read
module items with progress updates. Extracted module content stays in memory for
the authenticated session, so **Generate again** reuses it. **Re-read module**
refreshes the Canvas material and clears session-generated practice; previously
saved sets remain reviewable until replaced. Reconnecting or reloading the app
invalidates the extraction cache.
Saved study notes are independent and remain in localStorage.

The source report shows extracted characters, page/slide counts when available,
notebook cells or archive members, and any safety truncation. Archive details
also show the individual file reports. No page count is invented for formats
such as plain text or DOCX, whose pagination depends on rendering. Image-only or
inaccessible material can still be unreadable; a successful download alone does
not count as usable study material.

### Access, formats and reading reports

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
redirect, blocks private/reserved IPv4 and all literal IPv6 destinations, pins DNS to the
connection, and limits downloads to 20 MB and five redirects. Public Drive/Docs/
Slides viewers can resolve to accessible exports; simple linked documents can be
followed. Browser-login/JavaScript-only pages and permission denials remain blocked.
Canvas downloads preserve signed query parameters, refresh stale metadata and
report status codes without showing tokens or signed URLs.

Extraction safety defaults and tool installation live in [Configuration](CONFIGURATION.md).
PDF.js reads PDFs even inside archives. `processSourceDocument` dispatches readers;
`processLibreOffice`, `processXlsx` and `ocrPdfPages` handle conversion, worksheets
and OCR. Reader limits do not change the amount of text sent in each AI call.

## Passage IDs and concept indexing

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
Unknown evidence references and malformed concepts are discarded. Semantic
correctness still depends on the model and review. Source material is
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

Indexing fixture checks cover browser/Node ID parity, changed evidence, full and
sampled passage coverage, partial failures and retries, cancellation and stale
results, source weighting, multi-passage concept evidence, and a question citing
an important fact found only at the end of the final source. Live model quality,
latency and account access still need a live Canvas/OpenAI check.

## Generation and AI availability

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
and provider failures without inventing replacement questions. Concept indexing
reads the extracted passages from across each source before selecting
concepts and supporting evidence for generation; it no longer uses the old
12,000-per-source / 45,000-total prefix excerpts.

The backend uses the Responses API's strict `text.format` JSON schema. The
configured default, `gpt-5-mini`, supports this format; an explicit unsupported
schema/model response triggers one fallback to JSON mode. Both paths use the
same grounding validation and server-attached source passages. See OpenAI's
[structured output guide](https://developers.openai.com/api/docs/guides/structured-outputs)
and [GPT-5 mini model capabilities](https://developers.openai.com/api/docs/models/gpt-5-mini).
Output budgets include reasoning headroom. An incomplete response records its
`incomplete_details.reason` (without content or secrets). Card/question generation
retries once with fewer items; indexing and study-guide generation retry the
complete part without dropping passages or concepts. HTTP 429/5xx responses get one short delayed retry. All retries for
one batch share a 75-second server deadline; completed browser batches survive
later failures. See [reasoning token budgets](https://developers.openai.com/api/docs/guides/reasoning).

Generation regression tests use mocked Canvas and OpenAI responses, including the
full 20-question module-to-quiz flow, smaller retries, top-ups, cancellation,
partial results and configuration checks. They do not establish live model
latency, account access or whether a particular module supports the chosen count.

## Grounding validation

`validatedPassageBundle` checks stable IDs against source IDs, passage numbers,
sections and text, and rejects changed, duplicate or oversized passage bundles.
The indexed generation route validates each chosen `conceptId` and its evidence.
The model supplies content plus an `evidenceId`; the server resolves that ID and
attaches the original source text, filename and section with `validateGroundedResult`.
Unknown or mismatched references are dropped. Chat rejects unknown references
visibly rather than showing an uncited answer. The compatibility path also accepts
older exact source quotations; unknown IDs cannot fall back to that path.

Course content and conversation text are treated as untrusted data, not instructions.
Type validation checks answer shapes, while quality checks reject generic filename
questions and slide-heading dumps. These checks do not prove an answer is correct;
see [Limitations](LIMITATIONS.md). Unsupported or failed output never becomes
invented fallback questions.

## Practice and storage

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
concepts priority within each source while preserving source allocation.
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

Practice tests mock network/API calls. They cover every type (valid and malformed),
20-item generation, all ten rendered question inputs, scoring/retries, scheduling,
keyboard flips, CSV, reload recovery, credential exclusion, blocked storage,
short-answer feedback/failures/cancellation/stale responses, weak priorities,
exam attribution, timers and static script delivery. Earlier UI tests were updated
intentionally to assert the new flip-card and scored-quiz behavior instead of
`<details>` cards and per-question answer buttons. Live Canvas access, real model
quality across each type, AI grading accuracy and visual browser QA still require
live verification.

## Study guides, tutor chat and retrieval

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

Tutor regression checks mock Canvas and model responses. They cover all seven
cited guide sections, last-source coverage, partial results, guide reload and
credential exclusion, relevant-passage ranking, unsupported questions, hints and
reveal, all four item actions, quiz progress, cancellation, stale replies, provider
errors and static delivery. The navigation test intentionally now expects the
tutor module picker instead of the old generator-only panel. Live Canvas access,
real model explanations/hint quality and visual browser QA remain unverified.

## Request cancellation and stale results

`moduleRequestVersion` and the selected course/module key gate asynchronous UI
updates. `invalidateModuleRequests` cancels AI work; `hydrateSelectedModule` uses
four readers and discards results/progress from an old selection. `runAiTutor`
reuses session extraction/indexing, while **Re-read module** clears those caches.
A canceled indexing run keeps completed parts; a canceled generation run retains
completed batches if the same module remains selected. A new selection never
receives late output from the old module.

AI batches share a 75-second server deadline across request, response body and
retries; the browser has an independent 85-second deadline and shows elapsed time.
Chat uses abort controllers, request versions and mounted-panel checks; removing
its panel or changing teaching style aborts the pending reply. Short-answer grading
also discards stale results. Reader conversion/OCR work already started on the
server can finish after navigation; that does not authorize a late UI update.

## Developer checks and files

Run `npm test` and `npm run check` from the repository root. Tests mock network/API
calls and cover source reading, permissions, citation validation, indexed batching,
practice/reload, chat and navigation. Local installed-tool fixtures may be skipped
if the tools are missing. Syntax checks alone do not establish successful generation.
Live Canvas access, model quality and visual browser behavior need separate checks.

`app.js` orchestrates notes, requests and Canvas reading; `ui.js` owns navigation.
`practice-core.js` and `practice-ui.js` own validation, review and saved practice;
`tutor-core.js` and `tutor-ui.js` own guide contracts, retrieval and chat. The shared
`source-index.js` owns stable passages, concept selection and coverage;
`source-quality.js` filters unusable study text. `server.js` hosts APIs and readers;
`safe-reader.js` controls external destinations. `index.html` and `styles.css` form
the shell. `tests/`, `AGENTS.md`, `.env.example` and `render.yaml` cover checks,
working rules, configuration and deployment.
