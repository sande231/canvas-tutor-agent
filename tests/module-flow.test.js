const {fixtureIndexedResponse}=require('./helpers/index-fixture');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
function app(handler) {
  const dom = new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'), {url:'http://127.0.0.1:4177',runScripts:'outside-only'});
  dom.window.localStorage.setItem('canvas-tutor-ai-options-v1',JSON.stringify({count:1,difficulty:'mixed'}));
  dom.window.fetch = async (url, options) => ({ok:true,status:200,json:async()=>url === '/api/ai-status' ? {configured:true,model:'fixture'} : fixtureIndexedResponse(url, JSON.parse(options?.body || '{}'),handler)});
  dom.window.eval(fs.readFileSync(path.join(root,'source-quality.js'),'utf8') + '\n' + fs.readFileSync(path.join(root,'source-index.js'),'utf8') + '\n' + fs.readFileSync(path.join(root, 'tutor-core.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root,'practice-core.js'),'utf8') + '\n' + fs.readFileSync(path.join(root,'app.js'),'utf8') + '\n' + fs.readFileSync(path.join(root,'practice-ui.js'),'utf8') + '\n' + fs.readFileSync(path.join(root, 'tutor-ui.js'), 'utf8'));
  return dom;
}
const content = 'Behavioral ethics examines how people actually make moral decisions, including the influence of bias.';
test('module pagination resolves page, discussion, assignment, file and external content; headings and empty sources excluded', async () => {
  const calls = []; let aiPayload;
  const items = [
    {id:1,type:'SubHeader',title:'Week 4'}, {id:2,type:'Discussion',title:'Intro',content_id:22},
    {id:3,type:'Page',title:'Ethics',page_url:'ethics'}, {id:4,type:'Assignment',title:'Essay',content_id:44},
    {id:5,type:'File',title:'Reading.pdf',content_id:55}, {id:6,type:'ExternalUrl',title:'Behavioral Ethics',external_url:'https://public.example/ethics'},
    {id:7,type:'Page',title:'Empty',page_url:'empty'}
  ];
  const dom = app((url, body) => {
    calls.push([url,body]);
    if (url === '/api/canvas-file-text') return {readable:true,text:content,title:'Reading.pdf'};
    if (url === '/api/external-text') { assert.equal(body.token,undefined); return {readable:true,text:content,title:'Behavioral Ethics'}; }
    if (url === '/api/ai-tutor') { aiPayload = body; return {summary:'From the reading',flashcards:[{front:'What influences moral decisions?',back:'Bias',source:'Intro',evidence:content}],mcq:[]}; }
    if (body.path.includes('/items?')) return new URL(body.path, 'https://canvas.example').searchParams.get('page') === '1' ? items.slice(0,3) : new URL(body.path, 'https://canvas.example').searchParams.get('page') === '2' ? items.slice(3) : [];
    if (body.path.includes('/discussion_topics/22')) return {message: `<p>${content}</p>`};
    if (body.path.includes('/assignments/44')) return {description:`<p>${content}</p>`};
    if (body.path.includes('/pages/ethics')) return {body:`<p>${content}</p>`};
    if (body.path.includes('/pages/empty')) return {body:''};
    throw Error('Unexpected request path');
  });
  try {
    const w=dom.window, course={id:201,name:'COSC201'}, module={id:4,name:'Week 4',courseId:201,items:[]};
    const normalized = w.normalizeModuleItem('Week 4', w.normalizeModuleItem('Week 4',items[1]));
    assert.equal(normalized.contentId,22);
    await w.runAiTutor(course,module,'flashcards');
    assert.equal(module.items.length,7);
    assert.equal(module.items.filter(w.hasReadableStudyText).length,5);
    assert.equal(module.items[0].status,'heading');
    assert.match(module.items[6].reason,/empty body/);
    assert.equal(aiPayload.courseId,201); assert.equal(aiPayload.moduleId,4);
    assert.equal(module.index.plan.sources.length,5);assert.equal(aiPayload.concepts.length,1);
    assert.ok(aiPayload.passages.every(p=>p.text.includes('moral decisions')));
    assert.match(w.document.querySelector('#response-body').textContent,/Partial coverage/);
    assert.ok(calls.some(([,b])=>b.path?.includes('page=3')));
  } finally {dom.window.close();}
});
test('empty content blocks AI generation and shows recovery, not generic advice', async()=>{
  let aiCalls=0;
  const dom=app((url,body)=>{
    if(url==='/api/ai-tutor') aiCalls++;
    if(body.path?.includes('/items?')) return new URL(body.path, 'https://canvas.example').searchParams.get('page') === '1' ? [{id:1,type:'Discussion',content_id:1,title:'Empty discussion'}] : [];
    return {message:''};
  });
  try {
    await dom.window.runAiTutor({id:1,name:'Course'},{id:2,name:'Module',items:[]},'mcq');
    assert.equal(aiCalls,0);
    assert.match(dom.window.document.querySelector('#response-body').textContent,/No readable material/);
    assert.match(dom.window.document.querySelector('#response-body').textContent,/empty body/);
  } finally {dom.window.close();}
});
test('late AI result cannot overwrite a newly selected module', async()=>{
  let release, started;
  const waiting = new Promise(resolve=>{started=resolve;});
  const dom=app((url,body)=>{
    if(url==='/api/ai-tutor') {started(); return new Promise(resolve=>{release=resolve;});}
    if(body.path.includes('/items?')) return new URL(body.path, 'https://canvas.example').searchParams.get('page') === '1' ? [{id:1,type:'Page',page_url:'one',title:'Old source'}] : [];
    return {body:content};
  });
  try {
    const w=dom.window;
    const pending=w.runAiTutor({id:1,name:'Old course'},{id:1,name:'Old module',items:[]},'mcq');
    await waiting;
    w.invalidateModuleRequests();
    w.showResponse('New module','<p>New module selected</p>');
    release({summary:'STALE OLD RESULT',flashcards:[],mcq:[]});
    await pending;
    assert.equal(w.document.querySelector('#response-title').textContent,'New module');
    assert.ok(!w.document.querySelector('#response-body').textContent.includes('STALE'));
  } finally {dom.window.close();}
});
test('switching modules during retrieval discards the old content', async()=>{
  let release, started;
  const waiting=new Promise(resolve=>{started=resolve;});
  const dom=app((url,body)=>{
    if(body.path.includes('/items?')) return new URL(body.path,'https://canvas.example').searchParams.get('page') === '1' ? [{id:1,type:'Discussion',content_id:body.path.includes('/modules/1/') ? 11 : 22,title:'Discussion'}] : [];
    if(body.path.includes('/discussion_topics/11')) {started();return new Promise(resolve=>{release=resolve;});}
    return {message:'The second module examines professional responsibility, explaining how professional obligations influence decisions and behavior in complex organizations.'};
  });
  try {
    const w=dom.window, course={id:201,name:'Course'}, first={id:1,name:'First',items:[]}, second={id:2,name:'Second',items:[]};
    const pending=w.hydrateSelectedModule(course,[first],1,'First');
    await waiting;
    const current=await w.hydrateSelectedModule(course,[second],2,'Second');
    release({message:'This old content must not enter the second module.'});
    assert.equal(await pending,null);
    assert.equal(first.items.length,0);
    assert.match(current.items[0].summary,/professional responsibility/);
    assert.ok(!w.buildAiTutorPayload(course,current,'mcq').studyText.includes('old content'));
  } finally {dom.window.close();}
});

test('Study Module uses the model-backed path rather than the old generic note template',async()=>{
 const dom=app(()=>{throw Error('No network expected');});
 try {
  let call;
  dom.window.runAiTutor=async(course,module,mode)=>{call={course,module,mode};};
  await dom.window.generateModuleNotes({id:201},[{id:4,name:'Week 4'}],4);
  assert.equal(call.mode,'study');assert.equal(call.module.id,4);
 } finally {dom.window.close();}
});
test('stalled generation leaves loading with Retry; the retry renders cards successfully',async()=>{
 let hang=true;
 const dom=app((url,body)=>{
  if(url==='/api/ai-tutor') return hang ? new Promise(()=>{}) : {keyPoints:[],mcq:[],flashcards:[{front:'What influences ethical choices?',back:'Social pressure and cognitive biases.',source:'Ethics',evidence:content}]};
  if(body.path.includes('/items?'))return new URL(body.path,'https://canvas.example').searchParams.get('page')==='1'?[{id:1,type:'Page',page_url:'ethics',title:'Ethics'}]:[];
  return {body:content};
 });
 try{
  const w=dom.window,realFetch=w.fetchAiTutorResult;
  w.fetchAiTutorResult=(payload,options={})=>realFetch(payload,{...options,timeoutMs:5});
  await w.runAiTutor({id:1,name:'Course'},{id:4,name:'Week 4',items:[]},'flashcards');
  assert.equal(w.document.querySelector('#generation-progress'),null);
  assert.match(w.document.querySelector('#response-body [role="alert"]').textContent,/timed out/);
  hang=false;
  w.document.querySelector('[data-ai-tutor-mode]').click();
  for(let i=0;i<50&&!w.document.querySelector('[data-flip]');i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(w.document.querySelector('[data-flip]'));
 }finally{dom.window.close();}
});
test('canceling active generation exits loading and ignores late provider output',async()=>{
 let release,started;
 const waiting=new Promise(resolve=>{started=resolve;});
 const dom=app((url,body)=>{
  if(url==='/api/ai-tutor'){started();return new Promise(resolve=>{release=resolve;});}
  if(body.path.includes('/items?'))return new URL(body.path,'https://canvas.example').searchParams.get('page')==='1'?[{id:1,type:'Page',page_url:'ethics',title:'Ethics'}]:[];
  return {body:content};
 });
 try{
  const w=dom.window;
  const pending=w.runAiTutor({id:1,name:'Course'},{id:4,name:'Week 4',items:[]},'mcq');
  await waiting;w.document.querySelector('#cancel-generation').click();await pending;
  assert.match(w.document.querySelector('#response-body [role="alert"]').textContent,/canceled/);
  assert.equal(w.document.querySelector('#generation-progress'),null);
  release({summary:'late result',flashcards:[],mcq:[]});
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.match(w.document.querySelector('#response-body [role="alert"]').textContent,/canceled/);
 }finally{dom.window.close();}
});
