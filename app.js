const canvas = document.querySelector("#canvas");
const linkLayer = document.querySelector(".link-layer");
const selectedSummary = document.querySelector("#selected-summary");
const responseTitle = document.querySelector("#response-title");
const responseBody = document.querySelector("#response-body");
const canvasUrlInput = document.querySelector("#canvas-url");
const canvasTokenInput = document.querySelector("#canvas-token");
const canvasStatus = document.querySelector("#canvas-status");
const connectCanvasButton = document.querySelector("#connect-canvas");
const importCanvasButton = document.querySelector("#import-canvas");
const digestEmailInput = document.querySelector("#digest-email");
const digestTimeInput = document.querySelector("#digest-time");
const mailStatus = document.querySelector("#mail-status");
const saveDigestButton = document.querySelector("#save-digest");
const sendTestDigestButton = document.querySelector("#send-test-digest");
const checkDigestStatusButton = document.querySelector("#check-digest-status");
const focusSprintButton = document.querySelector("#focus-sprint");
const sprintCard = document.querySelector("#sprint-card");
const sprintTitle = document.querySelector("#sprint-title");
const sprintTimer = document.querySelector("#sprint-timer");
const sprintTasks = document.querySelector("#sprint-tasks");
const sprintProgressBar = document.querySelector("#sprint-progress-bar");
const sprintStartButton = document.querySelector("#sprint-start");
const sprintPauseButton = document.querySelector("#sprint-pause");
const sprintResetButton = document.querySelector("#sprint-reset");

const palette = ["yellow", "coral", "blue", "violet", "green"];
const requestTimeoutMs = 15000;
const savedCanvasUrl = localStorage.getItem("canvasTutor.canvasUrl");
const savedDigestEmail = localStorage.getItem("canvasTutor.digestEmail");
const savedDigestTime = localStorage.getItem("canvasTutor.digestTime");

let canvasConnection = {
  baseUrl: savedCanvasUrl || "",
  token: "",
  profile: null,
  courses: [],
};

if (savedCanvasUrl) {
  canvasUrlInput.value = savedCanvasUrl;
}

if (savedDigestEmail) {
  digestEmailInput.value = savedDigestEmail;
}

if (savedDigestTime) {
  digestTimeInput.value = savedDigestTime;
}

let notes = [];

let selectedId = null;
let zCounter = 10;
let sprint = {
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  timerId: null,
  tasks: [],
};
let activeCourseContext = null;

function render() {
  canvas.querySelectorAll(".note").forEach((node) => node.remove());

  notes.forEach((note) => {
    const element = document.createElement("article");
    element.className = `note${note.id === selectedId ? " is-selected" : ""}`;
    element.dataset.id = note.id;
    element.dataset.color = note.color;
    element.style.left = `${note.x}px`;
    element.style.top = `${note.y}px`;
    element.innerHTML = `
      <small>${note.topic}</small>
      <h3>${escapeHtml(note.title)}</h3>
      <p>${escapeHtml(note.content)}</p>
    `;

    element.addEventListener("pointerdown", startDrag);
    element.addEventListener("click", () => selectNote(note.id));
    canvas.appendChild(element);
  });

  updateLinks();
  updateSelectedSummary();
}

function selectNote(id) {
  selectedId = id;
  render();
}

function updateSelectedSummary() {
  const note = getSelectedNote();
  selectedSummary.textContent = note
    ? `${note.title} is selected.`
    : "Select a note on the canvas.";
}

function updateLinks() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  linkLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);
  linkLayer.innerHTML = "";

  const pairs = notes.slice(1).map((note) => [notes[0]?.id, note.id]);

  pairs.forEach(([fromId, toId]) => {
    const from = notes.find((note) => note.id === fromId);
    const to = notes.find((note) => note.id === toId);
    if (!from || !to) return;

    const x1 = from.x + 110;
    const y1 = from.y + 64;
    const x2 = to.x + 110;
    const y2 = to.y + 64;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const midX = (x1 + x2) / 2;
    path.setAttribute(
      "d",
      `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(47, 125, 91, 0.36)");
    path.setAttribute("stroke-width", "3");
    path.setAttribute("stroke-linecap", "round");
    linkLayer.appendChild(path);
  });
}

function startDrag(event) {
  const element = event.currentTarget;
  const id = element.dataset.id;
  const note = notes.find((item) => item.id === id);
  selectNote(id);
  element.style.zIndex = `${++zCounter}`;
  element.setPointerCapture(event.pointerId);

  const startX = event.clientX;
  const startY = event.clientY;
  const originalX = note.x;
  const originalY = note.y;

  function move(pointerEvent) {
    const bounds = canvas.getBoundingClientRect();
    const nextX = originalX + pointerEvent.clientX - startX;
    const nextY = originalY + pointerEvent.clientY - startY;
    note.x = clamp(nextX, 12, bounds.width - element.offsetWidth - 12);
    note.y = clamp(nextY, 12, bounds.height - element.offsetHeight - 12);
    element.style.left = `${note.x}px`;
    element.style.top = `${note.y}px`;
    updateLinks();
  }

  function stop() {
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", stop);
    element.removeEventListener("pointercancel", stop);
  }

  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", stop);
  element.addEventListener("pointercancel", stop);
}

async function connectCanvas() {
  const baseUrl = normalizeCanvasUrl(canvasUrlInput.value);
  const token = canvasTokenInput.value.trim();

  if (!baseUrl || !token) {
    setCanvasStatus("Missing info", "error");
    showResponse(
      "Canvas Connection",
      "<p>Add your school Canvas URL and an access token. Keep the token private; paste it only into the app.</p>",
    );
    return;
  }

  setCanvasStatus("Connecting...", "");
  connectCanvasButton.disabled = true;

  try {
    const profile = await canvasApiFetch(baseUrl, token, "/api/v1/users/self/profile");
    const courses = await fetchCanvasCourses(baseUrl, token);
    canvasConnection = { baseUrl, token, profile, courses };
    localStorage.setItem("canvasTutor.canvasUrl", baseUrl);
    setCanvasStatus("Connected", "connected");
    importCanvasButton.disabled = false;
    showStudyAreas(courses, profile);
  } catch (error) {
    canvasConnection = { baseUrl: "", token: "", profile: null, courses: [] };
    importCanvasButton.disabled = true;
    setCanvasStatus("Failed", "error");
    showResponse("Canvas Connection Failed", canvasErrorMessage(error));
  } finally {
    connectCanvasButton.disabled = false;
  }
}

async function fetchCanvasCourses(baseUrl, token) {
  const params = new URLSearchParams({
    enrollment_state: "active",
    per_page: "20",
  });
  params.append("include[]", "term");
  params.append("include[]", "total_scores");
  const courses = await canvasApiFetch(baseUrl, token, `/api/v1/courses?${params.toString()}`);

  return Array.isArray(courses)
    ? courses
        .filter((course) => course.id && course.name)
        .map((course) => ({
          id: course.id,
          name: course.name,
          courseCode: course.course_code || "",
          term: course.term?.name || "",
        }))
    : [];
}

function showStudyAreas(courses, profile) {
  if (!courses.length) {
    showResponse(
      "Canvas Connected",
      `<p>Connected as <strong>${escapeHtml(profile.name || profile.short_name || "Canvas user")}</strong>.</p>
       <p>I could not find active courses. You can still use <strong>Import Work</strong> to bring Canvas planner items into the board.</p>`,
    );
    return;
  }

  showResponse(
    "Choose Study Area",
    `<p>Connected as <strong>${escapeHtml(profile.name || profile.short_name || "Canvas user")}</strong>. Pick a course and I will show what to focus on first.</p>
     <div class="study-area-grid">
      ${courses
        .map(
          (course) => `
            <button class="study-area-btn" type="button" data-course-id="${course.id}">
              <strong>${escapeHtml(course.name)}</strong>
              <span>${escapeHtml(course.courseCode || course.term || "Canvas course")}</span>
            </button>
          `,
        )
        .join("")}
     </div>`,
  );
  bindStudyAreaButtons();
}

function bindStudyAreaButtons() {
  responseBody.querySelectorAll(".study-area-btn").forEach((button) => {
    button.addEventListener("click", () => selectStudyArea(button.dataset.courseId));
  });
}

async function selectStudyArea(courseId) {
  const course = canvasConnection.courses.find((item) => String(item.id) === String(courseId));
  if (!course) return;

  showResponse(
    "Loading Study Area",
    `<p>Reviewing <strong>${escapeHtml(course.name)}</strong> and finding what needs attention.</p>`,
  );

  try {
    const [assignments, modules, postedNotes] = await Promise.all([
      fetchCourseAssignments(course.id),
      fetchCourseModules(course.id),
      fetchCoursePostedNotes(course.id),
    ]);
    activeCourseContext = { course, assignments, modules, postedNotes };
    const courseNote = makeCourseFocusNote(course, assignments);
    notes = [...notes.filter((note) => note.id !== courseNote.id), courseNote];
    selectedId = courseNote.id;
    render();

    showResponse("Study Area: " + course.name, renderStudyAreaDetails(course, assignments, modules, postedNotes));
    bindStudyAreaActions(course, assignments, modules, postedNotes);
  } catch (error) {
    showResponse(
      "Study Area Failed",
      `<p>${escapeHtml(error.message)}</p>
       <p>Try <strong>Import Work</strong>, or choose another Canvas course.</p>`,
    );
  }
}

async function fetchCourseAssignments(courseId) {
  const params = new URLSearchParams({
    bucket: "upcoming",
    order_by: "due_at",
    per_page: "10",
  });
  const assignments = await canvasApiFetch(
    canvasConnection.baseUrl,
    canvasConnection.token,
    `/api/v1/courses/${courseId}/assignments?${params.toString()}`,
  );

  return Array.isArray(assignments)
    ? assignments.map((assignment) => ({
        id: assignment.id,
        name: assignment.name || "Untitled assignment",
        dueAt: assignment.due_at || "",
        points: assignment.points_possible,
        description: stripHtml(assignment.description || ""),
        htmlUrl: assignment.html_url || "",
      }))
    : [];
}

async function fetchCourseModules(courseId) {
  const params = new URLSearchParams({
    per_page: "100",
  });

  const modules = await canvasApiFetch(
    canvasConnection.baseUrl,
    canvasConnection.token,
    `/api/v1/courses/${courseId}/modules?${params.toString()}`,
  );

  if (!Array.isArray(modules)) return [];

  const courseModules = [];

  for (const module of modules) {
    const itemParams = new URLSearchParams({ per_page: "100" });
    itemParams.append("include[]", "content_details");
    const moduleItems = await canvasApiFetch(
      canvasConnection.baseUrl,
      canvasConnection.token,
      `/api/v1/courses/${courseId}/modules/${module.id}/items?${itemParams.toString()}`,
    );

    courseModules.push({
      id: module.id,
      name: module.name || "Untitled module",
      position: module.position || 0,
      hydrated: false,
      items: (Array.isArray(moduleItems) ? moduleItems : []).map((item) =>
        normalizeModuleItem(module.name || "Untitled module", item),
      ),
    });
  }

  return courseModules;
}

async function fetchCoursePostedNotes(courseId) {
  const [pages, announcements, discussions] = await Promise.all([
    fetchCoursePages(courseId),
    fetchCourseAnnouncements(courseId),
    fetchCourseDiscussions(courseId),
  ]);

  return [...pages, ...announcements, ...discussions]
    .filter((note) => note.title || note.summary)
    .slice(0, 50);
}

async function fetchCoursePages(courseId) {
  try {
    const params = new URLSearchParams({
      sort: "updated_at",
      order: "desc",
      per_page: "12",
    });
    const pages = await canvasApiFetch(
      canvasConnection.baseUrl,
      canvasConnection.token,
      `/api/v1/courses/${courseId}/pages?${params.toString()}`,
    );

    const detailedPages = [];
    for (const page of Array.isArray(pages) ? pages.slice(0, 8) : []) {
      const detail = await canvasApiFetch(
        canvasConnection.baseUrl,
        canvasConnection.token,
        `/api/v1/courses/${courseId}/pages/${encodeURIComponent(page.url)}`,
      );
      detailedPages.push({
        id: `page-${detail.page_id || detail.url}`,
        title: detail.title || page.title || "Course page",
        type: "Page",
        summary: stripHtml(detail.body || ""),
        updatedAt: detail.updated_at || page.updated_at || "",
      });
    }
    return detailedPages;
  } catch {
    return [];
  }
}

async function fetchCourseAnnouncements(courseId) {
  try {
    const params = new URLSearchParams({
      per_page: "12",
    });
    params.append("context_codes[]", `course_${courseId}`);
    const announcements = await canvasApiFetch(
      canvasConnection.baseUrl,
      canvasConnection.token,
      `/api/v1/announcements?${params.toString()}`,
    );

    return Array.isArray(announcements)
      ? announcements.map((announcement) => ({
          id: `announcement-${announcement.id}`,
          title: announcement.title || "Announcement",
          type: "Announcement",
          summary: stripHtml(announcement.message || ""),
          updatedAt: announcement.posted_at || "",
        }))
      : [];
  } catch {
    return [];
  }
}

async function fetchCourseDiscussions(courseId) {
  try {
    const params = new URLSearchParams({
      per_page: "12",
    });
    const discussions = await canvasApiFetch(
      canvasConnection.baseUrl,
      canvasConnection.token,
      `/api/v1/courses/${courseId}/discussion_topics?${params.toString()}`,
    );

    return Array.isArray(discussions)
      ? discussions.map((discussion) => ({
          id: `discussion-${discussion.id}`,
          title: discussion.title || "Discussion",
          type: "Discussion",
          summary: stripHtml(discussion.message || ""),
          updatedAt: discussion.posted_at || discussion.last_reply_at || "",
        }))
      : [];
  } catch {
    return [];
  }
}

async function hydrateModuleItem(courseId, moduleName, item) {
  const baseItem = normalizeModuleItem(moduleName, item);
  const apiPath = canvasApiPathFromUrl(baseItem.apiUrl);

  try {
    if (baseItem.type === "Page") {
      const page = await fetchModulePageBody(courseId, baseItem, apiPath);
      return {
        ...baseItem,
        title: page.title || baseItem.title,
        summary: page.summary,
        readable: Boolean(page.summary),
        sourceKind: "page",
        readDebug: page.debug,
      };
    }

    if (baseItem.type === "Assignment" && !baseItem.contentId && apiPath) {
      const assignment = await canvasApiFetch(canvasConnection.baseUrl, canvasConnection.token, apiPath);
      return {
        ...baseItem,
        title: assignment.name || baseItem.title,
        summary: stripHtml(assignment.description || ""),
      };
    }

    if (baseItem.type === "Assignment" && baseItem.contentId) {
      const assignment = await fetchAssignmentDetail(courseId, baseItem.contentId);
      return {
        ...baseItem,
        title: assignment.name || baseItem.title,
        summary: assignment.description || "",
      };
    }

    if (baseItem.type === "Discussion" && !baseItem.contentId && apiPath) {
      const discussion = await canvasApiFetch(canvasConnection.baseUrl, canvasConnection.token, apiPath);
      return {
        ...baseItem,
        title: discussion.title || baseItem.title,
        summary: stripHtml(discussion.message || ""),
      };
    }

    if (baseItem.type === "Discussion" && baseItem.contentId) {
      const discussion = await canvasApiFetch(
        canvasConnection.baseUrl,
        canvasConnection.token,
        `/api/v1/courses/${courseId}/discussion_topics/${baseItem.contentId}`,
      );
      return {
        ...baseItem,
        title: discussion.title || baseItem.title,
        summary: stripHtml(discussion.message || ""),
      };
    }

    if (baseItem.type === "Quiz" && !baseItem.contentId && apiPath) {
      const quiz = await canvasApiFetch(canvasConnection.baseUrl, canvasConnection.token, apiPath);
      return {
        ...baseItem,
        title: quiz.title || baseItem.title,
        summary: stripHtml(quiz.description || ""),
      };
    }

    if (baseItem.type === "Quiz" && baseItem.contentId) {
      const quiz = await canvasApiFetch(
        canvasConnection.baseUrl,
        canvasConnection.token,
        `/api/v1/courses/${courseId}/quizzes/${baseItem.contentId}`,
      );
      return {
        ...baseItem,
        title: quiz.title || baseItem.title,
        summary: stripHtml(quiz.description || ""),
      };
    }

    if (baseItem.type === "File" && (baseItem.contentId || apiPath)) {
      const fileText = await canvasFileTextFetch(
        canvasConnection.baseUrl,
        canvasConnection.token,
        baseItem.contentId,
        apiPath,
      );
      return {
        ...baseItem,
        title: fileText.title || baseItem.title,
        summary: fileText.readable
          ? fileText.text
          : `${fileText.contentType || "File"} · ${fileText.reason || "Canvas did not expose readable text for this file."}`,
        readable: fileText.readable,
        sourceKind: fileText.sourceKind || "file",
        readDebug: fileText.debug || baseItem.readDebug,
      };
    }

    if (baseItem.type === "File") {
      return {
        ...baseItem,
        summary: "Canvas module item did not include a file id or file API URL for the tutor app to download.",
        readable: false,
        sourceKind: "file",
      };
    }
  } catch (error) {
    return {
      ...baseItem,
      summary: `${baseItem.type} reader failed: ${error.message || "Canvas did not return readable content."}`,
      readable: false,
      readDebug: baseItem.readDebug || apiPath,
    };
  }

  return baseItem;
}

function normalizeModuleItem(moduleName, item) {
  const contentDetails = item.content_details || {};
  const candidateUrls = [
    item.url,
    contentDetails.url,
    contentDetails.file_url,
    contentDetails.html_url,
    item.html_url,
    item.external_url,
  ];
  const contentId = item.content_id || contentDetails.id || firstCanvasFileId(candidateUrls) || "";
  const apiUrl = item.url || contentDetails.url || "";
  return {
    id: item.id,
    title: item.title || item.type || "Module item",
    type: item.type || "Item",
    contentId,
    pageUrl: item.page_url || contentDetails.page_url || "",
    htmlUrl: item.html_url || item.external_url || contentDetails.html_url || contentDetails.url || "",
    apiUrl,
    readDebug: moduleItemDebugPath({ ...item, content_id: contentId, url: apiUrl, candidateUrls }),
    moduleName,
    summary: "",
  };
}

function moduleItemDebugPath(item) {
  const apiPath = canvasApiPathFromUrl(item.url || "");
  const parts = [];
  if (apiPath) parts.push(apiPath);
  if (item.content_id) parts.push(`content_id:${item.content_id}`);
  if (item.page_url || item.content_details?.page_url) parts.push(`page:${item.page_url || item.content_details.page_url}`);
  const urls = Array.isArray(item.candidateUrls) ? item.candidateUrls : [];
  urls.map(safeCanvasPath).filter(Boolean).forEach((path) => {
    if (!parts.includes(path)) parts.push(path);
  });
  return parts.join(" | ");
}

function firstCanvasFileId(urls) {
  for (const url of urls) {
    const match = String(url || "").match(/(?:\/api\/v1)?(?:\/courses\/\d+)?\/files\/(\d+)/);
    if (match) return match[1];
  }
  return "";
}

function safeCanvasPath(url) {
  const value = String(url || "");
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return parsed.pathname;
  } catch {
    return value.startsWith("/") ? value.split("?")[0] : "";
  }
}

async function fetchModulePageBody(courseId, baseItem, apiPath) {
  const pageSlugs = uniqueValues([
    baseItem.pageUrl,
    pageSlugFromApiPath(apiPath),
    pageSlugFromCanvasUrl(baseItem.htmlUrl),
  ]);
  const debugPaths = [];

  for (const slug of pageSlugs) {
    const result = await fetchCanvasPageBySlug(courseId, slug);
    debugPaths.push(result.debug);
    if (result.summary) return result;
  }

  if (apiPath) {
    try {
      debugPaths.push(apiPath);
      const itemDetail = await canvasApiFetch(canvasConnection.baseUrl, canvasConnection.token, apiPath);
      const detailSlugs = uniqueValues([
        itemDetail.page_url,
        pageSlugFromApiPath(itemDetail.url),
        itemDetail.content_details?.page_url,
        pageSlugFromCanvasUrl(itemDetail.html_url || itemDetail.external_url || ""),
      ]);

      if (itemDetail.body) {
        return {
          title: itemDetail.title || baseItem.title,
          summary: stripHtml(itemDetail.body || ""),
          debug: apiPath,
        };
      }

      for (const slug of detailSlugs) {
        const result = await fetchCanvasPageBySlug(courseId, slug);
        debugPaths.push(result.debug);
        if (result.summary) return result;
      }
    } catch {
      return {
        title: baseItem.title,
        summary: "",
        debug: debugPaths.filter(Boolean).join(" | ") || apiPath,
      };
    }
  }

  return {
    title: baseItem.title,
    summary: "",
    debug: debugPaths.filter(Boolean).join(" | "),
  };
}

async function fetchCanvasPageBySlug(courseId, slug) {
  const pageSlug = String(slug || "").trim();
  if (!pageSlug) return { title: "", summary: "", debug: "" };

  const apiPath = `/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageSlug)}`;
  try {
    const page = await canvasApiFetch(canvasConnection.baseUrl, canvasConnection.token, apiPath);
    return {
      title: page.title || "",
      summary: stripHtml(page.body || ""),
      debug: apiPath,
    };
  } catch {
    return { title: "", summary: "", debug: apiPath };
  }
}

function pageSlugFromApiPath(apiPath) {
  const match = String(apiPath || "").match(/\/pages\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function pageSlugFromCanvasUrl(url) {
  const match = String(url || "").match(/\/pages\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function uniqueValues(values) {
  return values.filter(Boolean).filter((value, index, array) => array.indexOf(value) === index);
}

function canvasApiPathFromUrl(url) {
  const value = String(url || "");
  const apiIndex = value.indexOf("/api/v1/");
  if (apiIndex === -1) return "";
  return value.slice(apiIndex);
}

async function fetchAssignmentDetail(courseId, assignmentId) {
  const params = new URLSearchParams();
  params.append("include[]", "rubric");
  params.append("include[]", "submission");
  const assignment = await canvasApiFetch(
    canvasConnection.baseUrl,
    canvasConnection.token,
    `/api/v1/courses/${courseId}/assignments/${assignmentId}?${params.toString()}`,
  );

  return {
    id: assignment.id,
    name: assignment.name || "Untitled assignment",
    dueAt: assignment.due_at || "",
    points: assignment.points_possible,
    description: stripHtml(assignment.description || ""),
    htmlUrl: assignment.html_url || "",
    rubric: Array.isArray(assignment.rubric)
      ? assignment.rubric.map((item) => ({
          description: item.description || "",
          longDescription: stripHtml(item.long_description || ""),
          points: item.points,
        }))
      : [],
  };
}

function makeCourseFocusNote(course, assignments) {
  const next = assignments[0];
  const focusText = next
    ? `Next focus: ${next.name}${next.dueAt ? ` due ${formatDate(next.dueAt)}` : ""}. ${focusAdviceFromText(next.name, next.description)}`
    : "No upcoming assignments found. Use this area to review notes, prepare questions, and make flashcards.";

  return {
    id: `course-focus-${course.id}`,
    title: course.name,
    content: focusText,
    topic: "Study area",
    color: "violet",
    x: 90 + (notes.length % 3) * 235,
    y: 110 + Math.floor(notes.length / 3) * 175,
  };
}

function renderStudyAreaDetails(course, assignments, modules = [], postedNotes = []) {
  const moduleRows = modules.length
    ? modules
        .slice(0, 10)
        .map(
          (module) => `
            <div class="module-row">
              <strong>${escapeHtml(module.name)}</strong>
              <span>${module.items.length} item${module.items.length === 1 ? "" : "s"}</span>
              <div class="module-actions">
                <button class="mini-action" type="button" data-module-notes="${module.id}">Study Module</button>
                <button class="mini-action secondary" type="button" data-module-flashcards="${module.id}">Generate Flashcards</button>
                <button class="mini-action secondary" type="button" data-module-quiz="${module.id}">Make Quiz</button>
              </div>
            </div>
          `,
        )
        .join("")
    : `<div class="module-row"><strong>No modules found</strong><span>Canvas did not return module content for this course.</span></div>`;
  const assignmentRows = assignments.length
    ? assignments
        .slice(0, 5)
        .map(
          (assignment) => `
            <div class="assignment-row">
              <strong>${escapeHtml(assignment.name)}</strong>
              <span>${escapeHtml(assignment.dueAt ? `Due ${formatDate(assignment.dueAt)}` : "No due date")}</span>
              <p>${escapeHtml(focusAdviceFromText(assignment.name, assignment.description))}</p>
              <button class="mini-action" type="button" data-plan-assignment="${assignment.id}">Plan Assignment</button>
            </div>
          `,
        )
        .join("")
    : `<div class="assignment-row"><strong>No upcoming assignments</strong><p>Review your course notes and make two practice questions from the newest topic.</p></div>`;

  return `
    <p><strong>${escapeHtml(course.name)}</strong> is now your active study area.</p>
    <div class="course-scan">
      <strong>Course scan</strong>
      <span>${modules.length} module${modules.length === 1 ? "" : "s"} · ${postedNotes.length} posted note${postedNotes.length === 1 ? "" : "s"} · ${assignments.length} upcoming assignment${assignments.length === 1 ? "" : "s"}</span>
    </div>
    <div class="coach-section">
      <h3>Select Module</h3>
      <div class="map">${moduleRows}</div>
    </div>
    <div class="coach-section">
      <h3>Upcoming Assignments</h3>
    </div>
    <div class="map">${assignmentRows}</div>
    <button class="inline-action" id="add-course-assignments" type="button">Add These To Canvas</button>
  `;
}

function bindStudyAreaActions(course, assignments, modules, postedNotes = []) {
  const button = responseBody.querySelector("#add-course-assignments");
  if (button) button.addEventListener("click", () => {
    if (!assignments.length) return;
    const newNotes = assignments.slice(0, 5).map((assignment, index) => ({
      id: `course-${course.id}-assignment-${assignment.id}`,
      title: assignment.name,
      content: `${assignment.dueAt ? `Due ${formatDate(assignment.dueAt)}. ` : ""}${focusAdviceFromText(assignment.name, assignment.description)}`,
      topic: course.name,
      color: palette[(notes.length + index) % palette.length],
      x: 80 + ((notes.length + index) % 3) * 235,
      y: 90 + Math.floor((notes.length + index) / 3) * 180,
    }));
    notes = [...notes, ...newNotes];
    selectedId = newNotes[0].id;
    autoLayout();
  });

  responseBody.querySelectorAll("[data-plan-assignment]").forEach((planButton) => {
    planButton.addEventListener("click", () =>
      planAssignment(course, assignments, modules, postedNotes, planButton.dataset.planAssignment),
    );
  });

  responseBody.querySelectorAll("[data-module-notes]").forEach((moduleButton) => {
    moduleButton.addEventListener("click", () =>
      generateModuleNotes(course, modules, moduleButton.dataset.moduleNotes),
    );
  });

  responseBody.querySelectorAll("[data-module-quiz]").forEach((moduleButton) => {
    moduleButton.addEventListener("click", () =>
      generateModuleQuiz(course, modules, moduleButton.dataset.moduleQuiz),
    );
  });

  responseBody.querySelectorAll("[data-module-flashcards]").forEach((moduleButton) => {
    moduleButton.addEventListener("click", () =>
      generateModuleFlashcards(course, modules, moduleButton.dataset.moduleFlashcards),
    );
  });
}

async function generateModuleNotes(course, modules, moduleId) {
  const module = await hydrateSelectedModule(course, modules, moduleId, "Studying Module");
  if (!module) return;
  const analysis = analyzeModule(module);
  const note = {
    id: `module-note-${course.id}-${module.id}`,
    title: `Notes: ${module.name}`,
    content: [
      analysis.overview,
      ...analysis.keyPoints.map((point) => `Key point: ${point}`),
      ...analysis.keyTerms.map((term) => `Term: ${term.term} - ${term.definition}`),
    ].join(" "),
    topic: course.name,
    color: "yellow",
    x: 95 + (notes.length % 3) * 235,
    y: 115 + Math.floor(notes.length / 3) * 175,
  };

  notes = [...notes.filter((item) => item.id !== note.id), note];
  selectedId = note.id;
  render();
  showResponse("Module Study Notes", renderModuleNotes(course, module, analysis));
  bindModuleNoteActions(course, module);
}

async function generateModuleQuiz(course, modules, moduleId) {
  const module = await hydrateSelectedModule(course, modules, moduleId, "Building Module Quiz");
  if (!module) return;

  showResponse("Module MCQ Quiz", renderModuleQuiz(course, module));
  bindModuleNoteActions(course, module);
}

async function generateModuleFlashcards(course, modules, moduleId) {
  const module = await hydrateSelectedModule(course, modules, moduleId, "Building Flashcards");
  if (!module) return;

  showResponse("Module Flashcards", renderModuleFlashcards(course, module));
  bindModuleNoteActions(course, module);
}

async function hydrateSelectedModule(course, modules, moduleId, title) {
  const module = modules.find((item) => String(item.id) === String(moduleId));
  if (!module) return null;
  if (module.hydrated) return module;

  showResponse(
    title,
    `<p>Opening <strong>${escapeHtml(module.name)}</strong> and reading its Canvas pages, files, quizzes, and assignments now.</p>`,
  );

  const hydratedItems = [];
  for (const item of module.items) {
    hydratedItems.push(await hydrateModuleItem(course.id, module.name, item));
  }

  module.items = hydratedItems;
  module.hydrated = true;
  return module;
}

function renderModuleNotes(course, module, analysis = analyzeModule(module)) {
  const keyItems = module.items.filter((item) => item.summary || item.title).slice(0, 6);
  const stats = moduleSourceStats(module);
  return `
    <p><strong>${escapeHtml(module.name)}</strong> · ${escapeHtml(course.name)}</p>
    <div class="course-scan">
      <strong>Module scan</strong>
      <span>${stats.total} item${stats.total === 1 ? "" : "s"} scanned · ${stats.readable} with readable Canvas content</span>
    </div>
    <div class="explain-box">
      <p>${escapeHtml(analysis.overview)}</p>
    </div>
    <div class="coach-section">
      <h3>Learning Goals</h3>
      <ul>${analysis.learningGoals.map((goal) => `<li>${escapeHtml(goal)}</li>`).join("")}</ul>
    </div>
    <div class="coach-section">
      <h3>Core Concepts</h3>
      <div class="map">
        ${analysis.concepts
          .map(
            (concept) => `
              <div class="study-card">
                <strong>${escapeHtml(concept.title)}</strong>
                <span>${escapeHtml(concept.source)}</span>
                <p>${escapeHtml(concept.explanation)}</p>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
    <div class="coach-section">
      <h3>Flashcards From Module Content</h3>
      <div class="map">
        ${
          analysis.flashcards.length
            ? analysis.flashcards
                .map(
                  (card) => `
                    <div class="flashcard">
                      <strong>Q: ${escapeHtml(card.question)}</strong>
                      <span>A: ${escapeHtml(card.answer)}</span>
                    </div>
                  `,
                )
                .join("")
            : "<p>No flashcards generated from readable module content.</p>"
        }
      </div>
    </div>
    <div class="coach-section">
      <h3>Key Terms</h3>
      <div class="map">
        ${
          analysis.keyTerms.length
            ? analysis.keyTerms
                .map(
                  (term) => `
                    <div class="flashcard">
                      <strong>${escapeHtml(term.term)}</strong>
                      <span>${escapeHtml(term.definition)}</span>
                    </div>
                  `,
                )
                .join("")
            : "<p>No clear vocabulary terms found. Use the item titles as study anchors.</p>"
        }
      </div>
    </div>
    <div class="coach-section">
      <h3>How To Study This Module</h3>
      <ol>${analysis.studySteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    </div>
    <div class="coach-section">
      <h3>Coding Practice</h3>
      <ol>${analysis.practiceTasks.map((task) => `<li>${escapeHtml(task)}</li>`).join("")}</ol>
    </div>
    <div class="coach-section">
      <h3>Common Mistakes</h3>
      <ul>${analysis.commonMistakes.map((mistake) => `<li>${escapeHtml(mistake)}</li>`).join("")}</ul>
    </div>
    <div class="coach-section">
      <h3>Important Material</h3>
      ${
        keyItems.length
          ? keyItems
              .map(
                (item) => `
                  <div class="module-row">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(moduleItemLabel(item))}</span>
                    ${item.summary ? `<p>${escapeHtml(shorten(item.summary, 150))}</p>` : ""}
                    ${item.readDebug ? `<p>Canvas path: ${escapeHtml(item.readDebug)}</p>` : ""}
                  </div>
                `,
              )
              .join("")
          : "<p>No readable module content found. Use the module item titles as your guide.</p>"
      }
    </div>
    <div class="connect-actions">
      <button class="primary-btn" type="button" id="module-note-again">Add Study Note</button>
      <button type="button" id="module-quiz-from-notes">Make Quiz</button>
    </div>
    ${renderDownloadedFileImport("notes")}
  `;
}

function renderModuleQuiz(course, module) {
  const analysis = analyzeModule(module);
  const questions = buildModuleMcqQuiz(module, analysis);
  const stats = moduleSourceStats(module);
  return `
    <p><strong>${escapeHtml(module.name)}</strong> · ${escapeHtml(course.name)}</p>
    <div class="course-scan">
      <strong>Quiz source</strong>
      <span>${stats.total} item${stats.total === 1 ? "" : "s"} scanned · ${stats.readable} with readable Canvas content</span>
    </div>
    <div class="coach-section">
      <h3>Coding Self-Checks</h3>
      <ol>${analysis.practiceTasks.map((task) => `<li>${escapeHtml(task)}</li>`).join("")}</ol>
    </div>
    <div class="coach-section">
      <h3>Multiple Choice Questions</h3>
      <div class="map">
        ${
          questions.length
            ? questions
                .map((question, index) => {
                  const correctIndex = question.choices.findIndex((choice) => choice === question.answer);
                  return `
                    <div class="mcq-card">
                      <strong>${index + 1}. ${escapeHtml(question.question)}</strong>
                      <div class="mcq-choices">
                        ${question.choices
                          .map(
                            (choice, choiceIndex) => `
                              <span class="${choice === question.answer ? "is-correct" : ""}">
                                ${String.fromCharCode(65 + choiceIndex)}. ${escapeHtml(choice)}
                              </span>
                            `,
                          )
                          .join("")}
                      </div>
                      <p class="mcq-answer">Correct: ${String.fromCharCode(65 + Math.max(correctIndex, 0))}. ${escapeHtml(question.answer)}</p>
                      <p>${escapeHtml(question.explanation)}</p>
                    </div>
                  `;
                })
                .join("")
            : `<div class="explain-box"><p>No real quiz questions were generated because Canvas did not expose readable text from this module yet. If the module uses PDFs, make sure Canvas allows the app to download them; scanned image PDFs may still need OCR.</p></div>`
        }
      </div>
    </div>
    <div class="coach-section">
      <h3>What The App Could Read</h3>
      <div class="map">${renderModuleSourceReport(module)}</div>
    </div>
    <div class="explain-box">
      <p>${escapeHtml(analysis.studyPlan)}</p>
    </div>
    ${renderDownloadedFileImport("quiz")}
  `;
}

function renderModuleFlashcards(course, module) {
  const analysis = analyzeModule(module);
  const stats = moduleSourceStats(module);
  return `
    <p><strong>${escapeHtml(module.name)}</strong> · ${escapeHtml(course.name)}</p>
    <div class="course-scan">
      <strong>Flashcard source</strong>
      <span>${stats.total} item${stats.total === 1 ? "" : "s"} scanned · ${stats.readable} with readable Canvas content</span>
    </div>
    <div class="coach-section">
      <h3>Flashcards From This Module</h3>
      <div class="map">
        ${
          analysis.flashcards.length
            ? analysis.flashcards
                .map(
                  (card, index) => `
                    <div class="flashcard">
                      <strong>${index + 1}. ${escapeHtml(card.question)}</strong>
                      <span>${escapeHtml(card.answer)}</span>
                    </div>
                  `,
                )
                .join("")
            : "<p>No flashcards generated from readable module content.</p>"
        }
      </div>
    </div>
    <div class="coach-section">
      <h3>Use The Deck</h3>
      <ol>
        <li>Read the question side first and answer out loud.</li>
        <li>Check the answer and mark any card you missed.</li>
        <li>Retake only the missed cards until you can explain them without looking.</li>
      </ol>
    </div>
    <div class="coach-section">
      <h3>What The App Could Read</h3>
      <div class="map">${renderModuleSourceReport(module)}</div>
    </div>
    <div class="connect-actions">
      <button class="primary-btn" type="button" id="flashcards-to-quiz">Make MCQ Quiz</button>
      <button type="button" id="flashcards-to-notes">Study Module</button>
    </div>
    ${renderDownloadedFileImport("flashcards")}
  `;
}

function renderDownloadedFileImport(mode) {
  return `
    <div class="coach-section">
      <h3>Add Downloaded Canvas File</h3>
      <div class="file-import-row">
        <label for="downloaded-module-file-${mode}">Choose Canvas file from Downloads</label>
        <input type="file" id="downloaded-module-file-${mode}" data-module-file-import="${mode}" accept=".pdf,.zip,.ipynb,.pynb,.txt,.md,.csv,.json,.py,.js,.ts,.java,.c,.cpp,.docx,.pptx,image/*,application/pdf,application/zip">
        <span data-file-import-status>Waiting for a downloaded Canvas file.</span>
      </div>
      <p>Use this when Canvas lets you download the file in your browser but the API does not expose the file id to the tutor.</p>
    </div>
    <div class="coach-section">
      <h3>AI Tutor From Study Content</h3>
      <div class="ai-action-grid">
        <button type="button" data-ai-tutor-mode="study">AI Study Guide</button>
        <button type="button" data-ai-tutor-mode="flashcards">AI Flashcards</button>
        <button type="button" data-ai-tutor-mode="mcq">AI MCQ Quiz</button>
      </div>
      <p>Canvas gives the schedule and module list. Downloaded files give the real study text. AI turns that text into stronger explanations and practice.</p>
    </div>
  `;
}

function renderModuleSourceReport(module) {
  if (!module.items.length) return "<p>No module items were returned by Canvas.</p>";

  return module.items
    .slice(0, 12)
    .map((item) => {
      const readable = hasReadableStudyText(item);
      const status = readable ? "Readable" : "Not readable yet";
      const detail = readable
        ? shorten(item.summary, 120)
        : item.summary
          ? shorten(item.summary, 150)
          : "Canvas returned the item title, but no readable body text or downloadable file text.";
      const debug = item.readDebug ? `<p>Download path tried: ${escapeHtml(item.readDebug)}</p>` : "";
      return `
        <div class="module-row">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(`${status} · ${moduleItemLabel(item)}`)}</span>
          <p>${escapeHtml(detail)}</p>
          ${debug}
        </div>
      `;
    })
    .join("");
}

function bindModuleNoteActions(course, module) {
  const noteButton = responseBody.querySelector("#module-note-again");
  const quizButton = responseBody.querySelector("#module-quiz-from-notes");
  const flashcardQuizButton = responseBody.querySelector("#flashcards-to-quiz");
  const flashcardNotesButton = responseBody.querySelector("#flashcards-to-notes");

  if (noteButton) noteButton.addEventListener("click", () => generateModuleNotes(course, [module], module.id));
  if (quizButton) quizButton.addEventListener("click", () => generateModuleQuiz(course, [module], module.id));
  if (flashcardQuizButton) flashcardQuizButton.addEventListener("click", () => generateModuleQuiz(course, [module], module.id));
  if (flashcardNotesButton) flashcardNotesButton.addEventListener("click", () => generateModuleNotes(course, [module], module.id));
  responseBody.querySelectorAll("[data-module-file-import]").forEach((input) => {
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      const status = input.closest(".file-import-row")?.querySelector("[data-file-import-status]");
      if (status) status.textContent = file ? `Selected ${file.name}. Reading now...` : "No file selected.";
      if (file) importDownloadedModuleFile(course, module, file, input.dataset.moduleFileImport || "notes");
    });
  });
  responseBody.querySelectorAll("[data-ai-tutor-mode]").forEach((button) => {
    button.addEventListener("click", () => runAiTutor(course, module, button.dataset.aiTutorMode || "study"));
  });
}

function summarizeModule(module) {
  return analyzeModule(module).overview;
}

function moduleSourceStats(module) {
  return {
    total: module.items.length,
    readable: module.items.filter((item) => hasReadableStudyText(item)).length,
  };
}

function moduleItemLabel(item) {
  if (item.type === "File" && item.sourceKind === "zip" && item.readable) return "File · zip contents read: notebooks, code, text, PDFs";
  if (item.type === "File" && item.sourceKind === "notebook" && item.readable) return "File · notebook cells read";
  if (item.type === "File" && item.sourceKind === "pdf" && item.readable) return "File · PDF text read";
  if (item.type === "File" && item.sourceKind === "docx" && item.readable) return "File · Word document text read";
  if (item.type === "File" && item.sourceKind === "slides" && item.readable) return "File · PowerPoint slide text read";
  if (item.type === "File" && item.sourceKind === "ocr" && item.readable) return "File · OCR text read";
  if (item.type === "File" && item.sourceKind === "code" && item.readable) return "File · source code read";
  if (item.type === "File" && item.sourceKind === "text" && item.readable) return "File · text file read";
  if (item.type === "File" && item.readable) return "File · full text read";
  if (item.type === "File" && item.summary) return "File · needs OCR or unsupported parser";
  return item.type;
}

function hasReadableStudyText(item) {
  if (!item.summary || item.summary.trim().length < 35) return false;
  if (item.type === "File" && item.readable === false) return false;
  if (item.readable === true) return extractUsableStudyText(item.summary).length >= 35;
  return extractUsableStudyText(item.summary).length >= 35;
}

function analyzeModule(module) {
  const readableItems = module.items.filter((item) => hasReadableStudyText(item));
  const combinedText = readableItems
    .map((item) => `${item.title}. ${cleanStudyText(item.summary || "")}`)
    .join(" ");
  const sentences = splitSentences(combinedText);
  const facts = extractStudyFacts(module, readableItems);
  const keyPoints = sentences
    .filter((sentence) => sentence.length > 45)
    .sort((left, right) => scoreSentence(right) - scoreSentence(left))
    .slice(0, 8);
  const concepts = buildConcepts(module, readableItems, keyPoints);
  const keyTerms = extractKeyTerms(module, combinedText).slice(0, 10);
  const flashcards = [
    ...facts.slice(0, 8).map((fact) => ({
      question: fact.question,
      answer: fact.answer,
    })),
    ...keyTerms.slice(0, 6).map((term) => ({
      question: `What does ${term.term} mean in this module?`,
      answer: term.definition,
    })),
    ...concepts.slice(0, 4).map((concept) => ({
      question: `Explain ${concept.title} without looking.`,
      answer: concept.explanation,
    })),
    ...keyPoints.slice(0, 2).map((point) => ({
      question: `Why does this matter: ${shorten(point, 58)}`,
      answer: point,
    })),
  ].slice(0, 14);

  const stats = moduleSourceStats(module);
  const overview = keyPoints.length
    ? `I studied ${stats.total} Canvas module item${stats.total === 1 ? "" : "s"} for ${module.name}. The strongest ideas are: ${keyPoints.slice(0, 3).join(" ")}`
    : summarizeModuleFallback(module);
  const learningGoals = buildLearningGoals(module, concepts, keyPoints);
  const practiceTasks = buildCodingPractice(module, readableItems, concepts);
  const commonMistakes = buildCommonMistakes(module, concepts);
  const studySteps = buildModuleStudySteps(module, concepts);
  const studyPlan = `Study this module actively: read the learning goals, explain each core concept, complete the coding self-checks, then answer the quiz without looking.`;

  return {
    overview,
    keyPoints: keyPoints.length ? keyPoints : fallbackKeyPoints(module),
    facts,
    concepts,
    learningGoals,
    keyTerms,
    flashcards,
    practiceTasks,
    commonMistakes,
    studySteps,
    studyPlan,
  };
}

function buildModuleQuiz(module, analysis = analyzeModule(module)) {
  const questions = [];

  analysis.facts.slice(0, 8).forEach((fact) => {
    questions.push({
      question: fact.quizQuestion,
      answer: fact.answer,
    });
  });

  analysis.concepts.slice(0, 5).forEach((concept) => {
    questions.push({
      question: `Explain ${concept.title} using details from the module.`,
      answer: concept.explanation,
    });
    questions.push({
      question: `What would go wrong if you misunderstood ${concept.title}?`,
      answer: `You may miss the purpose of ${concept.title} or apply it incorrectly in an assignment, code example, quiz, or discussion.`,
    });
  });

  analysis.keyTerms.slice(0, 5).forEach((term) => {
    questions.push({
      question: `Define ${term.term} and give one example from the module.`,
      answer: term.definition,
    });
  });

  module.items
    .filter((item) => item.type === "Assignment" || item.type === "Discussion" || item.type === "Quiz")
    .slice(0, 3)
    .forEach((item) => {
      if (item.type === "Assignment") {
        questions.push({
          question: `What does ${item.title} ask you to do, and which module detail helps you complete it?`,
          answer: item.summary ? shorten(item.summary, 180) : `Review ${item.title} and connect it to the strongest module facts.`,
        });
      }
      if (item.type === "Discussion") {
        questions.push({
          question: `What claim would you make for ${item.title}, and which module evidence supports it?`,
          answer: item.summary ? shorten(item.summary, 180) : `Use a specific module fact as evidence for your discussion post.`,
        });
      }
      if (item.type === "Quiz") {
        questions.push({
          question: `What would you review before taking ${item.title}?`,
          answer: item.summary ? shorten(item.summary, 180) : "Review the flashcards, key terms, and any module files connected to the quiz.",
        });
      }
    });

  questions.push({
    question: `How does ${module.name} connect to an upcoming assignment or course goal?`,
    answer: "Use the assignment list and module items to connect the module concepts to what you need to submit or practice.",
  });
  questions.push({
    question: "Write one mini-program, query, or example that demonstrates the hardest concept in this module.",
    answer: "Your example should have a clear input, process, and output, or a clear claim, evidence, and result.",
  });
  questions.push({
    question: "What is one part of this module you still cannot explain clearly, and where would you look to fix it?",
    answer: "Return to the exact Canvas page, file, notebook, or discussion item that introduced the unclear idea.",
  });
  return dedupeQuestions(questions).slice(0, 16);
}

function buildModuleMcqQuiz(module, analysis = analyzeModule(module)) {
  if (!analysis.facts.length && !analysis.keyTerms.length && !analysis.concepts.length) return [];

  const distractorPool = [
    ...analysis.concepts.map((concept) => concept.explanation),
    ...analysis.keyTerms.map((term) => term.definition),
    ...analysis.facts.map((fact) => fact.answer),
    ...analysis.keyPoints,
    `Open ${module.name} and check the exact Canvas item before answering.`,
    "Only memorize the title without connecting it to an example.",
    "Skip the posted file and start the assignment from memory.",
  ]
    .map((choice) => cleanChoice(choice))
    .filter(isGoodMcqChoice);

  const questions = [];

  analysis.facts.filter((fact) => isGoodMcqChoice(fact.answer)).slice(0, 10).forEach((fact, index) => {
    questions.push(makeMcqQuestion({
      question: fact.quizQuestion,
      answer: fact.answer,
      explanation: `This comes from ${fact.source}. Review that Canvas item again if this answer is not clear.`,
      pool: distractorPool,
      seed: index,
    }));
  });

  analysis.keyTerms.slice(0, 6).forEach((term, index) => {
    questions.push(makeMcqQuestion({
      question: `Which answer best defines ${term.term} in this module?`,
      answer: term.definition,
      explanation: `${term.term} appears as a key term from the selected module content.`,
      pool: distractorPool,
      seed: index + 20,
    }));
  });

  analysis.concepts.slice(0, 5).forEach((concept, index) => {
    questions.push(makeMcqQuestion({
      question: `Which statement best explains ${concept.title}?`,
      answer: concept.explanation,
      explanation: `This concept was pulled from ${concept.source}.`,
      pool: distractorPool,
      seed: index + 40,
    }));
  });

  return dedupeMcqQuestions(questions).slice(0, 14);
}

function makeMcqQuestion({ question, answer, explanation, pool, seed = 0 }) {
  const correct = cleanChoice(answer) || "Review the exact module content and explain it in your own words.";
  const choices = [correct];
  const normalizedCorrect = normalizeChoice(correct);

  pool.forEach((candidate) => {
    const cleaned = cleanChoice(candidate);
    if (choices.length >= 4) return;
    if (!isGoodMcqChoice(cleaned) || normalizeChoice(cleaned) === normalizedCorrect) return;
    if (choices.some((choice) => normalizeChoice(choice) === normalizeChoice(cleaned))) return;
    choices.push(cleaned);
  });

  const fallbacks = [
    "This is mainly a due-date reminder, not a content idea from the module.",
    "This answer is unrelated to the selected Canvas module.",
    "This choice skips the example and only repeats the module title.",
  ];

  fallbacks.forEach((fallback) => {
    if (choices.length < 4 && !choices.includes(fallback)) choices.push(fallback);
  });

  return {
    question,
    choices: rotateChoices(choices.slice(0, 4), seed),
    answer: correct,
    explanation,
  };
}

function cleanChoice(choice) {
  return shorten(cleanStudyText(choice), 155);
}

function isGoodMcqChoice(choice) {
  const text = String(choice || "").trim();
  if (text.length < 24) return false;
  if (isLowValueStudySentence(text)) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (/[\\^`{}[\]~|]{2,}/.test(text)) return false;
  const letters = (text.match(/[a-zA-Z]/g) || []).length;
  const symbols = (text.match(/[^a-zA-Z0-9\s.,;:()'"/-]/g) || []).length;
  return letters >= 18 && symbols / Math.max(text.length, 1) < 0.08;
}

function normalizeChoice(choice) {
  return String(choice || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function rotateChoices(choices, seed) {
  if (!choices.length) return choices;
  const offset = Math.abs(seed) % choices.length;
  return [...choices.slice(offset), ...choices.slice(0, offset)];
}

function dedupeMcqQuestions(questions) {
  const seen = new Set();
  return questions.filter((question) => {
    const key = question.question.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractStudyFacts(module, items) {
  const facts = [];

  items.filter((item) => hasReadableStudyText(item)).forEach((item) => {
    const sentences = splitSentences(cleanStudyText(item.summary || ""))
      .filter(isStrongStudySentence)
      .slice(0, 8);

    sentences.forEach((sentence) => {
      const term = bestTermFromSentence(sentence) || cleanConceptTitle(item.title);
      facts.push({
        source: item.title,
        question: `What should you remember from ${item.title}?`,
        quizQuestion: buildFactQuestion(sentence, term, item),
        answer: sentence,
      });
    });
  });

  if (facts.length) return facts.slice(0, 18);
  return [];
}

function buildFactQuestion(sentence, term, item) {
  const lower = sentence.toLowerCase();
  if (/\b(because|therefore|so that|as a result)\b/.test(lower)) {
    return `Why does this idea matter in ${item.title}: ${shorten(sentence, 90)}?`;
  }
  if (/\b(function|class|method|variable|loop|array|object|query|database|algorithm|model|notebook)\b/.test(lower)) {
    return `How would you use or explain ${term} in code based on ${item.title}?`;
  }
  if (/\b(compare|difference|versus|unlike|similar)\b/.test(lower)) {
    return `What comparison is being made in ${item.title}?`;
  }
  if (/\b(define|means|refers to|is a|are a)\b/.test(lower)) {
    return `What does ${term} mean according to ${item.title}?`;
  }
  return `Which statement best explains ${term} from ${item.title}?`;
}

function isStrongStudySentence(sentence) {
  const text = String(sentence || "").trim();
  if (text.length < 45 || text.length > 260) return false;
  if (isLowValueStudySentence(text)) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (/[\\^`{}[\]~|]{2,}/.test(text)) return false;
  if (!/[.!?]$/.test(text) && text.split(/\s+/).length > 24) return false;
  const letters = (text.match(/[a-zA-Z]/g) || []).length;
  const symbols = (text.match(/[^a-zA-Z0-9\s.,;:()'"/-]/g) || []).length;
  return letters >= 30 && symbols / Math.max(text.length, 1) < 0.08;
}

function isLowValueStudySentence(sentence) {
  const text = String(sentence || "").trim().toLowerCase();
  if (!text) return true;
  return (
    /^(click|submit|available|points|due|http|https|file|application\/pdf|application\/octet-stream)/i.test(text) ||
    /https?:\/\/|www\.|\.org\/|\.com\//i.test(text) ||
    /\bdr\.?\s+[a-z]+\s+[a-z]+\b/i.test(text) ||
    /canvas did not expose readable text|add a pdf\/docx parser|not plain text|download returned|could not read the canvas file/i.test(text) ||
    /^[\w\s.-]+\.(pdf|docx|pptx|zip|ipynb)$/i.test(text) ||
    (text.match(/[\\^`{}[\]~|]/g) || []).length > 4
  );
}

function bestTermFromSentence(sentence) {
  const phrase = importantPhraseFromSentence(sentence);
  if (phrase) return phrase;

  const words = sentence
    .replace(/[^a-zA-Z0-9_\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4)
    .filter((word) => !["about", "because", "should", "would", "could", "their", "there", "where", "which", "these", "those", "module"].includes(word.toLowerCase()));

  return words[0] || "";
}

function importantPhraseFromSentence(sentence) {
  const text = String(sentence || "");
  const phrases = [
    "Artificial Intelligence",
    "Machine Learning",
    "Deep Learning",
    "Data Science",
    "Big Data",
    "Exploratory Data Analysis",
    "Supervised Learning",
    "Unsupervised Learning",
    "Linear Regression",
    "Gradient Descent",
    "Probability Theory",
    "Statistics",
    "Volume",
    "Velocity",
    "Variety",
    "Complexity",
  ];
  return phrases.find((phrase) => new RegExp(`\\b${phrase.replace(/\s+/g, "\\s+")}\\b`, "i").test(text)) || "";
}

function dedupeQuestions(questions) {
  const seen = new Set();
  return questions.filter((question) => {
    const key = question.question.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildConcepts(module, items, keyPoints) {
  const conceptItems = items
    .filter((item) => item.summary && item.summary.length > 30)
    .slice(0, 8)
    .map((item) => ({
      title: cleanConceptTitle(item.title),
      source: moduleItemLabel(item),
      explanation: firstUsefulSentence(item.summary) || shorten(item.summary, 180),
    }));

  if (conceptItems.length) return conceptItems;

  return keyPoints.slice(0, 5).map((point, index) => ({
    title: `Concept ${index + 1}`,
    source: module.name,
    explanation: point,
  }));
}

function buildLearningGoals(module, concepts, keyPoints) {
  const goals = concepts.slice(0, 4).map((concept) => `Understand ${concept.title} well enough to explain it and use it in a small example.`);
  goals.push(`Connect ${module.name} to at least one assignment, quiz, or coding task.`);
  goals.push("Identify what you still cannot explain without notes.");
  return goals.slice(0, 6);
}

function buildCodingPractice(module, items, concepts) {
  const hasCode = items.some((item) => item.sourceKind === "code" || item.sourceKind === "notebook" || item.sourceKind === "zip" || /code|function|class|python|java|javascript|sql|notebook/i.test(`${item.title} ${item.summary}`));
  const firstConcept = concepts[0]?.title || module.name;

  if (hasCode) {
    return [
      `Recreate the smallest working example related to ${firstConcept} without copying.`,
      "Add comments explaining each important line in your own words.",
      "Change one input or parameter and predict the output before running it.",
      "Write one possible bug and explain how you would debug it.",
      "Summarize the code flow: input, processing, output.",
    ];
  }

  return [
    `Create a simple example that demonstrates ${firstConcept}.`,
    "Turn one key point into a practice problem.",
    "Explain the module to someone else in three minutes.",
    "Make one flashcard for each key term.",
  ];
}

function buildCommonMistakes(module, concepts) {
  return [
    "Rereading the module without testing yourself.",
    `Knowing the words from ${module.name} but not being able to use them in an example.`,
    concepts[0] ? `Skipping the details around ${concepts[0].title}.` : "Skipping the hardest item in the module.",
    "Starting the assignment before checking the related module item or posted note.",
    "Not writing down what you still do not understand.",
  ];
}

function buildModuleStudySteps(module, concepts) {
  return [
    `Read the module overview and identify the purpose of ${module.name}.`,
    `Study the first concept: ${concepts[0]?.title || "the main module idea"}.`,
    "Use the flashcards without looking at the answers.",
    "Do the coding self-checks or make a small example.",
    "Take the practice quiz and revisit anything you miss.",
  ];
}

function cleanConceptTitle(title) {
  return title
    .replace(/\.(ipynb|py|js|ts|java|cpp|c|csv|txt|md|html)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim() || "Core concept";
}

function firstUsefulSentence(text) {
  return splitSentences(cleanStudyText(text)).find(isStrongStudySentence) || "";
}

function summarizeModuleFallback(module) {
  const titles = module.items.slice(0, 5).map((item) => item.title).join(", ");
  return titles
    ? `I scanned the Canvas module item list for ${module.name}, but Canvas did not expose much readable body text for this module. Start with these items: ${titles}.`
    : `This module focuses on ${module.name}. Canvas did not expose detailed content, so start by opening the module in Canvas.`;
}

function fallbackKeyPoints(module) {
  return module.items.slice(0, 5).map((item) => `Review ${item.title} and identify the main idea.`);
}

function splitSentences(text) {
  return cleanStudyText(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 60);
}

function cleanStudyText(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreSentence(sentence) {
  const lower = sentence.toLowerCase();
  let score = Math.min(sentence.length / 40, 5);
  ["important", "because", "must", "should", "key", "explain", "compare", "analyze", "create"].forEach((word) => {
    if (lower.includes(word)) score += 2;
  });
  return score;
}

function extractKeyTerms(module, text) {
  const knownTerms = [
    "Artificial Intelligence",
    "Machine Learning",
    "Deep Learning",
    "Data Science",
    "Big Data",
    "Exploratory Data Analysis",
    "Supervised Learning",
    "Unsupervised Learning",
    "Linear Regression",
    "Gradient Descent",
    "Probability Theory",
    "Statistics",
    "Volume",
    "Velocity",
    "Variety",
    "Complexity",
  ].filter((term) => new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i").test(text));
  const candidates = [...new Set(
    cleanStudyText(text)
      .replace(/[^a-zA-Z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 5)
      .filter((word) => !["module", "assignment", "students", "should", "because", "through", "course", "canvas", "please"].includes(word.toLowerCase())),
  )];
  const sentences = splitSentences(text);

  return [...new Set([...knownTerms, ...candidates])].slice(0, 12).map((term) => {
    const definitionSource = sentences.find((sentence) => sentence.toLowerCase().includes(term.toLowerCase()));
    const knownDefinition = knownTermDefinition(term);
    return {
      term,
      definition:
        knownDefinition ||
        (definitionSource && isStrongStudySentence(definitionSource)
          ? shorten(definitionSource, 150)
          : `A key idea from ${module.name}. Find it in the module material and connect it to an example.`),
    };
  });
}

function knownTermDefinition(term) {
  const key = String(term || "").toLowerCase();
  const definitions = {
    "artificial intelligence": "Artificial intelligence is the broader field of building systems that perform tasks requiring human-like reasoning, perception, or decision-making.",
    "machine learning": "Machine learning is a branch of AI where models learn patterns from data instead of being programmed with every rule by hand.",
    "deep learning": "Deep learning uses multi-layer neural networks to learn complex patterns from large amounts of data.",
    "data science": "Data science combines statistics, computing, and domain knowledge to collect, analyze, and explain data for decisions.",
    "big data": "Big data refers to data that is large, fast, varied, or complex enough that traditional tools are difficult to use effectively.",
    "exploratory data analysis": "Exploratory data analysis is the process of summarizing and visualizing data to find patterns, outliers, and relationships before modeling.",
    "supervised learning": "Supervised learning trains a model using labeled examples where the correct output is already known.",
    "unsupervised learning": "Unsupervised learning finds patterns or groups in data without labeled answers.",
    "linear regression": "Linear regression models the relationship between input variables and a numeric output using a best-fit line or equation.",
    "gradient descent": "Gradient descent is an optimization method that repeatedly adjusts model parameters to reduce error.",
    "probability theory": "Probability theory studies uncertainty and the likelihood of events.",
    statistics: "Statistics uses data collection, summaries, inference, and probability to understand variation and support decisions.",
    volume: "Volume describes the size or amount of data.",
    velocity: "Velocity describes how quickly data is generated, received, or processed.",
    variety: "Variety describes the different formats, sources, and structures of data.",
    complexity: "Complexity describes how difficult data is to manage, combine, clean, or extract value from.",
  };
  return definitions[key] || "";
}

async function planAssignment(course, assignments, modules, postedNotes, assignmentId) {
  const summaryAssignment = assignments.find((assignment) => String(assignment.id) === String(assignmentId));
  if (!summaryAssignment) return;

  showResponse(
    "Building Assignment Plan",
    `<p>Reading assignment details and matching module material for <strong>${escapeHtml(summaryAssignment.name)}</strong>.</p>`,
  );

  try {
    const assignment = await fetchAssignmentDetail(course.id, assignmentId);
    const relatedItems = findRelatedModuleItems(assignment, modules);
    const relatedNotes = findRelatedPostedNotes(assignment, postedNotes);
    showResponse(
      "Assignment Coach",
      renderAssignmentCoach(course, assignment, relatedItems, relatedNotes),
    );
    bindAssignmentCoachActions(course, assignment, relatedItems, relatedNotes);
  } catch (error) {
    const relatedItems = findRelatedModuleItems(summaryAssignment, modules);
    const relatedNotes = findRelatedPostedNotes(summaryAssignment, postedNotes);
    showResponse(
      "Assignment Plan Failed",
      `<p>${escapeHtml(error.message)}</p>
       <p>I can still make a simpler plan from the assignment title and due date.</p>
       ${renderAssignmentCoach(course, summaryAssignment, relatedItems, relatedNotes)}`,
    );
    bindAssignmentCoachActions(course, summaryAssignment, relatedItems, relatedNotes);
  }
}

function findRelatedModuleItems(assignment, modules) {
  const keywords = keywordSet(`${assignment.name} ${assignment.description}`);
  const scored = modules.flatMap((module) =>
    module.items.map((item) => {
      const itemKeywords = keywordSet(`${module.name} ${item.title} ${item.type} ${item.summary || ""}`);
      const overlap = [...keywords].filter((keyword) => itemKeywords.has(keyword)).length;
      const directMatch = String(item.contentId) === String(assignment.id) ? 10 : 0;
      return { ...item, moduleName: module.name, score: overlap + directMatch };
    }),
  );

  const related = scored
    .filter((item) => item.score > 0 || item.type === "Assignment")
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  if (related.length) return related;
  return modules
    .flatMap((module) => module.items.slice(0, 2).map((item) => ({ ...item, moduleName: module.name, score: 0 })))
    .slice(0, 5);
}

function findRelatedPostedNotes(assignment, postedNotes) {
  const keywords = keywordSet(`${assignment.name} ${assignment.description}`);
  return postedNotes
    .map((note) => {
      const noteKeywords = keywordSet(`${note.title} ${note.type} ${note.summary}`);
      const overlap = [...keywords].filter((keyword) => noteKeywords.has(keyword)).length;
      return { ...note, score: overlap };
    })
    .filter((note) => note.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

function renderAssignmentCoach(course, assignment, relatedItems, relatedNotes = []) {
  const steps = buildAssignmentSteps(assignment, relatedItems);
  const explanation = explainAssignment(assignment, relatedItems, relatedNotes);
  const workspace = buildAssignmentWorkspace(assignment, relatedItems, relatedNotes);
  const rubricRows = assignment.rubric?.length
    ? assignment.rubric
        .slice(0, 4)
        .map(
          (item) => `
            <div class="rubric-row">
              <strong>${escapeHtml(item.description || "Rubric item")}</strong>
              <span>${escapeHtml(item.points ? `${item.points} pts` : "Rubric")}</span>
              ${item.longDescription ? `<p>${escapeHtml(shorten(item.longDescription, 120))}</p>` : ""}
            </div>
          `,
        )
        .join("")
    : `<div class="rubric-row"><strong>No rubric found</strong><p>Use the assignment description as your checklist, then compare against any Canvas instructions before submitting.</p></div>`;

  return `
    <p><strong>${escapeHtml(assignment.name)}</strong> · ${escapeHtml(course.name)}</p>
    <div class="course-scan">
      <strong>${escapeHtml(assignment.dueAt ? `Due ${formatDate(assignment.dueAt)}` : "No due date")}</strong>
      <span>${escapeHtml(assignment.points ? `${assignment.points} possible points` : "Points not listed")}</span>
    </div>
    <div class="coach-section">
      <h3>What This Assignment Means</h3>
      <div class="explain-box">
        <p>${escapeHtml(explanation)}</p>
      </div>
    </div>
    <div class="coach-section">
      <h3>Assignment Workspace</h3>
      <div class="assignment-workspace">
        <div class="workspace-card">
          <strong>Understand First</strong>
          <p>${escapeHtml(workspace.understand)}</p>
        </div>
        <div class="workspace-card">
          <strong>Do The Work In Parts</strong>
          <ol>${workspace.parts.map((part) => `<li>${escapeHtml(part)}</li>`).join("")}</ol>
        </div>
        <div class="workspace-card">
          <strong>${escapeHtml(workspace.quizTitle)}</strong>
          <ol>${workspace.quizPrep.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
        </div>
      </div>
    </div>
    <div class="coach-section">
      <h3>Practice Questions</h3>
      <div class="map">
        ${workspace.practiceQuestions
          .map(
            (question) => `
              <div class="study-card">
                <strong>${escapeHtml(question.question)}</strong>
                <span>${escapeHtml(question.source)}</span>
                <p>${escapeHtml(question.answer)}</p>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
    <div class="coach-section">
      <h3>Study First</h3>
      ${
        relatedItems.length
          ? relatedItems
              .map(
                (item) => `
                  <div class="assignment-row">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(`${item.moduleName} · ${moduleItemLabel(item)}`)}</span>
                    ${item.summary ? `<p>${escapeHtml(shorten(item.summary, 140))}</p>` : ""}
                  </div>
                `,
              )
              .join("")
          : "<p>No module items found. Start by reading the newest module in Canvas.</p>"
      }
    </div>
    <div class="coach-section">
      <h3>Posted Notes To Review</h3>
      ${
        relatedNotes.length
          ? relatedNotes
              .map(
                (note) => `
                  <div class="posted-note-row">
                    <strong>${escapeHtml(note.title)}</strong>
                    <span>${escapeHtml(`${note.type}${note.updatedAt ? ` · ${formatDate(note.updatedAt)}` : ""}`)}</span>
                    ${note.summary ? `<p>${escapeHtml(shorten(note.summary, 150))}</p>` : ""}
                  </div>
                `,
              )
              .join("")
          : "<p>No closely related posted notes found. Use module material and assignment instructions first.</p>"
      }
    </div>
    <div class="coach-section">
      <h3>Step-by-Step Plan</h3>
      <ol>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    </div>
    <div class="coach-section">
      <h3>Before You Submit</h3>
      <ol>${workspace.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
    </div>
    <div class="coach-section">
      <h3>Rubric / Full Credit Clues</h3>
      <div class="map">${rubricRows}</div>
    </div>
    <div class="connect-actions">
      <button class="primary-btn" id="add-plan-note" type="button">Add Plan Note</button>
      <button id="start-assignment-sprint" type="button">Start Sprint</button>
    </div>
  `;
}

function buildAssignmentWorkspace(assignment, relatedItems, relatedNotes = []) {
  const type = assignmentType(assignment);
  const descriptionFacts = splitSentences(assignment.description || "")
    .filter((sentence) => sentence.length > 35)
    .slice(0, 4);
  const resourceItems = relatedItems.filter((item) => item.summary || item.title).slice(0, 4);
  const firstResource = resourceItems[0]?.title || "the most relevant Canvas module item";
  const secondResource = resourceItems[1]?.title || "your assignment instructions";
  const noteHint = relatedNotes[0]?.title ? ` Also check posted note: ${relatedNotes[0].title}.` : "";

  const understand = descriptionFacts.length
    ? `In plain language, this assignment is asking you to complete the task described in Canvas and prove you understand these details: ${descriptionFacts.map((fact) => shorten(fact, 90)).join(" ")}${noteHint}`
    : `In plain language, this assignment is asking you to read the Canvas instructions, connect them to ${firstResource}, complete the required work, and check your answer before submitting.${noteHint}`;

  const partsByType = {
    essay: [
      "Part 1: Write the main claim or answer in one clear sentence.",
      `Part 2: Pull evidence or examples from ${firstResource} and ${secondResource}.`,
      "Part 3: Draft the response, then revise for clarity, citation, and rubric details.",
    ],
    quiz: [
      `Part 1: Review ${firstResource} and write down the ideas you cannot explain yet.`,
      "Part 2: Make practice questions before opening the quiz.",
      "Part 3: Take the quiz when you can answer without looking at notes.",
    ],
    discussion: [
      "Part 1: Write your answer or opinion in one direct sentence.",
      `Part 2: Add one example from ${firstResource}.`,
      "Part 3: End with a useful question or reply point for classmates.",
    ],
    lab: [
      "Part 1: Identify the goal, input, method, and expected output.",
      `Part 2: Follow the steps while checking examples from ${firstResource}.`,
      "Part 3: Explain what happened, what the result means, and what you would fix.",
    ],
    general: [
      "Part 1: Understand the instructions and rewrite the task in your own words.",
      `Part 2: Use ${firstResource} to complete the hardest requirement first.`,
      "Part 3: Check the final work against the assignment description and rubric.",
    ],
  };

  const quizPrep = resourceItems.length
    ? resourceItems.slice(0, 5).map((item) => `Explain this without notes: ${item.title}${item.summary ? ` - ${shorten(firstUsefulSentence(item.summary) || item.summary, 90)}` : ""}`)
    : [
        "Turn the assignment title into three questions.",
        "Define every important word in the instructions.",
        "Explain the assignment goal out loud before starting.",
      ];

  const practiceQuestions = buildAssignmentPracticeQuestions(assignment, resourceItems, descriptionFacts);
  const checklist = [
    "I can explain what the assignment is asking in my own words.",
    `I reviewed ${firstResource} before working.`,
    "I answered every required part, not only the easiest part.",
    assignment.rubric?.length ? "I compared my work against each rubric item." : "I used the assignment description as my checklist.",
    assignment.dueAt ? `I am ready to submit before ${formatDate(assignment.dueAt)}.` : "I set my own submit time so this does not drift.",
  ];

  return {
    understand,
    parts: partsByType[type] || partsByType.general,
    quizTitle: type === "quiz" ? "Quiz Prep" : "Check Your Understanding",
    quizPrep,
    practiceQuestions,
    checklist,
  };
}

function buildAssignmentPracticeQuestions(assignment, resourceItems, descriptionFacts) {
  const questions = [];

  descriptionFacts.slice(0, 3).forEach((fact) => {
    questions.push({
      question: `What is this instruction asking you to do: ${shorten(fact, 95)}?`,
      answer: "Restate it as one action you can complete, then find the matching requirement in your work.",
      source: "Assignment instructions",
    });
  });

  resourceItems.slice(0, 4).forEach((item) => {
    const answer = item.summary
      ? firstUsefulSentence(item.summary) || shorten(item.summary, 140)
      : `Open ${item.title} and connect its main idea to the assignment.`;
    questions.push({
      question: `How does ${item.title} help with this assignment?`,
      answer,
      source: item.moduleName ? `${item.moduleName} · ${moduleItemLabel(item)}` : moduleItemLabel(item),
    });
  });

  questions.push({
    question: `What would a complete answer for ${assignment.name} need to include?`,
    answer: "It should include the required task, the related course concept, any evidence/example/code requested, and a final check against the rubric or instructions.",
    source: "Completion check",
  });

  return questions.slice(0, 6);
}

function buildAssignmentSteps(assignment, relatedItems) {
  const steps = [
    "Open the Canvas assignment and read the instructions once without starting.",
  ];

  if (relatedItems.length) {
    steps.push(`Review related module material first: ${relatedItems.slice(0, 2).map((item) => item.title).join(", ")}.`);
  }

  const text = `${assignment.name} ${assignment.description}`.toLowerCase();
  if (text.includes("essay") || text.includes("paper") || text.includes("reflection")) {
    steps.push("Write a one-sentence main idea or thesis.");
    steps.push("Collect two pieces of evidence from the module material.");
    steps.push("Draft the response, then check every rubric item before submitting.");
  } else if (text.includes("quiz") || text.includes("test") || text.includes("exam")) {
    steps.push("Make five practice questions from the module material.");
    steps.push("Answer them without notes, then review the missed concepts.");
    steps.push("Take the quiz only after you can explain the key ideas out loud.");
  } else if (text.includes("discussion")) {
    steps.push("Write one claim, one example from the module, and one question.");
    steps.push("Draft your post, then reply to classmates with a specific connection.");
  } else if (text.includes("lab")) {
    steps.push("Identify the goal, variables, and expected result.");
    steps.push("Complete the work in order, then explain what the result means.");
  } else {
    steps.push("Break the assignment into three small parts: understand, draft, check.");
    steps.push("Finish the easiest part first to build momentum.");
    steps.push("Use the rubric or assignment description as a final submission checklist.");
  }

  steps.push(assignment.dueAt ? `Submit before ${formatDate(assignment.dueAt)}.` : "Set your own due time today so it does not drift.");
  return steps;
}

function explainAssignment(assignment, relatedItems, relatedNotes = []) {
  const type = assignmentType(assignment);
  const related = relatedItems
    .filter((item) => item.summary || item.title)
    .slice(0, 2)
    .map((item) => item.title)
    .join(" and ");
  const noteHint = relatedNotes.length
    ? ` Also review posted notes like ${relatedNotes.slice(0, 2).map((note) => note.title).join(" and ")} because they may include instructor hints or updates.`
    : "";
  const dueText = assignment.dueAt ? ` It is due ${formatDate(assignment.dueAt)}.` : "";
  const pointsText = assignment.points ? ` It is worth ${assignment.points} points.` : "";

  if (type === "essay") {
    return `This looks like a writing assignment. Your job is probably to make a clear argument or reflection, support it with course material, and polish it before submitting.${dueText}${pointsText}${related ? ` Start by reviewing ${related}.` : ""}${noteHint}`;
  }
  if (type === "quiz") {
    return `This looks like a quiz or test. Your goal is to understand the module ideas well enough to answer without notes, not just reread passively.${dueText}${pointsText}${related ? ` Study ${related} first.` : ""}${noteHint}`;
  }
  if (type === "discussion") {
    return `This looks like a discussion post. You need a clear response, a specific example from the course, and usually a thoughtful reply or question.${dueText}${pointsText}${related ? ` Pull your example from ${related}.` : ""}${noteHint}`;
  }
  if (type === "lab") {
    return `This looks like a lab or hands-on assignment. Focus on the goal, method, variables, and what the result means.${dueText}${pointsText}${related ? ` Review ${related} before starting.` : ""}${noteHint}`;
  }
  return `This assignment needs you to understand the instructions, connect them to the course module, complete the required work, and check details before submitting.${dueText}${pointsText}${related ? ` The most relevant module material appears to be ${related}.` : ""}${noteHint}`;
}

function assignmentType(assignment) {
  const text = `${assignment.name} ${assignment.description}`.toLowerCase();
  if (text.includes("essay") || text.includes("paper") || text.includes("reflection") || text.includes("write")) return "essay";
  if (text.includes("quiz") || text.includes("test") || text.includes("exam")) return "quiz";
  if (text.includes("discussion") || text.includes("post") || text.includes("reply")) return "discussion";
  if (text.includes("lab") || text.includes("experiment")) return "lab";
  return "general";
}

function bindAssignmentCoachActions(course, assignment, relatedItems, relatedNotes = []) {
  const addButton = responseBody.querySelector("#add-plan-note");
  const sprintButton = responseBody.querySelector("#start-assignment-sprint");

  if (addButton) addButton.addEventListener("click", () => {
    const note = {
      id: `assignment-plan-${course.id}-${assignment.id}`,
      title: `Plan: ${assignment.name}`,
      content: `${explainAssignment(assignment, relatedItems, relatedNotes)} ${buildAssignmentSteps(assignment, relatedItems).join(" ")}`,
      topic: course.name,
      color: "green",
      x: 115 + (notes.length % 3) * 235,
      y: 120 + Math.floor(notes.length / 3) * 175,
    };
    notes = [...notes.filter((item) => item.id !== note.id), note];
    selectedId = note.id;
    render();
  });

  if (sprintButton) sprintButton.addEventListener("click", () => {
    const note = {
      id: `assignment-sprint-${course.id}-${assignment.id}`,
      title: assignment.name,
      content: focusAdviceFromText(assignment.name, assignment.description),
      topic: course.name,
      color: "blue",
      x: 115 + (notes.length % 3) * 235,
      y: 120 + Math.floor(notes.length / 3) * 175,
    };
    notes = [...notes.filter((item) => item.id !== note.id), note];
    selectedId = note.id;
    render();
    startFocusSprint();
  });
}

function keywordSet(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .filter((word) => !["assignment", "module", "course", "with", "from", "that", "this", "your"].includes(word)),
  );
}

async function importCanvasWork() {
  if (!canvasConnection.baseUrl || !canvasConnection.token) {
    setCanvasStatus("Not connected", "error");
    return;
  }

  setCanvasStatus("Importing...", "");
  importCanvasButton.disabled = true;

  const start = new Date();
  const end = new Date();
  end.setDate(start.getDate() + 21);
  const params = new URLSearchParams({
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    per_page: "12",
  });

  try {
    const items = await canvasApiFetch(
      canvasConnection.baseUrl,
      canvasConnection.token,
      `/api/v1/planner/items?${params.toString()}`,
    );
    const imported = items
      .filter((item) => item.plannable)
      .slice(0, 8)
      .map(canvasPlannerItemToNote);

    if (!imported.length) {
      showResponse(
        "No Upcoming Canvas Work",
        "<p>Canvas connected, but there were no upcoming planner items in the next 21 days.</p>",
      );
      setCanvasStatus("Connected", "connected");
      return;
    }

    notes = [...notes, ...imported];
    selectedId = imported[0].id;
    autoLayout();
    showResponse(
      "Canvas Work Imported",
      `<p>Imported <strong>${imported.length}</strong> upcoming Canvas item${imported.length === 1 ? "" : "s"} as study notes.</p>
       <ul>${imported.map((note) => `<li>${escapeHtml(note.title)}</li>`).join("")}</ul>`,
    );
    setCanvasStatus("Connected", "connected");
  } catch (error) {
    setCanvasStatus("Import failed", "error");
    showResponse("Canvas Import Failed", canvasErrorMessage(error));
  } finally {
    importCanvasButton.disabled = false;
  }
}

async function saveDailyDigest() {
  const settings = getDigestSettings();
  if (!settings) return;

  setMailStatus("Saving...", "");
  saveDigestButton.disabled = true;

  try {
    const result = await postJson("/api/daily-digest/config", settings);
    localStorage.setItem("canvasTutor.digestEmail", settings.email);
    localStorage.setItem("canvasTutor.digestTime", settings.time);
    setMailStatus("Scheduled", "connected");
    showResponse(
      "Daily Focus Mail Scheduled",
      `<p>Your daily Canvas focus email is scheduled for <strong>${escapeHtml(result.time)}</strong>.</p>
       <p>${escapeHtml(result.deliveryNote)}</p>`,
    );
  } catch (error) {
    setMailStatus("Failed", "error");
    showResponse("Daily Mail Setup Failed", `<p>${escapeHtml(error.message)}</p>`);
  } finally {
    saveDigestButton.disabled = false;
  }
}

async function sendTestDigest() {
  const settings = getDigestSettings();
  if (!settings) return;

  setMailStatus("Testing...", "");
  sendTestDigestButton.disabled = true;

  try {
    const result = await postJson("/api/daily-digest/test", settings);
    setMailStatus(result.sent ? "Sent" : "Drafted", "connected");
    showResponse(
      result.sent ? "Test Focus Mail Sent" : "Test Focus Mail Drafted",
      `<p>${escapeHtml(result.message)}</p>
       ${result.outboxPath ? `<p>Draft saved at <strong>${escapeHtml(result.outboxPath)}</strong>.</p>` : ""}
       <div class="flashcard">
         <strong>${escapeHtml(result.subject)}</strong>
         <span>${escapeHtml(shorten(result.preview, 260))}</span>
       </div>`,
    );
  } catch (error) {
    setMailStatus("Failed", "error");
    showResponse("Test Mail Failed", `<p>${escapeHtml(error.message)}</p>`);
  } finally {
    sendTestDigestButton.disabled = false;
  }
}

async function checkDigestStatus() {
  try {
    const result = await fetch("/api/daily-digest/status").then((response) => response.json());
    const realEmail = result.deliveryMode?.startsWith("real-email");
    const deliveryLabel =
      result.deliveryMode === "real-email-resend"
        ? "Real email via Resend"
        : result.deliveryMode === "real-email-smtp"
          ? "Real email via SMTP"
          : "Draft outbox";
    setMailStatus(result.configured ? (realEmail ? "Ready" : "Draft mode") : "Off", result.configured ? "connected" : "");
    showResponse(
      "Daily Mail Status",
      `<p><strong>Delivery mode:</strong> ${escapeHtml(deliveryLabel)}</p>
       <p>${escapeHtml(result.deliveryNote)}</p>
       ${result.email ? `<p><strong>Scheduled:</strong> ${escapeHtml(result.email)} at ${escapeHtml(result.time)}</p>` : "<p>No daily email is scheduled yet.</p>"}
       ${
         result.lastDelivery
           ? `<div class="course-scan">
                <strong>Last delivery attempt</strong>
                <span>${escapeHtml(result.lastDelivery.at)} · ${escapeHtml(result.lastDelivery.provider)} · ${result.lastDelivery.sent ? "accepted by provider" : "draft saved"}</span>
              </div>`
           : ""
       }
       ${result.lastError ? `<p><strong>Last error:</strong> ${escapeHtml(result.lastError)}</p>` : ""}
       ${result.drafts?.length ? `<div class="coach-section"><h3>Recent Drafts</h3><ul>${result.drafts.map((draft) => `<li>${escapeHtml(draft)}</li>`).join("")}</ul></div>` : ""}
       <p>To send real email, configure Resend or SMTP in the project <strong>.env</strong> file and restart the server.</p>`,
    );
  } catch (error) {
    setMailStatus("Failed", "error");
    showResponse("Mail Status Failed", `<p>${escapeHtml(error.message)}</p>`);
  }
}

function getDigestSettings() {
  const email = digestEmailInput.value.trim();
  const time = digestTimeInput.value || "07:30";

  if (!email || !email.includes("@")) {
    setMailStatus("Email needed", "error");
    showResponse("Daily Focus Mail", "<p>Add the email address where you want the daily study focus sent.</p>");
    return null;
  }

  if (!canvasConnection.baseUrl || !canvasConnection.token) {
    setMailStatus("Connect Canvas", "error");
    showResponse(
      "Connect Canvas First",
      "<p>Connect your Canvas account first, then schedule the daily focus email. The digest reviews your Canvas assignments.</p>",
    );
    return null;
  }

  return {
    email,
    time,
    baseUrl: canvasConnection.baseUrl,
    token: canvasConnection.token,
    profileName: canvasConnection.profile?.name || canvasConnection.profile?.short_name || "Student",
  };
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

async function canvasApiFetch(baseUrl, token, path) {
  if (isLocalHttp()) {
    return canvasProxyFetch(baseUrl, token, path);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  let response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Canvas did not respond within 15 seconds. Check the Canvas URL, then try the local preview URL instead of file://.",
      );
    }
    throw new Error(
      "The browser could not reach Canvas. This is often caused by a school CORS policy, a blocked network request, or opening the app as file://.",
    );
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const details = await readErrorMessage(response);
    throw new Error(
      details ||
        `Canvas returned ${response.status}. Check your URL, token permissions, and school Canvas settings.`,
    );
  }

  return response.json();
}

async function canvasProxyFetch(baseUrl, token, path) {
  const response = await fetch("/api/canvas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ baseUrl, token, path }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "The local Canvas proxy could not complete the request.");
  }

  return payload;
}

async function canvasFileTextFetch(baseUrl, token, fileId, apiPath = "") {
  if (!isLocalHttp()) {
    return {
      title: "Canvas file",
      text: "",
      readable: false,
      reason: "Open the app through the local Node server so files can be read through the proxy.",
    };
  }

  const response = await fetch("/api/canvas-file-text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ baseUrl, token, fileId, apiPath }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      title: "Canvas file",
      text: "",
      readable: false,
      reason: payload.error || "Could not read this Canvas file.",
    };
  }

  return payload;
}

async function importDownloadedModuleFile(course, module, file, mode) {
  showResponse(
    "Reading Downloaded File",
    `<p>Reading <strong>${escapeHtml(file.name)}</strong> and adding it to <strong>${escapeHtml(module.name)}</strong>.</p>`,
  );

  try {
    const payload = await localFileTextFetch(file);
    const readableCharacters = payload.readable ? String(payload.text || "").length : 0;
    const importedItem = {
      id: `local-file-${Date.now()}`,
      title: payload.title || file.name,
      type: "File",
      moduleName: module.name,
      summary: payload.readable
        ? payload.text
        : `${payload.contentType || file.type || "File"} · ${payload.reason || "The downloaded file could not be converted to study text."}`,
      readable: payload.readable,
      sourceKind: payload.sourceKind || "file",
      readDebug: "downloaded from your Canvas browser session",
    };

    module.items = [importedItem, ...module.items.filter((item) => item.title !== importedItem.title)];
    module.hydrated = true;

    const importNotice = renderFileImportNotice(importedItem, readableCharacters, payload.reason || "");
    if (mode === "quiz") {
      showResponse("Module MCQ Quiz", importNotice + renderModuleQuiz(course, module));
    } else if (mode === "flashcards") {
      showResponse("Module Flashcards", importNotice + renderModuleFlashcards(course, module));
    } else {
      showResponse("Module Study Notes", importNotice + renderModuleNotes(course, module));
    }
    bindModuleNoteActions(course, module);
  } catch (error) {
    showResponse(
      "Downloaded File Failed",
      `<p>${escapeHtml(error.message || "The tutor could not read this downloaded file.")}</p>`,
    );
  }
}

function renderFileImportNotice(item, readableCharacters, reason) {
  const readable = item.readable && readableCharacters > 0;
  return `
    <div class="explain-box">
      <p><strong>${readable ? "File uploaded and read." : "File uploaded, but no readable study text was found."}</strong></p>
      <p>${escapeHtml(item.title)} · ${escapeHtml(moduleItemLabel(item))} · ${readableCharacters.toLocaleString()} readable characters</p>
      ${
        readable
          ? "<p>You can now use AI Study Guide, AI Flashcards, or AI MCQ Quiz from this uploaded content.</p>"
          : `<p>${escapeHtml(reason || "Try a text-based PDF, DOCX, PPTX, notebook, source code file, or ZIP with readable files inside.")}</p>`
      }
    </div>
  `;
}

async function localFileTextFetch(file) {
  const dataBase64 = await fileToBase64(file);
  const response = await fetch("/api/local-file-text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: file.name,
      contentType: file.type,
      dataBase64,
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "The local file reader could not complete the request.");
  }

  return payload;
}

async function runAiTutor(course, module, mode) {
  const payload = buildAiTutorPayload(course, module, mode);
  showResponse(
    "AI Tutor",
    `<p>Building ${escapeHtml(aiModeLabel(mode))} from readable downloaded files and Canvas module structure.</p>`,
  );

  try {
    const response = await fetch("/api/ai-tutor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.error) {
      showResponse(
        "AI Tutor Needs Setup",
        `<p>${escapeHtml(result.error || "AI tutor could not complete the request.")}</p>
         <p>Keep using downloaded-file flashcards and quiz while AI is not configured.</p>`,
      );
      return;
    }

    showResponse("AI Tutor", renderAiTutorResult(course, module, result, mode));
    bindModuleNoteActions(course, module);
  } catch (error) {
    showResponse("AI Tutor Failed", `<p>${escapeHtml(error.message || "AI tutor failed.")}</p>`);
  }
}

function buildAiTutorPayload(course, module, mode) {
  const readableItems = module.items.filter((item) => hasReadableStudyText(item));
  const studyText = readableItems
    .map((item) => `SOURCE: ${item.title}\nTYPE: ${moduleItemLabel(item)}\n${extractUsableStudyText(item.summary || "")}`)
    .join("\n\n---\n\n")
    .slice(0, 45000);
  const canvasContext = module.items
    .map((item) => `${item.title} (${moduleItemLabel(item)})`)
    .join("\n")
    .slice(0, 5000);

  return {
    mode,
    courseName: course.name,
    moduleName: module.name,
    canvasContext,
    studyText,
  };
}

function extractUsableStudyText(text) {
  const sentences = splitSentences(text).filter(isStrongStudySentence);
  if (sentences.length) return sentences.slice(0, 80).join(" ");

  const cleaned = cleanStudyText(text);
  if (cleaned.length < 35 || isLowValueStudySentence(cleaned)) return "";
  return cleaned.slice(0, 12000);
}

function renderAiTutorResult(course, module, result, mode) {
  return `
    <p><strong>${escapeHtml(module.name)}</strong> · ${escapeHtml(course.name)}</p>
    <div class="course-scan">
      <strong>Architecture</strong>
      <span>Canvas API = schedule/module list · Downloaded files = study content · AI = tutor questions</span>
    </div>
    <div class="explain-box">
      <p>${escapeHtml(result.summary || `AI generated ${aiModeLabel(mode)} from your readable module content.`)}</p>
    </div>
    <div class="coach-section">
      <h3>Key Points</h3>
      ${result.keyPoints?.length ? `<ul>${result.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>` : "<p>No key points returned.</p>"}
    </div>
    <div class="coach-section">
      <h3>AI Flashcards</h3>
      <div class="map">
        ${
          result.flashcards?.length
            ? result.flashcards
                .map((card, index) => `
                  <div class="flashcard">
                    <strong>${index + 1}. ${escapeHtml(card.front)}</strong>
                    <span>${escapeHtml(card.back)}</span>
                  </div>
                `)
                .join("")
            : "<p>No AI flashcards returned.</p>"
        }
      </div>
    </div>
    <div class="coach-section">
      <h3>AI MCQ Quiz</h3>
      <div class="map">
        ${
          result.mcq?.length
            ? result.mcq.map(renderAiMcqCard).join("")
            : "<p>No AI MCQ questions returned.</p>"
        }
      </div>
    </div>
    <div class="coach-section">
      <h3>Study Plan</h3>
      ${result.studyPlan?.length ? `<ol>${result.studyPlan.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>` : "<p>Review the flashcards, then answer the MCQs without looking.</p>"}
    </div>
    ${renderDownloadedFileImport(mode)}
  `;
}

function renderAiMcqCard(question, index) {
  return `
    <div class="mcq-card">
      <strong>${index + 1}. ${escapeHtml(question.question)}</strong>
      <div class="mcq-choices">
        ${question.choices
          .map((choice, choiceIndex) => `
            <span class="${choice === question.answer ? "is-correct" : ""}">
              ${String.fromCharCode(65 + choiceIndex)}. ${escapeHtml(choice)}
            </span>
          `)
          .join("")}
      </div>
      <p class="mcq-answer">Correct: ${escapeHtml(question.answer)}</p>
      <p>${escapeHtml(question.explanation || "Review the source file section for this concept.")}</p>
    </div>
  `;
}

function aiModeLabel(mode) {
  if (mode === "mcq") return "AI MCQ quiz";
  if (mode === "flashcards") return "AI flashcards";
  return "AI study guide";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

function canvasErrorMessage(error) {
  const fileWarning =
    window.location.protocol === "file:"
      ? "<p><strong>You are opening the app as a file.</strong> Use <strong>http://127.0.0.1:4173</strong> for Canvas connection tests.</p>"
      : "";

  return `
    <p>${escapeHtml(error.message)}</p>
    ${fileWarning}
    <ul>
      <li>Canvas URL should look like <strong>https://your-school.instructure.com</strong>.</li>
      <li>The token must be a Canvas access token from your own Canvas account.</li>
      <li>If this page is running on Python preview, switch to the Node proxy preview URL.</li>
    </ul>
  `;
}

function isLocalHttp() {
  return (
    window.location.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(window.location.hostname)
  );
}

async function readErrorMessage(response) {
  try {
    const data = await response.json();
    if (Array.isArray(data.errors) && data.errors[0]?.message) {
      return data.errors[0].message;
    }
    if (data.message) return data.message;
    if (data.errors) return JSON.stringify(data.errors);
  } catch {
    return "";
  }
  return "";
}

function canvasPlannerItemToNote(item, index) {
  const plannable = item.plannable;
  const dueAt = plannable.due_at || item.plannable_date || item.end_date;
  const dueText = dueAt ? `Due ${formatDate(dueAt)}. ` : "";
  const courseText = item.context_name ? `${item.context_name}. ` : "";
  const details = stripHtml(plannable.details || plannable.description || "");
  const content = `${dueText}${courseText}${details || "Open this Canvas item and add your own notes before studying."}`;

  return {
    id: `canvas-${item.plannable_type || "item"}-${item.plannable_id || Date.now()}-${index}`,
    title: plannable.title || item.plannable_type || "Canvas item",
    content,
    topic: "Canvas assignment",
    color: palette[(notes.length + index) % palette.length],
    x: 80 + ((notes.length + index) % 3) * 235,
    y: 90 + Math.floor((notes.length + index) / 3) * 180,
  };
}

function runAction(action) {
  if (action === "project-agent") {
    showResponse("Project Agent", renderProjectAgent());
    return;
  }

  const selected = getSelectedNote();
  if (!selected) {
    showResponse(
      "Connect Canvas First",
      "<p>Your board is empty. Connect Canvas, choose a course, then study a module or assignment to generate notes, quizzes, flashcards, and plans.</p>",
    );
    return;
  }
  const allText = notes.map((note) => `${note.title}: ${note.content}`).join(" ");

  const responses = {
    explain: () => ({
      title: `Explain: ${selected.title}`,
      body: `
        <p><strong>Simple idea:</strong> ${selected.content}</p>
        <p>This note matters because it connects a key term to the bigger lesson. Try saying it in your own words, then name one example.</p>
        <ul>
          <li>What is the main process or object?</li>
          <li>What does it use?</li>
          <li>What does it produce or change?</li>
        </ul>
      `,
    }),
    organize: () => ({
      title: "Organized Study Map",
      body: `
        <div class="map">
          ${notes
            .map(
              (note) => `
                <div class="map-row">
                  <strong>${escapeHtml(note.topic)}:</strong>
                  ${escapeHtml(note.title)} - ${shorten(note.content, 112)}
                </div>
              `,
            )
            .join("")}
        </div>
      `,
    }),
    quiz: () => ({
      title: "Practice Quiz",
      body: `
        <ol>
          <li>What is the main idea of <strong>${escapeHtml(selected.title)}</strong>?</li>
          <li>Which two facts from the canvas are connected?</li>
          <li>Fill in the blank: ${makeBlankQuestion(selected.content)}</li>
          <li>Short answer: Why would this topic appear on a test?</li>
        </ol>
      `,
    }),
    flashcards: () => ({
      title: "Flashcards",
      body: notes
        .map(
          (note) => `
            <div class="flashcard">
              <strong>Q: What should I remember about ${escapeHtml(note.title)}?</strong>
              <span>A: ${escapeHtml(shorten(note.content, 138))}</span>
            </div>
          `,
        )
        .join(""),
    }),
    gaps: () => ({
      title: "Learning Gaps",
      body: `
        <ul>
          <li>Add one worked example for <strong>${escapeHtml(selected.title)}</strong>.</li>
          <li>Add a vocabulary note for any terms that feel unclear.</li>
          <li>Connect cause and effect: what happens before and after this concept?</li>
          <li>${allText.toLowerCase().includes("example") ? "You already have examples. Add a practice question next." : "No examples found yet. Add a concrete classroom example."}</li>
        </ul>
      `,
    }),
    plan: () => ({
      title: "30-Minute Study Plan",
      body: `
        <ol>
          <li><strong>5 min:</strong> Read each canvas note out loud.</li>
          <li><strong>10 min:</strong> Explain ${escapeHtml(selected.title)} without looking.</li>
          <li><strong>10 min:</strong> Answer the quiz questions and mark weak spots.</li>
          <li><strong>5 min:</strong> Add one missing example or diagram to the canvas.</li>
        </ol>
      `,
    }),
  };

  const result = responses[action]();
  responseTitle.textContent = result.title;
  responseBody.innerHTML = result.body;
}

function renderProjectAgent() {
  const connected = Boolean(canvasConnection.profile);
  const course = activeCourseContext?.course;
  const modules = activeCourseContext?.modules || [];
  const moduleItems = modules.flatMap((module) => module.items.map((item) => ({ ...item, moduleName: module.name })));
  const hydratedModules = modules.filter((module) => module.hydrated).length;
  const readableItems = moduleItems.filter((item) => hasReadableStudyText(item));
  const blockedItems = moduleItems
    .filter((item) => item.type === "File" && !hasReadableStudyText(item))
    .slice(0, 6);

  return `
    <div class="coach-section">
      <h3>What This Project Is</h3>
      <div class="explain-box">
        <p>This is your personal Canvas Tutor Agent. The browser app shows courses, modules, assignments, flashcards, quizzes, and study plans. The local Node server safely talks to Canvas, downloads allowed files, reads student materials, and sends daily focus mail through Resend.</p>
      </div>
    </div>
    <div class="coach-section">
      <h3>How The Agent Works</h3>
      <ol>
        <li>The app connects to Canvas with your Canvas URL and access token.</li>
        <li>The Node proxy calls Canvas APIs so the browser does not get blocked by CORS.</li>
        <li>When you select a course, it loads assignments and module outlines quickly.</li>
        <li>When you study a module, it opens the actual Canvas item API URLs and tries to read pages, files, notebooks, zips, PDFs, DOCX, PPTX, code, and text files.</li>
        <li>Flashcards and MCQs are generated only from readable text, so it avoids fake title-based questions.</li>
      </ol>
    </div>
    <div class="coach-section">
      <h3>Current Diagnosis</h3>
      <div class="map">
        <div class="study-card">
          <strong>Canvas connection</strong>
          <span>${connected ? "Connected" : "Not connected"}</span>
          <p>${connected ? `Connected as ${canvasConnection.profile?.name || canvasConnection.profile?.short_name || "Canvas user"}.` : "Connect Canvas first so the agent can inspect courses and files."}</p>
        </div>
        <div class="study-card">
          <strong>Active course</strong>
          <span>${course ? escapeHtml(course.name) : "No course selected"}</span>
          <p>${course ? `${modules.length} module${modules.length === 1 ? "" : "s"} loaded. ${hydratedModules} deeply read so far.` : "Choose a course after connecting Canvas."}</p>
        </div>
        <div class="study-card">
          <strong>Readable material</strong>
          <span>${readableItems.length} readable item${readableItems.length === 1 ? "" : "s"}</span>
          <p>${readableItems.length ? "The quiz and flashcard agent can use these readable items." : "No readable module body text has been found yet. Click Study Module or Make Quiz on a module to trigger deep reading."}</p>
        </div>
      </div>
    </div>
    <div class="coach-section">
      <h3>Fixes Already Built</h3>
      <ul>
        <li>Follows Canvas module item API URLs when page/file IDs are missing.</li>
        <li>Reads zip files, notebooks, code files, text files, PDFs, DOCX, and PPTX when Canvas allows downloads.</li>
        <li>Shows <strong>What The App Could Read</strong> so you can see exactly which files are blocked or readable.</li>
        <li>Stops creating fake quiz questions from only module/file titles.</li>
      </ul>
    </div>
    <div class="coach-section">
      <h3>Files To Check Next</h3>
      ${
        blockedItems.length
          ? blockedItems
              .map(
                (item) => `
                  <div class="module-row">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(`${item.moduleName} · ${moduleItemLabel(item)}`)}</span>
                    <p>${escapeHtml(item.summary || "Canvas has not exposed readable file text yet. Try the same module again on the latest local server, then check What The App Could Read.")}</p>
                  </div>
                `,
              )
              .join("")
          : "<p>No blocked files found in the currently inspected course. If a module still fails, run Make Quiz and read the source report.</p>"
      }
    </div>
    <div class="coach-section">
      <h3>How To Work From Here</h3>
      <ol>
        <li>Connect Canvas.</li>
        <li>Select a course.</li>
        <li>Click <strong>Make Quiz</strong> or <strong>Generate Flashcards</strong> for one module.</li>
        <li>Read <strong>What The App Could Read</strong>. If it says readable, questions should come from that content. If not, the issue is Canvas access, scanned content, or unsupported file format.</li>
      </ol>
    </div>
  `;
}

function startFocusSprint() {
  const prioritizedNotes = getPrioritizedNotes();
  const selected = getSelectedNote();
  if (!selected) {
    showResponse(
      "Focus Sprint Needs Content",
      "<p>Connect Canvas and generate module notes or an assignment plan first. Then I can turn that content into a study sprint.</p>",
    );
    return;
  }
  sprint = {
    totalSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    timerId: null,
    tasks: [
      {
        id: `sprint-${Date.now()}-1`,
        text: `Explain ${selected.title} out loud in your own words.`,
        done: false,
      },
      ...prioritizedNotes.slice(0, 3).map((note, index) => ({
        id: `sprint-${Date.now()}-${index + 2}`,
        text: `${sprintVerb(index)} ${note.title}: ${shorten(note.content, 72)}`,
        done: false,
      })),
      {
        id: `sprint-${Date.now()}-5`,
        text: "Make one flashcard for the hardest idea.",
        done: false,
      },
    ],
  };

  sprintCard.hidden = false;
  sprintTitle.textContent = `${Math.min(sprint.tasks.length, 5)} focused tasks`;
  renderSprint();
  showResponse(
    "Focus Sprint Ready",
    `<p>I built a 25-minute sprint from your canvas. Start the timer, finish the checklist, and use the selected note as your anchor.</p>
     <ul>
      <li>First: explain the selected concept.</li>
      <li>Middle: review the most important canvas notes.</li>
      <li>Last: turn the hardest point into a flashcard.</li>
     </ul>`,
  );
}

function renderSprint() {
  sprintTimer.textContent = formatTimer(sprint.remainingSeconds);
  const completed = sprint.tasks.filter((task) => task.done).length;
  const percent = sprint.tasks.length ? (completed / sprint.tasks.length) * 100 : 0;
  sprintProgressBar.style.width = `${percent}%`;
  sprintTasks.innerHTML = sprint.tasks
    .map(
      (task) => `
        <label class="sprint-task ${task.done ? "is-done" : ""}">
          <input type="checkbox" data-sprint-task="${task.id}" ${task.done ? "checked" : ""}>
          <span>${escapeHtml(task.text)}</span>
        </label>
      `,
    )
    .join("");

  sprintTasks.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => toggleSprintTask(input.dataset.sprintTask, input.checked));
  });
}

function runSprintTimer() {
  if (sprint.timerId) return;
  sprint.timerId = window.setInterval(() => {
    sprint.remainingSeconds = Math.max(0, sprint.remainingSeconds - 1);
    renderSprint();

    if (sprint.remainingSeconds === 0) {
      pauseSprintTimer();
      showResponse(
        "Sprint Complete",
        "<p>Nice. Take a short break, then use Quiz Me or Flashcards to lock in what you just reviewed.</p>",
      );
    }
  }, 1000);
}

function pauseSprintTimer() {
  if (!sprint.timerId) return;
  window.clearInterval(sprint.timerId);
  sprint.timerId = null;
}

function resetSprintTimer() {
  pauseSprintTimer();
  sprint.remainingSeconds = sprint.totalSeconds;
  sprint.tasks = sprint.tasks.map((task) => ({ ...task, done: false }));
  renderSprint();
}

function toggleSprintTask(id, done) {
  sprint.tasks = sprint.tasks.map((task) => (task.id === id ? { ...task, done } : task));
  renderSprint();
}

function autoLayout() {
  const positions = [
    [80, 70],
    [380, 70],
    [80, 300],
    [380, 300],
    [680, 185],
    [680, 410],
  ];

  notes = notes.map((note, index) => ({
    ...note,
    x: positions[index % positions.length][0],
    y: positions[index % positions.length][1] + Math.floor(index / positions.length) * 180,
  }));
  render();
  runAction("organize");
}

function resetBoard() {
  notes = [];
  selectedId = null;
  render();
  showResponse(
    "Canvas Tutor Ready",
    "<p>Connect Canvas, choose a course, then select a module or assignment to generate notes, quizzes, flashcards, and study plans.</p>",
  );
}

function getSelectedNote() {
  return notes.find((note) => note.id === selectedId) || notes[0] || null;
}

function getPrioritizedNotes() {
  const selected = getSelectedNote();
  return [...notes]
    .filter((note) => note.id !== selected.id)
    .sort((left, right) => sprintScore(right) - sprintScore(left));
}

function sprintScore(note) {
  const text = `${note.title} ${note.content}`.toLowerCase();
  let score = 0;
  if (text.includes("due")) score += 4;
  if (text.includes("quiz") || text.includes("test") || text.includes("exam")) score += 3;
  if (text.includes("compare") || text.includes("explain")) score += 2;
  if (note.topic.toLowerCase().includes("canvas")) score += 2;
  return score + Math.min(note.content.length / 120, 2);
}

function focusAdviceFromText(title, description = "") {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes("quiz") || text.includes("test") || text.includes("exam")) {
    return "Make practice questions first, then review anything you miss twice.";
  }
  if (text.includes("essay") || text.includes("paper") || text.includes("draft")) {
    return "Start with the thesis, outline the evidence, then write the hardest paragraph.";
  }
  if (text.includes("discussion")) {
    return "Prepare one clear claim, one example, and one question before posting.";
  }
  if (text.includes("lab")) {
    return "Review the procedure, variables, and expected result before doing the work.";
  }
  if (text.includes("reading") || text.includes("chapter")) {
    return "Skim headings first, write three key terms, then summarize the main idea.";
  }
  return "Break this into a 20-minute task and turn the key idea into one flashcard.";
}

function sprintVerb(index) {
  return ["Review", "Connect", "Practice"][index] || "Review";
}

function formatTimer(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function showResponse(title, body) {
  responseTitle.textContent = title;
  responseBody.innerHTML = body;
}

function setCanvasStatus(text, state) {
  canvasStatus.textContent = text;
  canvasStatus.classList.toggle("is-connected", state === "connected");
  canvasStatus.classList.toggle("is-error", state === "error");
}

function setMailStatus(text, state) {
  mailStatus.textContent = text;
  mailStatus.classList.toggle("is-connected", state === "connected");
  mailStatus.classList.toggle("is-error", state === "error");
}

function normalizeCanvasUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return "";
  }
}

function stripHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = value;
  return template.content.textContent.replace(/\s+/g, " ").trim();
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function inferTopic(text) {
  const lower = text.toLowerCase();
  if (lower.includes("date") || lower.includes("year")) return "Timeline";
  if (lower.includes("formula") || lower.includes("solve")) return "Problem solving";
  if (lower.includes("compare") || lower.includes("different")) return "Comparison";
  if (lower.includes("energy") || lower.includes("force")) return "Key concept";
  return "New note";
}

function makeBlankQuestion(text) {
  const words = text.split(" ");
  const targetIndex = words.findIndex((word) => word.length > 6);
  if (targetIndex >= 0) words[targetIndex] = "_____";
  return escapeHtml(words.slice(0, 16).join(" "));
}

function shorten(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelector("#auto-layout").addEventListener("click", autoLayout);
document.querySelector("#reset-board").addEventListener("click", resetBoard);
connectCanvasButton.addEventListener("click", connectCanvas);
importCanvasButton.addEventListener("click", importCanvasWork);
saveDigestButton.addEventListener("click", saveDailyDigest);
sendTestDigestButton.addEventListener("click", sendTestDigest);
checkDigestStatusButton.addEventListener("click", checkDigestStatus);
focusSprintButton.addEventListener("click", startFocusSprint);
sprintStartButton.addEventListener("click", runSprintTimer);
sprintPauseButton.addEventListener("click", pauseSprintTimer);
sprintResetButton.addEventListener("click", resetSprintTimer);

document.querySelectorAll(".tool-btn").forEach((button) => {
  button.addEventListener("click", () => runAction(button.dataset.action));
});

window.addEventListener("resize", updateLinks);

render();
showResponse(
  "Canvas Tutor Ready",
  "<p>Connect Canvas, choose a course, then select a module or assignment to generate study notes, quizzes, flashcards, and daily focus points.</p>",
);
