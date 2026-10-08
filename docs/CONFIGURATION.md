# Configuration

[Back to README](../README.md) · [Architecture](ARCHITECTURE.md) · [Email](EMAIL.md)

Use Node 22.13.0 or newer. Copy [`.env.example`](../.env.example) only if you do not
already have a private `.env`; otherwise edit the existing file. Restart the Node
process after changes. `loadEnvFile` fills unset or empty environment values from
`.env`; nonempty process environment values take precedence. Never commit secrets.

`npm run preview` binds to localhost and forces email off. Stop with Ctrl+C.
`npm run preview -- 4188` selects another port; a CLI port takes precedence over
`PORT`. Normal `npm start` enables the existing mail scheduler unless explicitly
disabled. Preview does not stop independent background agents or cloud schedules.

## Application and AI settings

Defaults below are the code defaults, not suggested values in the example file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Unset | Server-only key for indexing, generation, chat and short-answer grading. Saved practice and reading still work without it. |
| `OPENAI_MODEL` | `gpt-5-mini` | One model used for all AI endpoints. |
| `EMAIL_DISABLED` | Off when unset | `1` or `true` blocks mail scheduling mutations, delivery and drafts; preview forces `1`. |
| `HOST` | `127.0.0.1` locally | Bind address; defaults to `0.0.0.0` when `RENDER` is truthy. Preview forces localhost. |
| `PORT` | `4177` | Listen port, unless overridden by the first CLI argument. |

Settings and AI Tutor display `GET /api/ai-status` results: configured state and
model, never the key. This is a configuration check, not an authentication/billing
test against OpenAI. `OPENAI_MODELS` and a model picker are not implemented.

Count (1–50), difficulty and item types are student choices stored in the browser.
Full/Quick indexing, request sizes, retry counts and AI deadlines are code-defined,
not environment settings. Extraction limits below do not alter AI batch sizes.

## Optional reader tools

| Variable | Default | Purpose |
| --- | --- | --- |
| `LIBREOFFICE_PATH` | Auto-detect common macOS/Linux/Homebrew locations | Path to the `soffice` executable for Office conversion and slide rendering. |
| `CATPPT_PATH` | Auto-detect `.tools/catdoc/bin/catppt` and common system locations | Text-only fallback for legacy PPT files. |
| `PDFTOPPM_PATH` | `pdftoppm` on PATH | Poppler PDF-to-image executable for OCR. |
| `TESSERACT_PATH` | `tesseract` on PATH | OCR executable for images and rasterized pages. |
| `OCR_LANG` | `eng` | Installed Tesseract language data; multiple languages can use `eng+spa`. |

### Install tools

On macOS with Homebrew, install only the tools you need:

```bash
brew install --cask libreoffice
brew install poppler tesseract
```

The commands come from the Homebrew entries for [LibreOffice](https://formulae.brew.sh/cask/libreoffice),
[Poppler](https://formulae.brew.sh/formula/poppler) and
[Tesseract](https://formulae.brew.sh/formula/tesseract). Poppler supplies `pdftoppm`.
The Tesseract formula includes English and orientation data; `brew install
tesseract-lang` adds other languages. On other systems, use the
[LibreOffice downloads](https://www.libreoffice.org/download/download-libreoffice/)
and [Tesseract installation instructions](https://tesseract-ocr.github.io/tessdoc/Installation.html),
and install Poppler with your distribution's package manager. Set executable paths
above if the server cannot find them. OCR of slides needs all three tools; standalone
image OCR needs only Tesseract. Native text extraction does not need OCR tools.

For the optional legacy-PPT fallback, from the repository root:

```bash
npm run setup:ppt
```

This existing script installs catdoc 0.97.2 into ignored `.tools/catdoc`, checking a
pinned release checksum. It needs a C compiler, make and tar, uses no sudo, and
does not set up email. It rejects native Windows; use LibreOffice there and set
`LIBREOFFICE_PATH`. Alternatively set `CATPPT_PATH` to an existing installation.
Restart `npm run preview` after installing tools or changing paths/languages.
Missing tools produce clear reading errors; the app does not install them itself.

## Extraction safety limits

Every `readerDefaults` key in `server.js` has a `READER_<KEY>` override. Values must
be positive safe integers; invalid values use the defaults. These are extraction
limits, independent of model input/output budgets. The source report names limits
that cut extraction short; no page count is invented for plain text or DOCX.

| Variable | Default | Purpose |
| --- | ---: | --- |
| `READER_PDF_PAGES` | 2,000 | Maximum PDF pages inspected. |
| `READER_PDF_CHARS` | 2,000,000 | Retained PDF characters, including OCR. |
| `READER_OFFICE_CHARS` | 2,000,000 | Retained DOCX, slide or XLSX text. |
| `READER_NOTEBOOK_CELLS` | 20,000 | Maximum notebook cells inspected. |
| `READER_NOTEBOOK_CHARS` | 2,000,000 | Retained notebook characters. |
| `READER_TEXT_CHARS` | 2,000,000 | Retained plain-text characters. |
| `READER_CODE_CHARS` | 2,000,000 | Retained source-code characters. |
| `READER_HTML_CHARS` | 2,000,000 | Retained text from external HTML reading. |
| `READER_OCR_CHARS` | 2,000,000 | OCR text budget. |
| `READER_LEGACY_PPT_CHARS` | 2,000,000 | Retained catppt fallback text. |
| `READER_ZIP_FILES` | 1,000 | Supported files attempted inside an archive. |
| `READER_ZIP_FILE_CHARS` | 2,000,000 | Retained characters per archive member. |
| `READER_ZIP_TOTAL_CHARS` | 10,000,000 | Combined retained archive text. |
| `READER_ZIP_ENTRIES` | 10,000 | ZIP directory entries inspected. |
| `READER_ZIP_ENTRY_BYTES` | 32,000,000 | Compressed/decompressed archive entry bound. |
| `READER_ZIP_TOTAL_BYTES` | 128,000,000 | Expanded archive bytes; also bounds converted Office output files. |
| `READER_OCR_PAGES` | 30 | Pages requiring OCR attempted per document. |
| `READER_OCR_PAGE_TIMEOUT_MS` | 20,000 | Per OCR tool-operation timeout in milliseconds. |
| `READER_OCR_TIMEOUT_MS` | 120,000 | Per-document OCR loop budget in milliseconds. |

The network reader separately limits downloads to 20,000,000 bytes and five
redirects within a 20-second request budget; these are not environment settings.
Destination checks remain in `safe-reader.js`. No dependencies were added by the
full-reading/conversion changes; PDF.js was already a runtime dependency.

## Optional mail settings

Mail is disabled in preview regardless of these settings. Outside preview, Resend
is selected before SMTP if both are configured. Otherwise the app creates drafts.
See [Email](EMAIL.md) for the unchanged setup and deployment instructions.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SMTP_HOST` | Unset | SMTP server hostname. |
| `SMTP_PORT` | Sender fallback `587` | Set explicitly: SMTP configuration detection requires a value. |
| `SMTP_SECURE` | `false`, except port 465 implies `true` | Use immediate TLS; otherwise the SMTP path negotiates STARTTLS. |
| `SMTP_USER` | Unset | SMTP login user. |
| `SMTP_PASS` | Unset | Private SMTP password or provider app password. |
| `EMAIL_FROM` | Unset | Sender address/name; required for either real-mail provider. |
| `RESEND_API_KEY` | Unset | Private Resend API key. |

Deployment variables referenced in the existing mail documentation (in addition
to the variables in `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `CANVAS_BASE_URL` | Unset | Canvas origin for environment-configured digests. |
| `CANVAS_TOKEN` | Unset | Server-side digest credential; never a replacement for the UI token. |
| `DIGEST_EMAIL` | Unset | Recipient for environment-configured digests. |
| `DIGEST_TIME` | `07:30` | Daily local send time when using environment configuration. |
| `DIGEST_PROFILE_NAME` | `Student` | Profile label for the digest. |
| `TZ` | Runtime timezone | Node's local timezone; supplied deployments use `America/New_York`. |
| `RENDER` | Unset | Platform flag used for the default bind address. |
| `NODE_ENV` | Not read by application code | Deployment blueprint sets `production`; not a reader/AI setting. |

A saved `daily-digest-config.json` takes precedence over environment-based digest
settings. These files, `.env`, drafts and logs are ignored by Git. Enabling the
scheduler stores its own credentials server-side; that is distinct from browser
study authentication.

## Office formats and OCR behavior

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
