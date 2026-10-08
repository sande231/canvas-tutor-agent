# Limitations and verification

[Back to README](../README.md) · [Architecture](ARCHITECTURE.md)

## Review findings and remaining limits

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

## Documentation accuracy notes

The browser's study connection keeps its token in memory; optional mail scheduling
also saves it server-side as described in [Email](EMAIL.md). The old overview did
not make this exception explicit. The browser also saves the Canvas URL and mail
address/time preferences, in addition to study data; it does not save tokens.

Incomplete-response retries ask for fewer items only for cards/questions. Index
and guide retries resubmit the complete part. A known evidence ID verifies passage
identity, not whether a generated explanation follows logically from the passage.

The file reader rejects all literal IPv6 destinations and resolves hostnames to
IPv4; its protection is not limited to private IPv6 addresses. The Canvas API
proxy is a separate code path, and the app is not a hardened public API service.

The Mac email installer and plist have machine-specific locations and need
adaptation on other machines. No personal paths are reproduced here.

The implementation currently uses one configured `OPENAI_MODEL`. Shared rooms,
study buddies and a multi-model picker are not built. There are no committed
screenshots in `docs/screenshots/` in this documentation revision.
