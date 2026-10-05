// Run with NODE_PATH pointing to a jsdom installation; no real Canvas or mail calls.
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const root = path.join(__dirname, '..');
function createApp(saved) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'http://127.0.0.1:4177/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  if (saved) w.localStorage.setItem('canvasTutor.boardNotes.v1', saved);
  const requests = [];
  w.fetch = async (url, options) => {
    requests.push(url);
    if (url === '/api/ai-status') return {ok:true,json:async()=>({configured:true,model:'fixture-model'})};
    if (url === '/api/daily-digest/status') return { json: async () => ({ deliveryMode: 'disabled' }) };
    if (url !== '/api/canvas') throw Error('Unexpected network request');
    const body = JSON.parse(options.body);
    if (body.token !== 'fixture-private') return { status: 401, ok: false, json: async () => ({authReason:'expired'}) };
    const p = body.path;
    const data = p.includes('/users/self/profile') ? { name: 'Test Student' }
      : p.startsWith('/api/v1/courses?') ? [{ id: 1, name: 'Biology' }, { id: 2, name: 'Art without deadlines' }]
      : p.includes('/modules/') ? [{id:11,title:'Introduction',type:'Page'}]
      : p.includes('/modules?') ? [{id:10,name:p.includes('/1/') ? 'Cells' : 'Color'}]
      : [];
    return { status: 200, ok: true, json: async () => data };
  };
  w.eval(fs.readFileSync(path.join(root, 'source-quality.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'app.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'ui.js'), 'utf8'));
  return { dom, w, requests };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 30));
async function route(w, hash) { w.location.hash = hash; await settle(); }
test('connection → actual courses → scoped tabs → dashboard → saved board; mail stays disabled', async () => {
  const {dom,w,requests} = createApp();
  try {
    assert.equal(w.document.querySelector('.canvas-connect').hidden, false);
    w.document.querySelector('#canvas-url').value = 'https://school.instructure.com';
    w.document.querySelector('#canvas-token').value = 'bad-fixture';
    w.document.querySelector('#connect-canvas').click(); await settle();
    assert.match(w.document.querySelector('#canvas-auth-error').textContent, /expired/);
    w.document.querySelector('#canvas-token').value = 'fixture-private';
    w.document.querySelector('#connect-canvas').click(); await settle();
    assert.equal(w.location.hash, '#dashboard');
    assert.equal(w.document.querySelectorAll('.course-card').length, 2);
    assert.equal(w.document.querySelector('.canvas-connect').hidden, true);
    assert.match(w.document.querySelector('#deadlines').textContent, /No upcoming deadlines/);
    w.document.querySelector('.course-card').click(); await settle();
    assert.match(w.document.querySelector('#view-content h1').textContent, /Biology/);
    assert.equal(w.document.querySelectorAll('.course-tabs a').length, 10);
    for (const tab of ['assignments','modules','ai-tutor','flashcards','quizzes','notes','study-plan','goals','resources']) {
      await route(w, `course/1/${tab}`);
      assert.equal(w.document.querySelector('.course-tabs [aria-current]').hash, `#course/1/${tab}`);
      assert.ok(w.document.querySelector('#response-body').textContent.trim());
      if (['ai-tutor','flashcards','quizzes'].includes(tab)) {
        assert.match(w.document.querySelector('[data-ai-status]').textContent,/AI configured.*fixture-model/);
        assert.ok(w.document.querySelector('.ai-options select'));
      }
    }
    await route(w, 'course/2/modules');
    assert.match(w.document.querySelector('#response-body').textContent, /Color/);
    assert.doesNotMatch(w.document.querySelector('#response-body').textContent, /Cells/);
    w.history.back(); await settle();
    assert.equal(w.location.hash, '#course/1/resources');
    await route(w, 'dashboard');
    assert.equal(w.document.querySelectorAll('.course-card').length, 2);
    await route(w, 'board');
    w.document.querySelector('#new-board-note').click();
    for (const card of w.document.querySelectorAll('.note')) {
      Object.defineProperty(card, 'offsetHeight', { value: 270 });
    }
    Object.defineProperty(w.document.querySelector('#canvas'), 'clientWidth', { value: 600 });
    w.document.querySelector('#auto-layout').click();
    const positioned = JSON.parse(w.localStorage.getItem('canvasTutor.boardNotes.v1'));
    for (let i = 0; i < positioned.length; i++) for (let j = i + 1; j < positioned.length; j++) {
      const a = positioned[i], b = positioned[j];
      assert.ok(Math.abs(a.x - b.x) >= 228 || Math.abs(a.y - b.y) >= 270);
    }
    const saved = w.localStorage.getItem('canvasTutor.boardNotes.v1');
    assert.match(saved, /New note/); assert.ok(!saved.includes('fixture-private'));
    const refreshed = createApp(saved);
    await route(refreshed.w, 'board');
    assert.match(refreshed.w.document.querySelector('#canvas').textContent, /New note/);
    refreshed.dom.window.close();
    await route(w, 'settings');
    assert.match(w.document.querySelector('#view-content [data-ai-status]').textContent,/AI configured.*fixture-model/);
    assert.equal(w.document.querySelector('#save-digest').disabled, true);
    assert.equal(w.document.querySelector('#send-test-digest').disabled, true);
    assert.ok(!requests.some(url => url.includes('/test') || url.includes('/config')));
    assert.ok(!w.location.href.includes('fixture'));
  } finally { dom.window.close(); }
});
