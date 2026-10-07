const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {JSDOM}=require('jsdom');
process.env.EMAIL_DISABLED='1';
const server=require('../server');
const T=require('../tutor-core');
const P=require('../practice-core');
const {buildEvidencePassages,createIndexPlan,indexedConceptId}=require('../source-index');
const root=path.join(__dirname,'..');
const sources=[
 {id:'a',title:'Averages.txt',text:'The arithmetic mean is calculated by adding all observations and dividing by their count. For values 2 and 4, the sum is 6 and the mean is 3. The sum alone is not the mean.'},
 {id:'z',title:'Final reading.txt',text:'The median is the middle value after sorting the observations. For values 9, 1 and 5, sorting gives 1, 5 and 9, so the median is 5. Skipping sorting can produce an incorrect median.'},
];
const passages=buildEvidencePassages(sources);
const concepts=passages.map((p,i)=>({id:indexedConceptId(i?'Median':'Mean'),name:i?'Median':'Mean',explanation:p.text,importance:3,kind:'definition',evidenceIds:[p.id]}));
const index={plan:createIndexPlan(sources),concepts,parts:[{status:'complete',concepts}]};
const course={id:1,name:'Statistics'},moduleInfo={id:9,name:'Averages',items:[],index};
function guideFor(rows=concepts){return Object.fromEntries(Object.keys(T.sections).map(key=>[key,rows.map(c=>({title:key==='checkYourself'?`How do you calculate ${c.name}?`:c.name,text:c.explanation,conceptId:c.id,evidenceId:c.evidenceIds[0]}))]));}
function groundedGuide(rows=concepts){return server.validateStudyGuide(guideFor(rows),sources,passages,concepts);}
function invoke(body,fn=server.proxyAiTutor){const request=new EventEmitter();return new Promise((resolve,reject)=>{let status;fn(request,{writeHead(s){status=s;},end(text){resolve({status,body:JSON.parse(text)});}}).catch(reject);request.emit('data',JSON.stringify(body));request.emit('end');});}
async function provider(mock,run){const oldFetch=global.fetch,key=process.env.OPENAI_API_KEY;global.fetch=mock;process.env.OPENAI_API_KEY='fixture-key';try{return await run();}finally{global.fetch=oldFetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}}
function browser(fetchImpl){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://127.0.0.1:4177',runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.fetch=async(url,options)=>url==='/api/ai-status'?{ok:true,json:async()=>({configured:true,model:'fixture'})}:fetchImpl(url,options);
 dom.window.eval(['source-quality.js','source-index.js','tutor-core.js','practice-core.js','app.js','practice-ui.js','tutor-ui.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n'));
 return dom;
}
const settle=()=>new Promise(r=>setTimeout(r,0));
async function until(fn){for(let i=0;i<80;i++){if(fn())return;await settle();}assert.fail('UI condition did not complete');}
function mount(w,options={}){w.showResponse('Tutor','<div id="fixture-chat"></div>');w.mountTutorChat(w.document.querySelector('#fixture-chat'),{course,module:moduleInfo,...options});}
function ask(w,question){const input=w.document.querySelector('[data-chat-question]');input.value=question;input.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('[data-chat-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
function reply(p=passages[0]){return {configured:true,supported:true,responseKind:'explanation',parts:[{text:'Add the values and divide by count.',evidenceId:p.id,evidence:p.text,sourceId:p.sourceId,source:sources.find(s=>s.id===p.sourceId).title,section:p.section}]};}

test('study mode has its own strict schema, uses all sections, and attaches real citations',async()=>{
 let sent;
 await provider(async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({output_text:JSON.stringify(guideFor())})};},async()=>{
  const response=await invoke({mode:'study',count:1,sources,passages,concepts});assert.equal(response.status,200);
  assert.deepEqual(Object.keys(response.body.guide),Object.keys(T.sections));
  for(const key of Object.keys(T.sections)){assert.equal(response.body.guide[key].length,2);assert.equal(response.body.guide[key][1].evidence,passages[1].text);assert.equal(response.body.guide[key][1].source,sources[1].title);}
  assert.equal(sent.text.format.name,'module_study_guide');assert.match(sent.instructions,/real study guide/);assert.doesNotMatch(sent.input[0].content[0].text,/Set mcq|Keep summary empty|Generate .*flashcards/);
  assert.equal((await invoke({mode:'study',sources})).status,400);
 });
});
test('guide rejects fabricated evidence, wrong concepts, malformed sections, and preserves the grounding validator',()=>{
 const raw=guideFor();raw.overview[0].evidenceId='invented';raw.workedExamples[1].conceptId='invented';
 const valid=server.validateStudyGuide(raw,sources,passages,concepts);assert.equal(valid.overview.length,1);assert.equal(valid.workedExamples.length,1);
 assert.throws(()=>server.validateStudyGuide({...raw,studyOrder:'invalid'},sources,passages,concepts),/missing a section/);
 assert.equal(server.validateGroundedResult({flashcards:[],mcq:[],keyPoints:[{text:'Pretend quote',evidenceId:'invented'}]},sources,passages).keyPoints.length,0);
});
test('guide batches cover the entire index including the last source, independently of card count',async()=>{
 const allSources=Array.from({length:12},(_,i)=>({id:String(i),title:`Source ${i}`,text:`Concept ${i} explains an important numeric technique. Its supported method uses observation ${i} and the associated measurement to calculate a useful statistic.`}));
 const plan=createIndexPlan(allSources),allPassages=plan.batches.flat(),allConcepts=allPassages.map(p=>({id:indexedConceptId(p.sourceId),name:p.sourceId,explanation:p.text,kind:'fact',importance:3,evidenceIds:[p.id]}));
 const allIndex={plan,concepts:allConcepts,parts:plan.batches.map(()=>({status:'complete'}))};let calls=0;
 const dom=browser(async(url,options)=>{assert.equal(url,'/api/ai-tutor');calls++;const body=JSON.parse(options.body);assert.equal(body.mode,'study');assert.ok(body.concepts.length<=10);return {ok:true,json:async()=>({guide:server.validateStudyGuide(guideFor(body.concepts),allSources,allPassages,allConcepts)})};});
 try{
  const result=await dom.window.generateStudyGuide({courseId:1,moduleId:9,index:allIndex,count:1,mode:'study'});assert.equal(calls,2);assert.equal(result.guide.keyConcepts.length,12);assert.ok(result.guide.keyConcepts.some(row=>row.sourceId==='11'));assert.match(result.notice,/12 of 12 indexed concepts/);
  const html=dom.window.renderStudyGuide(course,moduleInfo,result);for(const label of Object.values(T.sections))assert.ok(html.includes(label));assert.doesNotMatch(html,/AI MCQ Quiz|No questions returned|Practice questions/);assert.equal((html.match(/class="source-citation"/g)||[]).length,84);
 }finally{dom.window.close();}
});
test('partial guide failures retain completed sections and report partial coverage',async()=>{
 const extra=Array.from({length:11},(_,i)=>({...concepts[0],id:indexedConceptId(String(i)),name:String(i)})),partialIndex={...index,concepts:extra};let calls=0;
 const dom=browser(async(_url,options)=>{const body=JSON.parse(options.body);if(++calls===2)return {ok:true,json:async()=>({error:'Fixture provider failure'})};return {ok:true,json:async()=>({guide:server.validateStudyGuide(guideFor(body.concepts),sources,passages,extra)})};});
 try{const output=await dom.window.generateStudyGuide({index:partialIndex,count:1});assert.equal(output.shortfall,true);assert.match(output.notice,/Partial guide/);assert.ok(output.guide.overview.length);assert.match(output.warnings.join(' '),/provider failure/);}finally{dom.window.close();}
});
test('saved guides survive reload and contain study content only',()=>{
 const dom=browser();let saved;try{
  const result={guide:groundedGuide(),token:'SHOULD_NOT_SAVE'};dom.window.saveGeneratedPractice({...course,token:'SHOULD_NOT_SAVE'},moduleInfo,'study',result);saved=dom.window.localStorage.getItem(P.storageKey(1,9));assert.doesNotMatch(saved,/SHOULD_NOT_SAVE|token/);
 }finally{dom.window.close();}
 const reload=browser();try{const w=reload.window;w.localStorage.setItem(P.storageKey(1,9),saved);w.showSavedPractice();assert.match(w.document.querySelector('#response-body').textContent,/Study guide/);w.document.querySelector('[data-open-saved]').click();assert.equal(w.document.querySelectorAll('.study-guide .source-citation').length,14);assert.doesNotMatch(w.document.querySelector('#response-body').textContent,/No questions returned/);}finally{reload.window.close();}
});
test('BM25 retrieval ranks the answer passage first and includes the end of a module',()=>{
 const ranked=T.retrievePassages(index,'How is the median calculated?');assert.equal(ranked[0].sourceId,'z');
 assert.deepEqual(T.retrievePassages(index,'Why do penguins migrate?'),[]);
 assert.equal(T.retrievePassages(index,'How is the arithmetic mean calculated?')[0].sourceId,'a');
 assert.ok(T.retrievePassages(index,'mean median',{limit:1}).length<=1);
});
test('unanswerable questions return a course-files message, with no invented general answer',async()=>{
 let calls=0;
 await provider(async()=>{calls++;return {ok:true,json:async()=>({output_text:JSON.stringify({supported:false,responseKind:'not_found',parts:[]})})};},async()=>{
  const result=await invoke({question:'Who invented this calculation?',sources,passages},server.proxyAiChat);assert.equal(result.body.supported,false);assert.match(result.body.message,/could not find.*course files/);assert.equal(result.body.parts.length,0);
  const empty=await invoke({question:'Who invented this calculation?',sources:[],passages:[]},server.proxyAiChat);assert.equal(empty.body.supported,false);assert.equal(calls,1);
 });
});
test('chat uses bounded history and strict output, validates evidence, and rejects unknown citations',async()=>{
 let sent;
 await provider(async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({output_text:JSON.stringify({supported:true,responseKind:'explanation',parts:[{text:'Add and divide.',evidenceId:passages[0].id}]})})};},async()=>{
  const response=await invoke({question:'How is mean calculated?',passages,sources,history:Array.from({length:9},(_,i)=>({role:i%2?'assistant':'user',content:'Turn '+i}))},server.proxyAiChat);
  assert.equal(response.body.parts[0].evidence,passages[0].text);assert.equal(sent.store,false);assert.equal(sent.text.format.type,'json_schema');assert.match(sent.instructions,/untrusted data/);assert.equal(JSON.parse(sent.input[0].content[0].text).history.length,6);
 });
 assert.throws(()=>server.validateChatReply({supported:true,responseKind:'answer',parts:[{text:'False citation',evidenceId:'bad'}]},sources,passages),/unknown source/);
});
test('hint mode refuses premature answers, quiz actions request a question, and Reveal explicitly allows an answer',async()=>{
 let sent;
 await provider(async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({output_text:JSON.stringify({supported:true,responseKind:'answer',parts:[{text:'The mean is 3.',evidenceId:passages[0].id}]})})};},async()=>{
  const body={question:'What is the mean of 2 and 4?',sources,passages,teachingMode:'hints'};
  assert.match((await invoke(body,server.proxyAiChat)).body.error,/full answer instead of a hint/);
  const revealed=await invoke({...body,reveal:true},server.proxyAiChat);assert.equal(revealed.body.parts.length,1);
  const asked=await invoke({...body,question:'Please show me the answer'},server.proxyAiChat);assert.equal(asked.body.parts.length,1);
  await invoke({...body,action:'quiz',teachingMode:'explain'},server.proxyAiChat);assert.match(sent.instructions,/Ask one evidence-grounded self-check question/);assert.match(sent.instructions,/Do not state the final answer/);
 });
});
test('module chat retrieves relevant passages, renders citations and carries recent turns',async()=>{
 const bodies=[];const dom=browser(async(url,options)=>{assert.equal(url,'/api/ai-chat');const body=JSON.parse(options.body);bodies.push(body);return {ok:true,json:async()=>reply(body.passages[0])};});
 try{const w=dom.window;mount(w);ask(w,'How is median calculated?');await until(()=>w.document.querySelector('.chat-turns .source-citation'));assert.equal(bodies[0].passages[0].sourceId,'z');ask(w,'Explain the calculation more simply');await until(()=>bodies.length===2 && w.document.querySelectorAll('.chat-turns article').length===2);assert.equal(bodies[1].history.length,2);assert.equal(bodies[1].moduleId,9);}finally{dom.window.close();}
});
test('late chat results are canceled and discarded after switching module or leaving the tab',async()=>{
 let release,signal,started;const began=new Promise(r=>started=r);
 const dom=browser(async(_url,options)=>{signal=options.signal;started();return new Promise(resolve=>release=resolve);});
 try{const w=dom.window;mount(w);ask(w,'Explain arithmetic mean');await began;w.invalidateModuleRequests();w.showResponse('New module','<p>New module stays visible</p>');assert.equal(signal.aborted,true);release({ok:true,json:async()=>reply()});await settle();await settle();assert.equal(w.document.querySelector('#response-body').textContent,'New module stays visible');mount(w);assert.equal(w.document.querySelectorAll('.chat-turns article').length,0);}finally{dom.window.close();}
});
test('removing a chat or changing teaching style aborts pending replies without adding a stale turn',async()=>{
 for(const action of ['remove','mode']){
  let release,signal;
  const dom=browser(async(_url,options)=>{signal=options.signal;return new Promise(resolve=>release=resolve);});
  try{
   const w=dom.window;mount(w);ask(w,'Explain arithmetic mean');await until(()=>release);
   if(action==='remove')w.document.querySelector('#fixture-chat').remove();
   else {const select=w.document.querySelector('[data-chat-mode]');select.value='hints';select.dispatchEvent(new w.Event('change'));}
   await until(()=>signal.aborted);release({ok:true,json:async()=>reply()});await settle();await settle();
   mount(w);assert.equal(w.document.querySelectorAll('.chat-turns article').length,0);
  }finally{dom.window.close();}
 }
});
test('every item action uses only that item evidence and keeps the original practice visible',async()=>{
 const bodies=[];const dom=browser(async(_url,options)=>{const body=JSON.parse(options.body);bodies.push(body);return {ok:true,json:async()=>({...reply(),responseKind:body.action==='quiz'?'question':'explanation'})};});
 try{
  const w=dom.window,p=passages[0],item={type:'why_how',difficulty:'easy',front:'How is mean calculated?',back:'Add and divide.',conceptId:concepts[0].id,evidenceId:p.id,evidence:p.text,sourceId:p.sourceId,source:sources[0].title,section:p.section};
  w.showResponse('Cards',w.renderPracticeSession(course,moduleInfo,{flashcards:[item],mcq:[]},'flashcards'));w.bindPracticeSessions();
  for(const action of ['explain','simplify','example','quiz']){w.document.querySelector(`[data-item-action="${action}"]`).click();await until(()=>bodies.some(b=>b.action===action) && !w.document.querySelector('[data-chat-cancel]:not([hidden])'));}
  assert.equal(bodies.length,4);for(const b of bodies){assert.equal(b.passages.length,1);assert.equal(b.passages[0].id,p.id);assert.equal(b.moduleId,9);assert.doesNotMatch(JSON.stringify(b),/token|credential/);}
  assert.ok(w.document.querySelector('[data-flip]'));
 }finally{dom.window.close();}
});
test('no key fails before model calls and obsolete module generators are deleted',async()=>{
 const old=process.env.OPENAI_API_KEY,fetch=global.fetch;process.env.OPENAI_API_KEY='';global.fetch=()=>{throw Error('Unexpected network');};
 try{assert.equal((await invoke({question:'Why?',sources,passages},server.proxyAiChat)).body.configured,false);}finally{global.fetch=fetch;if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
 const code=fs.readFileSync(path.join(root,'app.js'),'utf8');for(const name of ['analyzeModule','buildModuleMcqQuiz','renderModuleQuiz','renderModuleFlashcards','renderModuleNotes'])assert.doesNotMatch(code,new RegExp(`function ${name}\\(`));
});
test('guide and chat scripts are served by the static allowlist',async()=>{
 function request(url){return new Promise(resolve=>{const response={writeHead(status){this.status=status;},end(body){resolve({status:this.status,body:String(body)});}};server.server.listeners('request')[0]({method:'GET',url,headers:{host:'localhost:4177'}},response);});}
 for(const file of ['tutor-core.js','tutor-ui.js']){const response=await request('/'+file);assert.equal(response.status,200);assert.equal(response.body,fs.readFileSync(path.join(root,file),'utf8'));}
 assert.equal((await request('/.env')).status,403);
});

test('AI Tutor module picker → indexing → cited chat → real guide with correct progress and saved note',async()=>{
 let chatBody,guideBody,releaseGuide;
 const dom=browser(async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url==='/api/ai-index')return {ok:true,json:async()=>({concepts})};
  if(url==='/api/ai-chat'){chatBody=body;return {ok:true,json:async()=>reply()};}
  if(url==='/api/ai-tutor'){guideBody=body;return new Promise(r=>releaseGuide=r);}
  throw Error('Unexpected fixture request');
 });
 try{
  const w=dom.window,module={...moduleInfo,hydrated:true,readingSession:0,index:null,items:sources.map(s=>({id:s.id,type:'File',title:s.title,summary:s.text,readable:true}))};
  w.renderTutorTab({course,modules:[module]});w.document.querySelector('[data-open-tutor-module]').click();await until(()=>w.document.querySelector('[data-index-for-chat]'));
  assert.equal(w.document.querySelector('[data-chat-question]').disabled,true);w.document.querySelector('[data-index-for-chat]').click();await until(()=>w.document.querySelector('[data-chat-question]')?.disabled===false);
  ask(w,'How is the mean calculated?');await until(()=>w.document.querySelector('.chat-turns article'));assert.equal(chatBody.moduleId,9);
  w.document.querySelector('[data-ai-tutor-mode="study"]').click();await until(()=>guideBody);assert.equal(guideBody.mode,'study');assert.match(w.document.querySelector('#generation-progress').textContent,/study guide/);assert.doesNotMatch(w.document.querySelector('#generation-progress').textContent,/flashcards/);
  releaseGuide({ok:true,json:async()=>({guide:groundedGuide()})});await until(()=>w.document.querySelector('.study-guide'));
  assert.equal(w.document.querySelectorAll('.study-guide .source-citation').length,14);assert.doesNotMatch(w.document.querySelector('.study-guide').textContent,/No questions returned/);assert.ok(module.generated.study.result.guide);
  assert.match(w.localStorage.getItem('canvasTutor.boardNotes.v1'),/Source: Averages.txt/);
 }finally{dom.window.close();}
});
test('Cancel, an empty retrieval, and a missing AI key have visible states without false answers',async()=>{
 let calls=0,release;const dom=browser(async(url,options)=>{calls++;const body=JSON.parse(options.body);if(body.passages.length===0)return {ok:true,json:async()=>({supported:false,parts:[],responseKind:'not_found'})};return new Promise(r=>release=r);});
 try{
  const w=dom.window;mount(w);ask(w,'Why do penguins migrate?');await until(()=>w.document.querySelector('.chat-turns article'));assert.match(w.document.querySelector('.chat-turns').textContent,/could not find.*course files/);
  ask(w,'How is mean calculated?');await until(()=>release);w.document.querySelector('[data-chat-cancel]').click();await until(()=>w.document.querySelector('[data-chat-error]').textContent.includes('canceled'));assert.match(w.document.querySelector('[data-chat-question]').value,/mean/);
  release({ok:true,json:async()=>reply()});await settle();assert.equal(w.document.querySelectorAll('.chat-turns article').length,1);
  w.fetch=async url=>{assert.equal(url,'/api/ai-status');return {ok:true,json:async()=>({configured:false,model:'fixture'})};};ask(w,'Explain the mean');await until(()=>w.document.querySelector('[data-chat-error]').textContent.includes('not configured'));assert.equal(calls,2);
 }finally{dom.window.close();}
});
test('a quiz help panel does not contaminate matching answers or lose quiz progress',async()=>{
 const dom=browser(async(_url,options)=>({ok:true,json:async()=>reply(JSON.parse(options.body).passages[0])}));
 try{
  const w=dom.window,p=passages[0],item={type:'matching',difficulty:'easy',question:'Match the terms.',answer:'Sum is total; count is number.',explanation:'The mean divides sum by count.',pairs:[{term:'Sum',definition:'Total'},{term:'Count',definition:'Number'}],conceptId:concepts[0].id,evidenceId:p.id,sourceId:p.sourceId,evidence:p.text,section:p.section,source:sources[0].title};
  w.showResponse('Quiz',w.renderPracticeSession(course,moduleInfo,{mcq:[item],flashcards:[]},'mcq'));w.bindPracticeSessions();w.document.querySelector('[data-start-quiz]').click();w.document.querySelector('[data-item-action="simplify"]').click();await until(()=>w.document.querySelector('.chat-turns article'));
  w.document.querySelector('[data-match="0"]').value='Total';w.document.querySelector('[data-match="1"]').value='Number';w.document.querySelector('[data-finish]').click();await until(()=>w.document.querySelector('[data-score]'));assert.match(w.document.querySelector('[data-score]').textContent,/1 \/ 1/);assert.ok(w.document.querySelector('[data-item-action="explain"]'));
 }finally{dom.window.close();}
});
test('chat retries transient errors, supports schema fallback, and never turns bad citations into general advice',async()=>{
 let calls=0;
 await provider(async(_url,options)=>{
  calls++;if(calls===1)return {ok:false,status:503,json:async()=>({error:{message:'Unavailable fixture'}})};
  if(calls===2)return {ok:false,status:400,json:async()=>({error:{message:'json_schema not supported'}})};
  assert.equal(JSON.parse(options.body).text.format.type,'json_object');return {ok:true,json:async()=>({output_text:JSON.stringify({supported:true,responseKind:'explanation',parts:[{text:'Invented answer',evidenceId:'invented'}]})})};
 },async()=>{const result=await invoke({question:'How is mean calculated?',sources,passages},server.proxyAiChat);assert.match(result.body.error,/unknown source/);assert.equal(result.body.parts,undefined);});assert.equal(calls,3);
});
