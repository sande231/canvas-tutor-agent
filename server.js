const http = require("http");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const tls = require("tls");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const root = __dirname;
loadEnvFile(path.join(root, ".env"));

const port = Number(process.argv[2] || process.env.PORT || 4177);
const host = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const requestTimeoutMs = 20000;
const digestConfigPath = path.join(root, "daily-digest-config.json");
const digestStatePath = path.join(root, "daily-digest-state.json");
const outboxDir = path.join(root, "outbox");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/canvas") {
      await proxyCanvasRequest(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/canvas-file-text") {
      await proxyCanvasFileText(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/daily-digest/config") {
      await saveDailyDigestConfig(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/daily-digest/test") {
      await sendDailyDigestTest(request, response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/daily-digest/status") {
      sendDailyDigestStatus(response);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
});

async function saveDailyDigestConfig(request, response) {
  const body = await readJsonBody(request);
  const config = normalizeDigestConfig(body);

  if (!config) {
    sendJson(response, 400, {
      error: "Add an email, send time, Canvas URL, and Canvas token before scheduling.",
    });
    return;
  }

  fs.writeFileSync(digestConfigPath, JSON.stringify(config, null, 2));
  const state = readDigestState();
  fs.writeFileSync(
    digestStatePath,
    JSON.stringify(
      {
        ...state,
        lastConfigUpdate: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  sendJson(response, 200, {
    ok: true,
    time: config.time,
    deliveryNote: deliveryNote(),
  });
}

async function sendDailyDigestTest(request, response) {
  const body = await readJsonBody(request);
  const config = normalizeDigestConfig(body);

  if (!config) {
    sendJson(response, 400, {
      error: "Add an email, send time, Canvas URL, and Canvas token before sending a test.",
    });
    return;
  }

  try {
    const result = await buildAndDeliverDigest(config, "manual-test");
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Could not build digest." });
  }
}

function sendDailyDigestStatus(response) {
  const config = fs.existsSync(digestConfigPath)
    ? parseJson(fs.readFileSync(digestConfigPath, "utf8"))
    : null;
  const state = fs.existsSync(digestStatePath)
    ? parseJson(fs.readFileSync(digestStatePath, "utf8"))
    : {};
  const drafts = fs.existsSync(outboxDir)
    ? fs
        .readdirSync(outboxDir)
        .filter((file) => file.endsWith(".eml"))
        .sort()
        .slice(-5)
        .map((file) => path.join(outboxDir, file))
    : [];

  sendJson(response, 200, {
    configured: Boolean(config),
    email: config?.email || "",
    time: config?.time || "",
    deliveryMode: emailDeliveryMode(),
    deliveryNote: deliveryNote(),
    lastSentDate: state.lastSentDate || "",
    lastDelivery: state.lastDelivery || null,
    lastError: state.lastError || "",
    drafts,
  });
}

async function proxyCanvasRequest(request, response) {
  const body = await readJsonBody(request);
  const baseUrl = normalizeCanvasUrl(body.baseUrl);
  const token = String(body.token || "").trim();
  const apiPath = String(body.path || "");

  if (!baseUrl || !token || !apiPath.startsWith("/api/v1/")) {
    sendJson(response, 400, {
      error: "Missing Canvas URL, token, or API path.",
    });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const canvasResponse = await fetch(`${baseUrl}${apiPath}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    const text = await canvasResponse.text();
    const payload = parseJson(text);

    if (!canvasResponse.ok) {
      sendJson(response, canvasResponse.status, {
        error:
          canvasErrorText(payload) ||
          `Canvas returned ${canvasResponse.status}. Check your URL and token.`,
      });
      return;
    }

    sendJson(response, 200, payload);
  } catch (error) {
    sendJson(response, 504, {
      error:
        error.name === "AbortError"
          ? "Canvas did not respond within 20 seconds."
          : "The local proxy could not reach Canvas. Check your network and Canvas URL.",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function proxyCanvasFileText(request, response) {
  const body = await readJsonBody(request);
  const baseUrl = normalizeCanvasUrl(body.baseUrl);
  const token = String(body.token || "").trim();
  const fileId = String(body.fileId || "").trim();

  if (!baseUrl || !token || !fileId) {
    sendJson(response, 400, { error: "Missing Canvas URL, token, or file id." });
    return;
  }

  try {
    const file = await fetchCanvasJson(baseUrl, token, `/api/v1/files/${encodeURIComponent(fileId)}`);
    const downloadUrl = file.url || file["url"];

    if (!downloadUrl) {
      sendJson(response, 200, {
        title: file.display_name || file.filename || "Canvas file",
        text: "",
        readable: false,
        reason: "Canvas did not provide a downloadable file URL.",
      });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const fileResponse = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      const contentType = fileResponse.headers.get("content-type") || file["content-type"] || "";
      const title = file.display_name || file.filename || "Canvas file";

      if (!fileResponse.ok) {
        sendJson(response, 200, {
          title,
          text: "",
          readable: false,
          reason: `Canvas file download returned ${fileResponse.status}.`,
        });
        return;
      }

      const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
      const processed = processDownloadedFile(title, contentType, fileBuffer);
      if (processed.readable) {
        sendJson(response, 200, processed);
        return;
      }

      sendJson(response, 200, {
        title,
        text: "",
        readable: false,
        contentType,
        reason:
          processed.reason ||
          `This file is ${contentType || "not plain text"}. It may need OCR or a DOCX/slides parser to read its full body.`,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    sendJson(response, 200, {
      title: "Canvas file",
      text: "",
      readable: false,
      reason: error.message || "Could not read the Canvas file.",
    });
  }
}

async function buildAndDeliverDigest(config, reason) {
  const plannerItems = await fetchCanvasJson(
    config.baseUrl,
    config.token,
    `/api/v1/planner/items?${plannerQueryString(7, 20)}`,
  );
  const digest = buildDigest(config, Array.isArray(plannerItems) ? plannerItems : []);
  const delivery = await deliverEmail(config.email, digest.subject, digest.text, digest.html);
  const state = readDigestState();
  fs.writeFileSync(
    digestStatePath,
    JSON.stringify(
      {
        ...state,
        lastDelivery: {
          at: new Date().toISOString(),
          to: config.email,
          provider: delivery.provider,
          sent: delivery.sent,
          subject: digest.subject,
          id: delivery.id || "",
          outboxPath: delivery.outboxPath || "",
        },
        lastError: "",
      },
      null,
      2,
    ),
  );

  return {
    ...delivery,
    reason,
    subject: digest.subject,
    preview: digest.text,
    message: delivery.sent
      ? `Sent daily focus mail to ${config.email}.`
      : `Email sending is not configured, so I saved a draft for ${config.email}.`,
  };
}

async function fetchCanvasJson(baseUrl, token, apiPath) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}${apiPath}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = parseJson(text);

    if (!response.ok) {
      throw new Error(canvasErrorText(payload) || `Canvas returned ${response.status}.`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function buildDigest(config, plannerItems) {
  const items = plannerItems
    .filter((item) => item.plannable)
    .map((item) => {
      const dueAt = item.plannable.due_at || item.plannable_date || item.end_date || "";
      const title = item.plannable.title || item.plannable_type || "Canvas item";
      const course = item.context_name || "Canvas";
      const details = stripHtml(item.plannable.details || item.plannable.description || "");
      return {
        title,
        course,
        dueAt,
        details,
        urgency: dueAt ? new Date(dueAt).getTime() : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((left, right) => left.urgency - right.urgency)
    .slice(0, 10);

  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
  const subject = `Canvas focus plan for ${today}`;
  const focusPoints = buildFiveFocusPoints(items);

  const lines = [
    `Hi ${config.profileName || "there"},`,
    "",
    "Here are your 5 Canvas Tutor key points for today:",
    "",
    ...focusPoints.flatMap((point, index) => [
      `${index + 1}. ${point.title}`,
      `   ${point.detail}`,
      `   Action: ${point.action}`,
      "",
    ]),
  ];

  const html = `
    <h2>5 Canvas Tutor key points for ${escapeHtml(today)}</h2>
    <p>Hi ${escapeHtml(config.profileName || "there")}, here is what to focus on today.</p>
    <ol>
      ${focusPoints
        .map(
          (point) => `
            <li>
              <strong>${escapeHtml(point.title)}</strong><br>
              ${escapeHtml(point.detail)}<br>
              Action: ${escapeHtml(point.action)}
            </li>
          `,
        )
        .join("")}
    </ol>
    <p><strong>Study order:</strong> urgent work, hardest concept, flashcards, quiz yourself, submit/check Canvas.</p>
  `;

  return { subject, text: lines.join("\n"), html };
}

function buildFiveFocusPoints(items) {
  if (!items.length) {
    return [
      {
        title: "Review your newest Canvas module",
        detail: "No upcoming work was found in Canvas for the next check window.",
        action: "Open the newest module and write three key ideas.",
      },
      {
        title: "Make flashcards",
        detail: "Use one module page, announcement, or posted note.",
        action: "Create five flashcards from terms or code concepts.",
      },
      {
        title: "Practice recall",
        detail: "Active recall is better than rereading.",
        action: "Close the notes and explain one topic out loud.",
      },
      {
        title: "Check Canvas announcements",
        detail: "Instructor updates often explain what matters most.",
        action: "Look for hints, changed due dates, or rubric reminders.",
      },
      {
        title: "Plan tomorrow",
        detail: "Keep one small task ready before you stop studying.",
        action: "Choose the first assignment or module to start next.",
      },
    ];
  }

  const urgent = items[0];
  const second = items[1] || urgent;
  const third = items[2] || urgent;

  return [
    {
      title: `Start with ${urgent.title}`,
      detail: `${urgent.course} · ${urgent.dueAt ? `Due ${formatDate(urgent.dueAt)}` : "No due date"}`,
      action: focusAdvice(urgent),
    },
    {
      title: "Study the course material before working",
      detail: `${urgent.course} is the first study area to open in Canvas Tutor.`,
      action: "Select the course, choose the related module, then use Study Module.",
    },
    {
      title: `Prepare for ${second.title}`,
      detail: `${second.course} · ${second.dueAt ? `Due ${formatDate(second.dueAt)}` : "No due date"}`,
      action: "Break the work into understand, draft, check, and submit.",
    },
    {
      title: "Make flashcards from today’s hardest topic",
      detail: third.course,
      action: "Use Canvas Tutor module flashcards, then answer without looking.",
    },
    {
      title: "End with a Canvas check",
      detail: "Make sure submitted work and due dates are clear.",
      action: "Open Canvas, confirm the next due item, and set tomorrow’s first task.",
    },
  ];
}

function focusAdvice(item) {
  const text = `${item.title} ${item.details}`.toLowerCase();
  if (text.includes("quiz") || text.includes("test") || text.includes("exam")) {
    return "Review notes, make practice questions, and test yourself without looking.";
  }
  if (text.includes("essay") || text.includes("paper") || text.includes("write")) {
    return "Clarify the thesis, gather evidence, and write the next paragraph first.";
  }
  if (text.includes("discussion")) {
    return "Prepare one claim, one example, and one question before posting.";
  }
  if (text.includes("lab")) {
    return "Review the procedure, variables, and what the results should show.";
  }
  return "Break it into one small task you can finish today, then make a flashcard from it.";
}

async function deliverEmail(to, subject, text, html) {
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        html,
        text,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || "Email provider rejected the message.");
    }

    return { sent: true, provider: "resend", id: payload.id || "" };
  }

  if (hasSmtpConfig()) {
    await sendSmtpMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text,
      html,
    });
    return { sent: true, provider: "smtp", id: `smtp-${Date.now()}` };
  }

  fs.mkdirSync(outboxDir, { recursive: true });
  const fileName = `daily-focus-${new Date().toISOString().replace(/[:.]/g, "-")}.eml`;
  const outboxPath = path.join(outboxDir, fileName);
  const eml = [
    `To: ${to}`,
    "From: Canvas Tutor <no-reply@canvas-tutor.local>",
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
  ].join("\n");
  fs.writeFileSync(outboxPath, eml);

  return { sent: false, provider: "outbox", outboxPath };
}

async function sendSmtpMail({ from, to, subject, text, html }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
  const username = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  let socket = secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });
  socket.setEncoding("utf8");

  const read = createSmtpReader(socket);
  await read([220]);
  await smtpCommand(socket, read, `EHLO localhost`, [250]);

  if (!secure) {
    await smtpCommand(socket, read, "STARTTLS", [220]);
    socket = tls.connect({ socket, servername: host });
    socket.setEncoding("utf8");
    const tlsRead = createSmtpReader(socket);
    await smtpCommand(socket, tlsRead, `EHLO localhost`, [250]);
    await smtpAuth(socket, tlsRead, username, password);
    await smtpEnvelope(socket, tlsRead, from, to, subject, text, html);
    socket.end();
    return;
  }

  await smtpAuth(socket, read, username, password);
  await smtpEnvelope(socket, read, from, to, subject, text, html);
  socket.end();
}

function createSmtpReader(socket) {
  let buffer = "";
  const waiters = [];

  socket.on("data", (chunk) => {
    buffer += chunk;
    flushWaiters();
  });

  socket.on("error", (error) => {
    while (waiters.length) waiters.shift().reject(error);
  });

  function flushWaiters() {
    while (waiters.length) {
      const response = completeSmtpResponse(buffer);
      if (!response) return;
      buffer = buffer.slice(response.length);
      waiters.shift().resolve(response.text);
    }
  }

  return (expectedCodes) =>
    new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
      flushWaiters();
    }).then((response) => {
      const code = Number(response.slice(0, 3));
      if (!expectedCodes.includes(code)) {
        throw new Error(`SMTP error: ${response.trim()}`);
      }
      return response;
    });
}

function completeSmtpResponse(buffer) {
  const lines = buffer.split(/\r?\n/);
  let consumed = 0;

  for (const line of lines) {
    if (!line) {
      consumed += 2;
      continue;
    }
    consumed += line.length + 2;
    if (/^\d{3}\s/.test(line)) {
      return { text: buffer.slice(0, consumed), length: consumed };
    }
  }

  return null;
}

async function smtpCommand(socket, read, command, expectedCodes) {
  socket.write(`${command}\r\n`);
  return read(expectedCodes);
}

async function smtpAuth(socket, read, username, password) {
  if (!username || !password) return;
  socket.write("AUTH LOGIN\r\n");
  await read([334]);
  socket.write(`${Buffer.from(username).toString("base64")}\r\n`);
  await read([334]);
  socket.write(`${Buffer.from(password).toString("base64")}\r\n`);
  await read([235]);
}

async function smtpEnvelope(socket, read, from, to, subject, text, html) {
  await smtpCommand(socket, read, `MAIL FROM:<${emailAddressOnly(from)}>`, [250]);
  await smtpCommand(socket, read, `RCPT TO:<${emailAddressOnly(to)}>`, [250, 251]);
  await smtpCommand(socket, read, "DATA", [354]);
  socket.write(buildMimeMessage(from, to, subject, text, html));
  await read([250]);
  await smtpCommand(socket, read, "QUIT", [221]);
}

function buildMimeMessage(from, to, subject, text, html) {
  const boundary = `canvas-tutor-${Date.now()}`;
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    dotStuff(text),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    dotStuff(html),
    "",
    `--${boundary}--`,
    ".",
    "",
  ].join("\r\n");
}

function emailAddressOnly(value) {
  const match = String(value || "").match(/<([^>]+)>/);
  return match ? match[1] : String(value || "").trim();
}

function dotStuff(value) {
  return String(value || "").replace(/^\./gm, "..");
}

function normalizeDigestConfig(body) {
  const baseUrl = normalizeCanvasUrl(body.baseUrl);
  const token = String(body.token || "").trim();
  const email = String(body.email || "").trim();
  const time = String(body.time || "07:30").trim();
  const profileName = String(body.profileName || "Student").trim();

  if (!baseUrl || !token || !email.includes("@") || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  return { baseUrl, token, email, time, profileName };
}

function plannerQueryString(days, perPage) {
  const start = new Date();
  const end = new Date();
  end.setDate(start.getDate() + days);
  return new URLSearchParams({
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    per_page: String(perPage),
  }).toString();
}

function deliveryNote() {
  if (hasResendConfig()) {
    return "Email sending is configured through Resend.";
  }
  if (hasSmtpConfig()) {
    return `Email sending is configured through SMTP (${process.env.SMTP_HOST}).`;
  }
  return "No email provider is configured, so daily messages will be saved as .eml drafts in the outbox folder.";
}

function emailDeliveryMode() {
  if (hasResendConfig()) return "real-email-resend";
  if (hasSmtpConfig()) return "real-email-smtp";
  return "draft-outbox";
}

function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function hasSmtpConfig() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.EMAIL_FROM,
  );
}

function startDailyDigestScheduler() {
  setInterval(async () => {
    if (!fs.existsSync(digestConfigPath)) return;

    const config = parseJson(fs.readFileSync(digestConfigPath, "utf8"));
    if (!config?.time) return;

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    const todayKey = now.toISOString().slice(0, 10);
    const state = fs.existsSync(digestStatePath)
      ? parseJson(fs.readFileSync(digestStatePath, "utf8"))
      : {};

    if (currentTime !== config.time || state.lastSentDate === todayKey) return;

    try {
      await buildAndDeliverDigest(config, "daily-schedule");
      const state = readDigestState();
      fs.writeFileSync(digestStatePath, JSON.stringify({ ...state, lastSentDate: todayKey }, null, 2));
      console.log(`Daily focus mail processed for ${todayKey}`);
    } catch (error) {
      const state = readDigestState();
      fs.writeFileSync(
        digestStatePath,
        JSON.stringify({ ...state, lastError: `${new Date().toISOString()} ${error.message}` }, null, 2),
      );
      console.error(`Daily focus mail failed: ${error.message}`);
    }
  }, 60_000);
}

function readDigestState() {
  return fs.existsSync(digestStatePath)
    ? parseJson(fs.readFileSync(digestStatePath, "utf8"))
    : {};
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(data);
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Request body is too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function normalizeCanvasUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return "";
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return { raw: text };
  }
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function processDownloadedFile(title, contentType, buffer) {
  if (isNotebookFile(title, contentType)) {
    const notebookText = safelyExtractNotebookText(buffer.toString("utf8"));
    return {
      title,
      text: notebookText.slice(0, 16000),
      readable: Boolean(notebookText.trim()),
      contentType,
      sourceKind: "notebook",
      reason: notebookText.trim() ? "" : "Notebook file could not be parsed as JSON.",
    };
  }

  if (isOfficeDocumentFile(title, contentType, buffer)) {
    return processOfficeDocument(title, contentType, buffer);
  }

  if (isPdfFile(title, contentType, buffer)) {
    const pdfText = extractPdfText(buffer);
    return {
      title,
      text: pdfText.slice(0, 20000),
      readable: Boolean(pdfText.trim()),
      contentType,
      sourceKind: "pdf",
      reason: pdfText.trim()
        ? ""
        : ocrToolAvailable()
          ? "PDF downloaded, but text extraction found no readable text. OCR is available for image files; scanned PDFs may need page image conversion."
          : "PDF downloaded, but text extraction found no readable text. This is likely a scanned/image PDF and needs OCR tooling such as Tesseract plus PDF image conversion.",
    };
  }

  if (isImageFile(title, contentType)) {
    const ocrText = extractImageTextWithOcr(title, buffer);
    return {
      title,
      text: ocrText.slice(0, 16000),
      readable: Boolean(ocrText.trim()),
      contentType,
      sourceKind: "ocr",
      reason: ocrText.trim()
        ? ""
        : "Image downloaded, but OCR is not installed or could not read text from the image.",
    };
  }

  if (isZipFile(contentType, title, buffer)) {
    return processZipFile(title, buffer);
  }

  if (isReadableTextType(contentType, title)) {
    return {
      title,
      text: normalizeCodeOrText(title, buffer.toString("utf8")).slice(0, 16000),
      readable: true,
      contentType,
      sourceKind: isCodeFile(title) ? "code" : "text",
    };
  }

  return {
    title,
    text: "",
    readable: false,
    contentType,
    reason: `This file is ${contentType || "not plain text"}. It may need OCR or a DOCX/slides parser to read its full body.`,
  };
}

function processZipFile(title, buffer) {
  const entries = extractZipEntries(buffer)
    .filter((entry) => !entry.name.endsWith("/"))
    .filter((entry) => isUsefulArchiveFile(entry.name))
    .slice(0, 40);

  const chunks = [];

  for (const entry of entries) {
    const extracted = extractArchiveEntryText(entry.name, entry.content);

    if (!extracted.trim()) continue;
    chunks.push(`FILE: ${entry.name}\n${extracted.slice(0, 3600)}`);
  }

  if (!chunks.length) {
    return {
      title,
      text: "",
      readable: false,
      contentType: "application/zip",
      reason: "Zip opened, but no readable coding/text/notebook/PDF/DOCX/PPTX files were found inside.",
    };
  }

  return {
    title,
    text: chunks.join("\n\n---\n\n").slice(0, 30000),
    readable: true,
    contentType: "application/zip",
    sourceKind: "zip",
  };
}

function extractArchiveEntryText(name, content) {
  if (isNotebookFile(name, "")) return safelyExtractNotebookText(content.toString("utf8"));
  if (isOfficeDocumentFile(name, "", content)) return processOfficeDocument(name, "", content).text;
  if (isPdfFile(name, "", content)) return extractPdfText(content);
  if (isReadableTextType("", name)) return normalizeCodeOrText(name, content.toString("utf8"));
  return "";
}

function processOfficeDocument(title, contentType, buffer) {
  const entries = extractZipEntries(buffer);
  const lowerTitle = String(title || "").toLowerCase();
  const isPptx = lowerTitle.endsWith(".pptx") || String(contentType || "").includes("presentationml");
  const xmlEntries = entries
    .filter((entry) => isPptx ? /ppt\/slides\/slide\d+\.xml$/i.test(entry.name) : /word\/document\.xml$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
  const chunks = xmlEntries
    .map((entry) => extractOfficeXmlText(entry.content.toString("utf8")))
    .filter(Boolean);

  return {
    title,
    text: chunks.join("\n\n").slice(0, 24000),
    readable: Boolean(chunks.join("").trim()),
    contentType,
    sourceKind: isPptx ? "slides" : "docx",
    reason: chunks.length ? "" : "Office file opened, but no readable document or slide text was found.",
  };
}

function extractZipEntries(buffer) {
  const entries = [];
  let offset = 0;

  while (offset < buffer.length - 30) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = buffer.slice(nameStart, nameStart + fileNameLength).toString("utf8");

    if (dataEnd > buffer.length || !name) break;

    const compressed = buffer.slice(dataStart, dataEnd);
    let content = Buffer.alloc(0);

    try {
      if (compression === 0) content = compressed;
      if (compression === 8) content = zlib.inflateRawSync(compressed);
    } catch {
      content = Buffer.alloc(0);
    }

    if (content.length) entries.push({ name, content });
    offset = dataEnd;
  }

  return entries;
}

function extractNotebookText(rawJson) {
  const notebook = JSON.parse(rawJson);
  const cells = Array.isArray(notebook.cells) ? notebook.cells : [];
  const chunks = [];

  cells.slice(0, 80).forEach((cell, index) => {
    const source = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source || "");
    if (!source.trim()) return;

    if (cell.cell_type === "markdown") {
      chunks.push(`Markdown cell ${index + 1}:\n${stripHtml(source)}`);
      return;
    }

    if (cell.cell_type === "code") {
      chunks.push(`Code cell ${index + 1}:\n${source}`);
    }
  });

  return chunks.join("\n\n");
}

function safelyExtractNotebookText(rawJson) {
  try {
    return extractNotebookText(rawJson);
  } catch {
    return "";
  }
}

function extractOfficeXmlText(xml) {
  return decodeXmlEntities(
    String(xml || "")
      .replace(/<w:tab\/>/g, " ")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/a:p>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function decodeXmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function extractImageTextWithOcr(title, buffer) {
  if (!ocrToolAvailable()) return "";

  const extension = path.extname(title || "").toLowerCase() || ".png";
  const tempPath = path.join(os.tmpdir(), `canvas-tutor-ocr-${Date.now()}${extension}`);
  try {
    fs.writeFileSync(tempPath, buffer);
    return String(execFileSync("tesseract", [tempPath, "stdout"], { timeout: 20000 }) || "")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup failures for temporary OCR files.
    }
  }
}

function ocrToolAvailable() {
  try {
    execFileSync("tesseract", ["--version"], { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function extractPdfText(buffer) {
  const chunks = [];
  let cursor = 0;
  const marker = Buffer.from("stream");

  while (cursor < buffer.length) {
    const streamIndex = buffer.indexOf(marker, cursor);
    if (streamIndex === -1) break;

    let dataStart = streamIndex + marker.length;
    if (buffer[dataStart] === 0x0d && buffer[dataStart + 1] === 0x0a) dataStart += 2;
    else if (buffer[dataStart] === 0x0a || buffer[dataStart] === 0x0d) dataStart += 1;

    const endIndex = buffer.indexOf(Buffer.from("endstream"), dataStart);
    if (endIndex === -1) break;

    const objectStart = Math.max(0, buffer.lastIndexOf(Buffer.from("obj"), streamIndex) - 2500);
    const objectHeader = buffer.slice(objectStart, streamIndex).toString("latin1");
    const rawStream = buffer.slice(dataStart, endIndex);
    const decoded = decodePdfStream(rawStream, objectHeader);
    const text = extractPdfTextOperators(decoded.toString("latin1"));
    if (text.trim()) chunks.push(text);
    cursor = endIndex + 9;
  }

  return chunks
    .join("\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodePdfStream(stream, header) {
  if (!/\/FlateDecode\b/.test(header)) return stream;

  try {
    return zlib.inflateSync(stream);
  } catch {
    try {
      return zlib.inflateRawSync(stream);
    } catch {
      return Buffer.alloc(0);
    }
  }
}

function extractPdfTextOperators(content) {
  const parts = [];
  const operatorPattern = /\[((?:.|\n|\r)*?)\]\s*TJ|\((?:\\.|[^\\()])*\)\s*Tj|<([0-9a-fA-F\s]+)>\s*Tj/g;
  let match;

  while ((match = operatorPattern.exec(content))) {
    const token = match[0];
    if (token.endsWith("TJ")) {
      parts.push(extractPdfArrayText(match[1]));
      continue;
    }
    if (match[2]) {
      parts.push(decodePdfHex(match[2]));
      continue;
    }
    const literal = token.match(/\((?:\\.|[^\\()])*\)\s*Tj/);
    if (literal) parts.push(decodePdfLiteral(literal[0].replace(/\s*Tj$/, "")));
  }

  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
    .join(" ");
}

function extractPdfArrayText(value) {
  const parts = [];
  const pattern = /\((?:\\.|[^\\()])*\)|<([0-9a-fA-F\s]+)>/g;
  let match;

  while ((match = pattern.exec(value))) {
    if (match[1]) parts.push(decodePdfHex(match[1]));
    else parts.push(decodePdfLiteral(match[0]));
  }

  return parts.join(" ");
}

function decodePdfLiteral(value) {
  return String(value || "")
    .replace(/^\(|\)$/g, "")
    .replace(/\\([nrtbf()\\])/g, (_, char) => {
      const escapes = { n: "\n", r: "\r", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" };
      return escapes[char] ?? char;
    })
    .replace(/\\\d{1,3}/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodePdfHex(value) {
  const clean = String(value || "").replace(/\s+/g, "");
  const bytes = [];
  for (let index = 0; index < clean.length - 1; index += 2) {
    bytes.push(parseInt(clean.slice(index, index + 2), 16));
  }

  const buffer = Buffer.from(bytes);
  const ascii = buffer.toString("latin1");
  if (/^[\x09\x0a\x0d\x20-\x7e]+$/.test(ascii)) return ascii.replace(/\s+/g, " ").trim();

  const utf16be = [];
  for (let index = 0; index < buffer.length - 1; index += 2) {
    utf16be.push(buffer.readUInt16BE(index));
  }
  return String.fromCharCode(...utf16be)
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCodeOrText(title, rawText) {
  if (isCodeFile(title)) {
    const lines = rawText.split(/\r?\n/);
    const imports = lines.filter((line) => /^(import|from|const|let|var|#include|using)\b/.test(line.trim())).slice(0, 20);
    const definitions = lines
      .filter((line) => /\b(function|def|class|interface|public|private|protected)\b/.test(line.trim()))
      .slice(0, 30);
    return [
      imports.length ? `Imports and setup:\n${imports.join("\n")}` : "",
      definitions.length ? `Important definitions:\n${definitions.join("\n")}` : "",
      `Code excerpt:\n${rawText.slice(0, 6000)}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return stripHtml(rawText);
}

function isReadableTextType(contentType, title) {
  const lowerType = String(contentType || "").toLowerCase();
  const lowerTitle = String(title || "").toLowerCase();

  return (
    lowerType.startsWith("text/") ||
    lowerType.includes("json") ||
    lowerType.includes("xml") ||
    lowerType.includes("html") ||
    [".txt", ".md", ".csv", ".json", ".html", ".htm", ".rtf", ".py", ".js", ".ts", ".java", ".c", ".cpp", ".h", ".cs", ".sql", ".r", ".ipynb", ".pynb"].some((extension) =>
      lowerTitle.endsWith(extension),
    )
  );
}

function isZipFile(contentType, title, buffer) {
  const lowerType = String(contentType || "").toLowerCase();
  const lowerTitle = String(title || "").toLowerCase();
  return (
    lowerTitle.endsWith(".zip") ||
    lowerType.includes("zip") ||
    (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50)
  );
}

function isNotebookFile(title, contentType) {
  const lowerTitle = String(title || "").toLowerCase();
  return lowerTitle.endsWith(".ipynb") || lowerTitle.endsWith(".pynb") || String(contentType || "").includes("x-ipynb");
}

function isOfficeDocumentFile(title, contentType, buffer) {
  const lowerTitle = String(title || "").toLowerCase();
  const lowerType = String(contentType || "").toLowerCase();
  return (
    lowerTitle.endsWith(".docx") ||
    lowerTitle.endsWith(".pptx") ||
    lowerType.includes("wordprocessingml") ||
    lowerType.includes("presentationml") ||
    (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50 && (lowerTitle.endsWith(".docx") || lowerTitle.endsWith(".pptx")))
  );
}

function isPdfFile(title, contentType, buffer) {
  const lowerType = String(contentType || "").toLowerCase();
  const lowerTitle = String(title || "").toLowerCase();
  return (
    lowerTitle.endsWith(".pdf") ||
    lowerType.includes("pdf") ||
    buffer.slice(0, 5).toString("latin1") === "%PDF-"
  );
}

function isImageFile(title, contentType) {
  const lowerTitle = String(title || "").toLowerCase();
  const lowerType = String(contentType || "").toLowerCase();
  return (
    lowerType.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"].some((extension) => lowerTitle.endsWith(extension))
  );
}

function isCodeFile(title) {
  return [".py", ".js", ".ts", ".java", ".c", ".cpp", ".h", ".cs", ".sql", ".r", ".rb", ".go", ".php"].some((extension) =>
    String(title || "").toLowerCase().endsWith(extension),
  );
}

function isUsefulArchiveFile(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.includes("__macosx/") || lower.includes("node_modules/") || lower.includes(".git/")) return false;
  return [
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".html",
    ".htm",
    ".py",
    ".js",
    ".ts",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".cs",
    ".sql",
    ".r",
    ".ipynb",
    ".pynb",
    ".pdf",
    ".docx",
    ".pptx",
    ".png",
    ".jpg",
    ".jpeg",
    ".tif",
    ".tiff",
    ".bmp",
  ].some((extension) => lower.endsWith(extension));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function canvasErrorText(payload) {
  if (payload?.message) return payload.message;
  if (Array.isArray(payload?.errors) && payload.errors[0]?.message) {
    return payload.errors[0].message;
  }
  if (payload?.errors) return JSON.stringify(payload.errors);
  return "";
}

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  console.log(`Canvas Tutor Agent running at http://${displayHost}:${port}`);
  console.log(deliveryNote());
});

startDailyDigestScheduler();
