// Navigation stores only view names and course IDs, never credentials.
const courseViews = ['Overview', 'Assignments', 'Modules', 'AI Tutor', 'Flashcards', 'Quizzes', 'Notes', 'Study Plan', 'Goals', 'Resources'];
const courseCache = new Map();
let routeVersion = 0;
const shell = document.querySelector('.app-shell');
const oldSidebar = document.querySelector('.sidebar');
const connectionPanel = document.querySelector('.canvas-connect');
const mailPanel = document.querySelector('.daily-mail');
const toolPanel = document.querySelector('.panel.compact');
const selectedPanel = document.querySelector('.status-panel');
const boardPanel = document.querySelector('.workspace');
const tutorPanel = document.querySelector('.tutor-panel');
const brand = document.querySelector('.brand');
oldSidebar.replaceChildren(brand);
oldSidebar.insertAdjacentHTML('beforeend', `<nav aria-label="Main navigation">
  <a href="#dashboard">Dashboard</a><a href="#planner">Study Planner</a><a href="#goals">Goals</a>
  <a href="#resources">Resources</a><a href="#board">Study Board</a><a href="#focus">Focus Sprint</a>
  <a href="#tools">Tutor Tools</a><a href="#settings">Settings</a>
</nav><p class="sidebar-foot">A little focus. A lot of progress.</p>`);
const main = document.createElement('section');
main.className = 'main-content';
main.innerHTML = `<header class="page-bar"><button id="view-back" type="button">← Back</button><span>Your learning space</span><a href="#settings">Settings</a></header>
<div id="view-content"></div><div id="view-panels"></div>`;
shell.append(main);
const viewContent = document.querySelector('#view-content');
const viewPanels = document.querySelector('#view-panels');
const responseDrawer = document.createElement('details');
responseDrawer.className = 'response-drawer';
responseDrawer.innerHTML = '<summary>Tutor response <span>Expand / collapse</span></summary>';
responseDrawer.append(tutorPanel);
main.append(responseDrawer);
const originalShowResponse = showResponse;
showResponse = function(title, body) {
  originalShowResponse(title, body);
  responseDrawer.open = true;
};
showStudyAreas = function() {
  courseCache.clear();
  if (location.hash === '#dashboard') renderRoute();
  else location.hash = 'dashboard';
};
selectStudyArea = function(id) { location.hash = `course/${encodeURIComponent(id)}/overview`; };
document.querySelector('.workspace-bar h2').textContent = 'Make space for your ideas.';
document.querySelector('#view-back').addEventListener('click', () => {
  if (history.length > 1) history.back(); else location.hash = 'dashboard';
});
canvasTokenInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') connectCanvas();
});
canvasUrlInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') connectCanvas();
});
function viewHeading(title, description) {
  viewContent.innerHTML = `<p class="eyebrow">CANVAS TUTOR</p><h1 tabindex="-1">${escapeHtml(title)}</h1><p class="view-description">${escapeHtml(description)}</p>`;
  viewContent.querySelector('h1').focus({ preventScroll: true });
}
function courseLink(course, tab = 'overview') {
  return `#course/${encodeURIComponent(course.id)}/${tab}`;
}
function courseCards(tab = 'overview') {
  return `<div class="course-grid">${canvasConnection.courses.map(course => `<a class="course-card" href="${courseLink(course, tab)}">
    <span class="course-symbol" aria-hidden="true">${escapeHtml(course.name.slice(0, 1))}</span>
    <span class="eyebrow">${escapeHtml(course.courseCode || 'COURSE')}</span><h2>${escapeHtml(course.name)}</h2>
    <p>${escapeHtml(course.term || 'Your Canvas course')}</p><span class="card-link">Open ${tab === 'overview' ? 'workspace' : tab} →</span></a>`).join('')}</div>`;
}
async function loadCourse(course) {
  if (!courseCache.has(String(course.id))) {
    const promise = Promise.all([fetchCourseAssignments(course.id), fetchCourseModules(course.id), fetchCoursePostedNotes(course.id)])
      .then(([assignments, modules, postedNotes]) => ({ course, assignments, modules, postedNotes }))
      .catch(error => { courseCache.delete(String(course.id)); throw error; });
    courseCache.set(String(course.id), promise);
  }
  return courseCache.get(String(course.id));
}
function bindWorkspace(context) {
  const { course, assignments, modules, postedNotes } = context;
  bindStudyAreaActions(course, assignments, modules, postedNotes);
  bindSuccessCenterActions(course, assignments, modules, postedNotes);
}
async function renderCourseTab(context, tab) {
  const { course, assignments, modules, postedNotes } = context;
  activeCourseContext = context;
  const focusNote = makeCourseFocusNote(course, assignments);
  if (!notes.some(note => note.id === focusNote.id)) notes.push(focusNote);
  selectedId = focusNote.id;
  render();
  if (tab === 'overview') {
    showResponse('Course overview', renderLearningDashboard(course, assignments, modules, postedNotes, estimateCourseScore(assignments), readCourseGoal(course.id)));
  } else if (['notes', 'study-plan', 'goals', 'resources'].includes(tab)) {
    const markup = tab === 'notes' ? renderCourseNoteOrganizer(course, modules)
      : tab === 'study-plan' ? renderSmartStudyPlanner(course, assignments, modules)
      : tab === 'goals' ? renderGoalSetter(course, estimateCourseScore(assignments), readCourseGoal(course.id))
      : renderResourceRecommender(course, modules, postedNotes);
    showResponse(courseViews.find(name => name.toLowerCase().replaceAll(' ', '-') === tab), markup);
  } else if (tab === 'assignments') {
    showResponse('Upcoming assignments', assignments.length ? `<div class="map">${assignments.map(item => `<div class="assignment-row"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.dueAt ? formatDate(item.dueAt) : 'No due date')}</span><button data-plan-assignment="${item.id}" type="button">Plan assignment</button></div>`).join('')}</div><button id="add-course-assignments" type="button">Add assignments to board</button>` : '<p>No upcoming assignments. You can still study the modules and save course notes.</p>');
  } else {
    const practiceMode = tab === 'flashcards' ? 'flashcards' : tab === 'quizzes' ? 'mcq' : null;
    const saved = practiceMode && !context.chooseModule ? modules.filter(module => module.generated?.[practiceMode]).sort((a,b) => b.generated[practiceMode].at - a.generated[practiceMode].at)[0] : null;
    context.chooseModule = false;
    if (saved) {
      showResponse('AI Tutor', moduleCoverage(saved) + renderModuleIndex(saved.index) + renderAiTutorResult(course, saved, saved.generated[practiceMode].result, practiceMode) + '<button id="choose-study-module" type="button">Choose another module</button>');
      bindModuleNoteActions(course, saved);
      bindModuleIndex(course, saved, practiceMode);
      responseBody.querySelector('#choose-study-module').onclick = () => { context.chooseModule = true; renderCourseTab(context, tab); };
      return;
    }
    const attr = tab === 'flashcards' ? 'data-module-flashcards' : tab === 'quizzes' ? 'data-module-quiz' : 'data-module-notes';
    const action = tab === 'ai-tutor' ? 'Open study material & AI tools' : tab === 'modules' ? 'Study module' : `Create ${tab}`;
    showResponse(tab === 'ai-tutor' ? 'AI Tutor' : tab[0].toUpperCase() + tab.slice(1), `<p>${tab === 'ai-tutor' ? 'Choose a module, then use AI Study Guide or upload downloaded materials. AI requires a configured server key.' : 'Choose course material to begin.'}</p>${renderAiOptions()}${renderAiStatus()}<div class="map">${modules.map(module => `<div class="module-row"><strong>${escapeHtml(module.name)}</strong><span>${module.hydrated ? module.items.length : module.itemCount || ""} ${module.hydrated ? "sources scanned" : "items · read when selected"}</span><button type="button" ${attr}="${module.id}">${action}</button></div>`).join('') || '<p>No modules returned for this course. Use Notes to write your own study material.</p>'}</div>`);
  }
  bindWorkspace(context);
}
async function renderRoute() {
  const version = ++routeVersion;
  invalidateModuleRequests();
  const parts = location.hash.slice(1).split('/');
  let view = parts[0] || (canvasConnection.profile ? 'dashboard' : 'connect');
  if (!canvasConnection.profile && !['connect', 'settings', 'board', 'tools', 'focus'].includes(view)) view = 'connect';
  [connectionPanel, mailPanel, toolPanel, selectedPanel, boardPanel].forEach(panel => { panel.hidden = true; viewPanels.append(panel); });
  responseDrawer.open = false;
  responseDrawer.hidden = false;
  sprintCard.hidden = view !== 'focus';
  oldSidebar.hidden = view === 'connect';
  shell.classList.toggle('connection-screen', view === 'connect');
  document.querySelectorAll('nav a').forEach(link => {
    if (link.getAttribute('href') === `#${view}`) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (view === 'connect' || view === 'settings') {
    viewHeading(view === 'connect' ? 'Your next chapter starts here.' : 'Settings', view === 'connect' ? 'Connect Canvas to bring your courses and study tools into one calm space.' : 'Manage your Canvas connection and mail preferences.');
    connectionPanel.hidden = false;
    if (view === 'connect') {
      viewContent.insertAdjacentHTML('beforeend', '<a class="text-link" href="#board">Continue to saved study board →</a>');
      responseDrawer.hidden = true;
    } else {
      viewContent.insertAdjacentHTML('beforeend', '<section class="panel"><h2>AI configuration</h2>' + renderAiStatus() + '</section>');
      refreshAiStatus(viewContent);
      mailPanel.hidden = false;
      try {
        const state = await fetch('/api/daily-digest/status').then(response => response.json());
        if (version !== routeVersion) return;
        const disabled = state.deliveryMode === 'disabled';
        saveDigestButton.disabled = disabled;
        sendTestDigestButton.disabled = disabled;
        setMailStatus(disabled ? 'Disabled for preview' : state.deliveryMode, '');
      } catch { setMailStatus('Status unavailable', 'error'); }
    }
    return;
  }
  if (view === 'board' || view === 'tools' || view === 'focus') {
    viewHeading(view === 'board' ? 'Study board' : view === 'focus' ? 'Focus Sprint' : 'Tutor tools', 'Your notes stay in this browser. Choose a card, then explore a tool.');
    boardPanel.hidden = false; toolPanel.hidden = false; selectedPanel.hidden = false;
    if (!notes.length) viewContent.insertAdjacentHTML('beforeend', '<p class="empty-state">No study notes yet. Add a note below or open a course to generate study material.</p>');
    viewContent.insertAdjacentHTML('beforeend', '<button id="new-board-note" type="button">+ New note</button>');
    document.querySelector('#new-board-note').onclick = () => {
      notes.push({ id: `note-${Date.now()}`, title: 'New note', content: 'Add your study notes.', topic: 'Personal', color: 'green', x: 20, y: 20 });
      render(); autoLayout();
    };
    if (view === 'focus') { startFocusSprint(); responseDrawer.open = true; }
    render(); return;
  }
  if (view === 'course') {
    const course = canvasConnection.courses.find(item => String(item.id) === decodeURIComponent(parts[1] || ''));
    if (!course) { viewHeading('Course not found', 'Return to the dashboard and choose an available course.'); return; }
    const tab = courseViews.map(name => name.toLowerCase().replaceAll(' ', '-')).includes(parts[2]) ? parts[2] : 'overview';
    viewHeading(course.name, course.courseCode || 'Your course workspace');
    viewContent.insertAdjacentHTML('beforeend', `<a class="text-link" href="#dashboard">← All courses</a><nav class="course-tabs" aria-label="Course tools">${courseViews.map(name => { const key = name.toLowerCase().replaceAll(' ', '-'); return `<a href="${courseLink(course, key)}" ${key === tab ? 'aria-current="page"' : ''}>${name}</a>`; }).join('')}</nav>`);
    showResponse('Loading course', '<p role="status">Loading assignments and module outlines…</p>');
    try {
      const context = await loadCourse(course);
      if (version !== routeVersion) return;
      await renderCourseTab(context, tab);
    } catch (error) {
      if (version !== routeVersion) return;
      showResponse('Could not load course', `<p role="alert">${escapeHtml(error.message)}</p><button id="retry-course" type="button">Try again</button><p><a href="#settings">Connection settings</a></p>`);
      responseBody.querySelector('#retry-course').onclick = renderRoute;
    }
    return;
  }
  const picker = { planner: ['Study Planner', 'study-plan'], goals: ['Goals', 'goals'], resources: ['Resources', 'resources'] }[view];
  viewHeading(picker ? picker[0] : 'Welcome back.', picker ? 'Choose a course to keep your work focused.' : 'See what’s ahead. Make room for what matters.');
  viewContent.insertAdjacentHTML('beforeend', `<div class="quick-actions"><a href="#board">Open study board</a><a href="#focus">Start a focus sprint</a><a href="#planner">Plan your week</a></div><h2>Your courses <span class="count">${canvasConnection.courses.length}</span></h2>${courseCards(picker?.[1]) || ''}${canvasConnection.courses.length ? '' : '<p class="empty-state">No active Canvas courses found. Your saved board is still available.</p>'}<p class="coming-soon">Study buddies & shared rooms <span>Coming soon</span></p>`);
  if (!picker) {
    viewContent.insertAdjacentHTML('beforeend', '<section class="deadline-panel"><h2>Upcoming deadlines</h2><div id="deadlines" role="status">Loading your next seven days…</div></section>');
    try {
      const items = await canvasApiFetch(canvasConnection.baseUrl, canvasConnection.token, `/api/v1/planner/items?${new URLSearchParams({ start_date: new Date().toISOString(), end_date: new Date(Date.now() + 7 * 86400000).toISOString(), per_page: "100" })}`);
      if (version !== routeVersion) return;
      document.querySelector('#deadlines').innerHTML = Array.isArray(items) && items.length ? items.filter(item => item.plannable).slice(0, 12).map(item => `<div class="deadline-row"><strong>${escapeHtml(item.plannable.title || 'Canvas item')}</strong><span>${escapeHtml(item.context_name || '')}</span><span>${escapeHtml(item.plannable_date ? formatDate(item.plannable_date) : 'No due date')}</span></div>`).join('') : '<p>No upcoming deadlines. A good time to review your course material.</p>';
    } catch (error) {
      if (version === routeVersion) document.querySelector('#deadlines').textContent = `${error.message} Open Settings to check your connection.`;
    }
  }
}
window.addEventListener('hashchange', renderRoute);
renderRoute();
