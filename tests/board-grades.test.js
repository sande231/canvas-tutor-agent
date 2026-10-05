const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../source-quality.js'), 'utf8') + '\n' + fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const key = 'canvasTutor.boardNotes.v1';
function boot(storage = new Map(), unavailable = false, fetchImpl = undefined) {
  const element = () => ({
    querySelectorAll: () => [], querySelector: () => element(),
    addEventListener() {}, appendChild() {}, setAttribute() {},
    classList: { toggle() {} }, style: {}, dataset: {},
  });
  const elements = new Map();
  const context = vm.createContext({
    document: { querySelector: (key) => { if (!elements.has(key)) elements.set(key, element()); return elements.get(key); }, querySelectorAll: () => [], createElement: element, createElementNS: element },
    fetch: fetchImpl,
    window: { location: { protocol: "http:", hostname: "127.0.0.1" }, addEventListener() {}, prompt: () => 'Edited' },
    localStorage: {
      getItem(k) { if (unavailable) throw Error('disabled'); return storage.get(k) ?? null; },
      setItem(k, v) { if (unavailable) throw Error('full'); storage.set(k, v); },
    }, console: { warn() {} }, URL, URLSearchParams, setTimeout, clearTimeout,
  });
  vm.runInContext(source, context);
  return (code) => vm.runInContext(code, context);
}
const note = { id: 'one', title: 'Title', content: 'Text', topic: 'Topic', color: 'green', x: 90, y: 120 };
test('notes survive reload, edits, deletion, reset, and exclude extra fields', () => {
  const storage = new Map([[key, JSON.stringify([{ ...note, token: 'fixture', connection: { password: 'fixture' } }])]]);
  let run = boot(storage);
  assert.equal(run('notes.length'), 1);
  assert.deepEqual(Object.keys(JSON.parse(storage.get(key))[0]).sort(), Object.keys(note).sort());
  run('editBoardNote("one")');
  run = boot(storage);
  assert.equal(run('notes[0].content'), 'Edited');
  run('autoLayout()');
  run = boot(storage);
  assert.equal(run('notes[0].x'), 16);
  run('deleteBoardNote("one")');
  assert.equal(boot(storage)('notes.length'), 0);
  storage.set(key, JSON.stringify([note]));
  boot(storage)('resetBoard()');
  assert.equal(boot(storage)('notes.length'), 0);
});
test('malformed and partially invalid data, duplicates and unavailable storage', () => {
  for (const value of ['{invalid', '{}', 'null', '[null, 3, {}]']) {
    assert.equal(boot(new Map([[key, value]]))('notes.length'), 0);
  }
  const run = boot(new Map([[key, JSON.stringify([null, note, note, { ...note, id: 'two', x: 'bad', color: 'bad' }])]]));
  assert.equal(run('notes.length'), 2);
  assert.equal(run('notes[1].x'), 80);
  assert.equal(run('notes[1].color'), 'yellow');
  assert.doesNotThrow(() => boot(new Map(), true)('resetBoard()'));
});
test('grade parsing preserves zero and excludes missing, blank and invalid values', () => {
  const run = boot();
  for (const expression of ['null', 'undefined', '""', '"  "', 'false', 'NaN', 'Infinity', '"bad"']) {
    assert.equal(run(`numericGrade(${expression})`), null);
    assert.equal(run(`formatScore(${expression})`), 'No graded work');
  }
  assert.equal(run('numericGrade(0)'), 0);
  assert.equal(run('numericGrade("0")'), 0);
  assert.equal(run('formatScore(0)'), '0%');
  assert.equal(run('estimateCourseScore([{score:null,points:100},{score:"",points:100},{score:0,points:10},{score:15,points:20}])'), 50);
  assert.equal(run('estimateCourseScore([{score:null,points:100}])'), null);
  assert.equal(run('predictFinalGrade(null, 100)'), null);
  assert.equal(run('goalAdvice(null, 90)'), 'No graded work.');
  assert.equal(run('detectConceptGaps([{score:null,points:10},{score:0,points:10}],[],[]).length'), 1);
});
test('dashboard labels the loaded graded-only average and missing grade state', () => {
  const run = boot();
  const html = run('renderSuccessCenter({id:1,name:"Course",score:99},[],[],[])');
  assert.match(html, /Graded-only average/);
  assert.match(html, /No graded work/);
  assert.doesNotMatch(html, /99%/);
  assert.match(run('renderSuccessCenter({id:1,name:"Course"},[{score:0,points:10}],[],[])'), /0%/);
});

test('Connect uses UI credentials and stops all subsequent requests after Canvas 401', async () => {
  let calls = 0;
  const run = boot(new Map(), false, async (url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    if (url !== '/api/canvas' || body.token !== 'fixture-ui' || body.path !== '/api/v1/users/self/profile') {
      throw Error('Unexpected request or credential source');
    }
    return { status: 401, ok: false, json: async () => ({ source: 'canvas', authReason: 'expired' }) };
  });
  run('canvasUrlInput.value = "https://example.instructure.com"; canvasTokenInput.value = " fixture-ui ";');
  await run('connectCanvas()');
  assert.equal(calls, 1);
  assert.match(run('document.querySelector("#canvas-auth-error").textContent'), /expired/);
  assert.equal(run('importCanvasButton.disabled'), true);
  await assert.rejects(run('canvasApiFetch("", "", "/api/v1/courses")'), /Requests are paused/);
  await assert.rejects(run('canvasFileTextFetch("", "", 1)'), /Requests are paused/);
  assert.equal(calls, 1);
  await run('connectCanvas()');
  assert.equal(calls, 2);
});

test('proxy forwards only request Bearer credentials and marks upstream 401 safely', async () => {
  const { EventEmitter } = require('node:events');
  const serverSource = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
  let forwarded = false;
  const context = vm.createContext({
    require: require('node:module').createRequire(require('node:path').join(__dirname, '../server.js')), __dirname: require('node:path').join(__dirname, '..'),
    process: { env: { EMAIL_DISABLED: '1', CANVAS_TOKEN: 'fixture-stale' }, argv: [] },
    module: { exports: {} }, URL, URLSearchParams, Buffer, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      forwarded = options.headers.Authorization === 'Bearer fixture-ui';
      return { status: 401, ok: false, text: async () => JSON.stringify({ errors: [{ message: 'Expired access token' }] }) };
    },
  });
  vm.runInContext(serverSource, context);
  const request = new EventEmitter();
  let status, payload;
  context.request = request;
  context.response = { writeHead(code) { status = code; }, end(body) { payload = JSON.parse(body); } };
  const result = vm.runInContext('proxyCanvasRequest(request, response)', context);
  request.emit('data', JSON.stringify({ baseUrl: 'https://example.instructure.com', token: ' fixture-ui ', path: '/api/v1/users/self/profile' }));
  request.emit('end');
  await result;
  assert.equal(forwarded, true, 'Bearer must use the UI request credential');
  assert.equal(status, 401);
  assert.equal(payload.source, 'canvas');
  assert.equal(payload.authReason, 'expired');
  assert.equal(JSON.stringify(payload).includes('fixture'), false);
});
