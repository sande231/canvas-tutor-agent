const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {JSDOM}=require('jsdom');
process.env.EMAIL_DISABLED='1';
const server=require('../server');
const P=require('../practice-core');
const {buildEvidencePassages,createIndexPlan,indexedConceptId}=require('../source-index');
const root=path.join(__dirname,'..');
const source={id:'source-1',title:'Statistics.py',text:'The mean is the sum of the observations divided by their count. To calculate it, first add the values and then divide by the count. In Python, print(2 + 3) prints 5. A missing denominator is a bug when computing a mean.'};
const passage=buildEvidencePassages([source])[0];
const cite={conceptId:indexedConceptId('Mean'),evidenceId:passage.id,sourceId:source.id,section:passage.section,evidence:passage.text,source:source.title};
const base={question:'How do you calculate the mean?',answer:'Sum divided by count',explanation:'The total is divided by count. The sum alone ignores the number of observations.',difficulty:'medium',...cite};
function question(type='multiple_choice') {
 const q={...base,type};
 if(['multiple_choice','scenario','code_output','find_bug','multi_select'].includes(type))q.choices=['Sum divided by count','Sum only','Count only','Largest value'];
 if(type==='multi_select'){q.answers=['Sum divided by count','Count only'];q.answer='Sum divided by count and Count only';}
 if(type==='true_false'){q.choices=['True','False'];q.answer='True';q.question='The mean divides the sum by count.';}
 if(type==='fill_blank'){q.question='The mean is the sum divided by ___.';q.answer='count';q.acceptedAnswers=['count','number of observations'];}
 if(type==='matching'){q.pairs=[{term:'Sum',definition:'Total of observations'},{term:'Count',definition:'Number of observations'}];q.answer='Sum: total; count: number';}
 if(type==='ordering'){q.steps=['Add the values','Divide by count'];q.answer=q.steps.join(' then ');}
 if(['code_output','find_bug'].includes(type))q.code='print(2 + 3)';
 return q;
}
function card(type='why_how') {return {...cite,type,difficulty:'easy',front:type==='cloze'?'The mean divides the sum by ___.':'Why divide the sum by the count?',back:'To give the average value per observation.',...(type==='code_meaning'?{code:'print(2 + 3)'}:{})};}
function browser(fetchImpl=async()=>({ok:true,json:async()=>({configured:true,model:'fixture'})})) {
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://127.0.0.1:4177',runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.fetch=fetchImpl;
 dom.window.eval(['source-quality.js','source-index.js','practice-core.js','app.js','practice-ui.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')+'\nwindow.setTestToken = value => {canvasConnection.token=value;};');
 return dom;
}
const course={id:42,name:'Statistics'},moduleInfo={id:7,name:'Means'};
const result=(questions=[],cards=[])=>({mcq:questions,flashcards:cards,keyPoints:[],studyPlan:[]});
function show(w,items,mode='mcq',entries) {w.showResponse('Practice',w.renderPracticeSession(course,moduleInfo,items,mode,entries));w.bindPracticeSessions();}
function start(w,all=true){w.document.querySelector('[data-layout]').value=all?'all':'one';w.document.querySelector('[data-start-quiz]').click();}
const settle=()=>new Promise(r=>setTimeout(r,0));
function invoke(body,fn=server.proxyAiTutor){const req=new EventEmitter();return new Promise((resolve,reject)=>{let status;fn(req,{writeHead(s){status=s;},end(text){resolve({status,body:JSON.parse(text)});}}).catch(reject);req.emit('data',JSON.stringify(body));req.emit('end');});}
async function provider(mock,run){const old=global.fetch,key=process.env.OPENAI_API_KEY;global.fetch=mock;process.env.OPENAI_API_KEY='fixture-key';try{return await run();}finally{global.fetch=old;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}}

for(const type of Object.keys(P.questionTypes))test(`server and browser accept ${type} and reject malformed ${type}`,()=>{
 const q=question(type),dom=browser();
 try {
  const parsed=server.parseAiTutorJson(JSON.stringify(result([q])));assert.equal(parsed.mcq.length,1);assert.equal(parsed.mcq[0].type,type);assert.equal(parsed.mcq[0].difficulty,'medium');
  dom.window.assertAiPracticeResult(result([q]),'mcq');
  const broken={...q};
  if(type==='short_answer')broken.answer='';
  else if(type==='multi_select')broken.answers=['invented'];
  else if(type==='matching')broken.pairs=[{term:'Sum',definition:'total'},{term:'Sum',definition:'total'}];
  else if(type==='ordering')broken.steps=['Add','Add'];
  else if(type==='fill_blank')broken.acceptedAnswers=['wrong'];
  else if(['code_output','find_bug'].includes(type))broken.code='';
  else if(type==='true_false')broken.choices=['Yes','No'];
  else broken.choices=['one','two','three'];
  assert.equal(server.parseAiTutorJson(JSON.stringify(result([broken]))).mcq.length,0);
  assert.throws(()=>dom.window.assertAiPracticeResult(result([broken]),'mcq'),/valid source-grounded/);
  assert.equal(P.normalizeItem({...q,difficulty:'invented'}),null);
 }finally{dom.window.close();}
});
for(const type of Object.keys(P.cardTypes))test(`server and browser validate ${type} cards`,()=>{
 const c=card(type),dom=browser();try{
  assert.equal(server.parseAiTutorJson(JSON.stringify(result([],[c]))).flashcards[0].type,type);
  dom.window.assertAiPracticeResult(result([],[c]),'flashcards');
  const bad={...c,back:''};assert.equal(server.parseAiTutorJson(JSON.stringify(result([],[bad]))).flashcards.length,0);assert.throws(()=>dom.window.assertAiPracticeResult(result([],[bad]),'flashcards'));
  if(type==='cloze')assert.equal(P.normalizeItem({...c,front:'No gap'},true),null);
  if(type==='code_meaning')assert.equal(P.normalizeItem({...c,code:''},true),null);
 }finally{dom.window.close();}
});
test('legacy MCQ/card shapes migrate explicitly; unknown types and catch-all choices are rejected',()=>{
 const q=question();delete q.type;delete q.difficulty;
 assert.equal(P.normalizeItem(q),null);assert.equal(server.parseAiTutorJson(JSON.stringify(result([q]))).mcq[0].type,'multiple_choice');
 assert.equal(P.normalizeItem({...question(),type:'invented'}),null);
 assert.equal(P.normalizeItem({...question(),choices:['Sum divided by count','one','two','All of the above']}),null);
});
test('quality prompts, typed strict schema, requested mix and source-based code gate reach Responses API',async()=>{
 let sent;
 await provider(async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({output_text:JSON.stringify(result([question('code_output')]))})};},async()=>{
  const response=await invoke({sources:[source],mode:'mcq',questionTypes:['code_output'],count:1});assert.equal(response.body.mcq.length,1);
  assert.equal(sent.text.format.type,'json_schema');
  assert.equal(sent.text.format.schema.properties.mcq.items.anyOf.length,10);
  assert.match(sent.instructions,/plausible and similar in length/);assert.match(sent.instructions,/most tempting wrong/);
  assert.match(sent.input[0].content[0].text,/Requested question types: code_output/);
  const blocked=await invoke({sources:[{...source,title:'reading.txt',text:'The mean is the total of the observations divided by their count. It summarizes the central tendency of numeric observations.'}],mode:'mcq',questionTypes:['code_output']});assert.equal(blocked.status,400);
 });
});
test('every deterministic type scores correctly and short answers require model grading',()=>{
 for(const type of Object.keys(P.questionTypes)) {
  const q=question(type);const a=type==='multi_select'?q.answers:type==='matching'?q.pairs.map(p=>p.definition):type==='ordering'?q.steps:q.answer;
  assert.equal(P.scoreAnswer(q,a),type==='short_answer'?null:true,type);
  if(type!=='short_answer')assert.equal(P.scoreAnswer(q,''),false,type);
 }
 assert.equal(P.scoreAnswer(question('multi_select'),['Count only','Sum divided by count','Sum only']),false);
 assert.equal(P.scoreAnswer(question('fill_blank'),' COUNT '),true);
 const items=[question(),question('matching'),question('ordering')],marks=[{correct:true},{correct:false},null];
 assert.deepEqual(P.quizScore(marks),{correct:1,total:3,pending:1,percent:33,missed:[1]});assert.deepEqual(P.retryMissed(items,marks),[items[1]]);
});
test('quiz all-page mode scores, reviews sources, retries only missed and retains the original saved set',async()=>{
 const dom=browser(),w=dom.window,questions=[question(),{...question('true_false'),conceptId:'concept:tf'}];
 try{
  w.saveGeneratedPractice(course,moduleInfo,'mcq',result(questions));show(w,result(questions));start(w);
  const fields=w.document.querySelectorAll('[data-practice-question]');
  [...fields[0].querySelectorAll('input')].find(el=>el.value===questions[0].answer).click();
  [...fields[1].querySelectorAll('input')].find(el=>el.value==='False').click();
  w.document.querySelector('[data-finish]').click();await settle();
  assert.match(w.document.querySelector('[data-score]').textContent,/1 \/ 2 \(50%\)/);
  assert.equal(w.document.querySelectorAll('.mistake-card').length,1);assert.ok(w.document.querySelector('.mistake-card .source-citation'));
  w.document.querySelector('[data-missed]').click();start(w);assert.equal(w.document.querySelectorAll('[data-practice-question]').length,1);
  assert.equal(w.practiceRead(course.id,moduleInfo.id).sets.mcq.result.mcq.length,2);
  w.document.querySelector('input[value="True"]').click();w.document.querySelector('[data-finish]').click();await settle();assert.match(w.document.querySelector('[data-score]').textContent,/1 \/ 1/);
 }finally{w.close();}
});
test('one-at-a-time navigation saves responses and reload restores quiz progress and sets without credentials',()=>{
 const dom=browser(),w=dom.window,questions=[question(),question('true_false')];let saved;
 try{
  w.setTestToken("DO_NOT_PERSIST_CANVAS");
  w.saveGeneratedPractice({...course,token:'DO_NOT_PERSIST_COURSE'}, {...moduleInfo,token:'DO_NOT_PERSIST_MODULE'},'mcq',{...result(questions),token:'DO_NOT_PERSIST_RESULT'});
  show(w,result(questions));start(w,false);
  assert.equal(w.document.querySelectorAll('[data-practice-question]').length,1);
  w.document.querySelector('[data-practice-question] input').click();w.document.querySelector('[data-next]').click();
  saved=w.localStorage.getItem(P.storageKey(course.id,moduleInfo.id));assert.doesNotMatch(saved,/DO_NOT_PERSIST|token|authorization/i);
 }finally{w.close();}
 const reloaded=browser();try{
  const x=reloaded.window;x.localStorage.setItem(P.storageKey(course.id,moduleInfo.id),saved);
  const module={...moduleInfo};x.restoreGeneratedPractice(course,module);assert.equal(module.generated.mcq.result.mcq.length,2);
  show(x,module.generated.mcq.result);assert.match(x.document.querySelector('[data-practice-question]').textContent,/The mean divides/);
  x.document.querySelector('[data-prev]').click();assert.ok(x.document.querySelector('input:checked'));
 }finally{reloaded.window.close();}
});
test('Leitner movement uses 1, 3, 7, 14, 30 days, resets misses, and is scoped by course/module',()=>{
 const now=1000;let box;
 for(const days of [1,3,7,14,30]){box=P.moveBox(box,true,now);assert.equal(box.due,now+days*86400000);}
 assert.equal(P.moveBox(box,true,now).box,5);assert.deepEqual(P.moveBox(box,false,now),{box:1,due:now,reviewed:now});
 assert.notEqual(P.storageKey(1,2),P.storageKey(2,2));assert.notEqual(P.storageKey(1,2),P.storageKey(1,3));
});
test('card flip keyboard, missed-card return, due count, export and reload review state',()=>{
 const dom=browser(),w=dom.window,c=card();let saved;
 try{
  w.saveGeneratedPractice(course,moduleInfo,'flashcards',result([],[c]));show(w,result([],[c]),'flashcards');
  const flip=w.document.querySelector('[data-flip]');flip.dispatchEvent(new w.KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
  assert.equal(w.document.querySelector('[data-flip]').getAttribute('aria-pressed'),'true');
  w.document.querySelector('[data-flip]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'1',bubbles:true}));assert.ok(w.document.querySelector('[data-flip]'));
  w.document.querySelector('[data-flip]').click();w.document.querySelector('[data-flip]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'2',bubbles:true}));
  assert.match(w.document.querySelector('.practice-session').textContent,/0 due today/);assert.match(w.document.querySelector('.practice-session').textContent,/Review complete/);
  saved=w.localStorage.getItem(P.storageKey(course.id,moduleInfo.id));
  const csv=P.csv([{...c,front:'=formula,"quoted"\nnext line'}]);assert.match(csv,/"'=formula,""quoted""/);assert.match(csv,/Source/);assert.match(csv,/Statistics.py/);
 }finally{w.close();}
 const dom2=browser();try{dom2.window.localStorage.setItem(P.storageKey(course.id,moduleInfo.id),saved);show(dom2.window,result([],[c]),'flashcards');assert.match(dom2.window.document.querySelector('.practice-session').textContent,/0 due today/);}finally{dom2.window.close();}
});
test('corrupt, quota-full, or blocked storage does not break review; saved objects use explicit allowlists',()=>{
 const memory=new Map(),storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
 memory.set(P.storageKey(1,2),'not JSON');assert.deepEqual(P.readSaved(storage,1,2).sets,{});
 const item={...question(),token:'secret',authorization:'secret',credentials:{key:'secret'}};
 assert.equal(P.writeSaved(storage,1,2,{token:'secret',sets:{mcq:{at:1,result:result([item])}},boxes:{},concepts:{}}),true);
 assert.doesNotMatch(memory.get(P.storageKey(1,2)),/secret|token|authorization|credentials/);
 assert.equal(P.writeSaved({setItem(){throw Error('quota');}},1,2,{}),false);
 const dom=browser();try{
  Object.defineProperty(dom.window,'localStorage',{get(){throw Error('blocked');}});
  assert.doesNotThrow(()=>dom.window.saveGeneratedPractice(course,moduleInfo,'flashcards',result([],[card()])));
  show(dom.window,result([],[card()]),'flashcards');assert.match(dom.window.document.querySelector('[data-practice-storage]').textContent,/blocked or full/);
 }finally{dom.window.close();}
});
test('short-answer grading calls Responses with evidence, rejects invented citations, and returns visible feedback',async()=>{
 const q=question('short_answer');let request,calls=0;
 await provider(async(_url,options)=>{calls++;request=JSON.parse(options.body);return {ok:true,json:async()=>({output_text:JSON.stringify({correct:true,feedback:'You correctly divide the total by the number of observations.',evidenceId:passage.id})})};},async()=>{
  const body={question:q,answer:'Divide the total by the number of observations.',sources:[source],passages:[passage]};
  const valid=await invoke(body,server.proxyGradeAnswer);assert.equal(valid.body.correct,true);assert.equal(valid.body.evidence,passage.text);assert.match(request.instructions,/untrusted/);
  const invalid=await invoke({...body,question:{...q,evidenceId:'invented'}},server.proxyGradeAnswer);assert.equal(invalid.status,400);assert.equal(calls,1);
 });
});
test('short-answer UI grades saved answers, keeps failed grades pending, and prevents stale results',async()=>{
 let release;const dom=browser(async(url,options)=>{
  assert.equal(url,'/api/ai-grade');const body=JSON.parse(options.body);assert.equal(body.question.type,'short_answer');assert.equal(body.passages[0].id,passage.id);
  return new Promise(resolve=>release=resolve);
 }),w=dom.window;
 try{
  show(w,result([question('short_answer')]));start(w);const input=w.document.querySelector('textarea');input.value='Total divided by count';input.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('[data-finish]').click();await settle();
  release({ok:true,json:async()=>({error:'Provider unavailable; retry grading.'})});await settle();await settle();
  assert.match(w.document.querySelector('.practice-session').textContent,/Provider unavailable/);assert.match(w.document.querySelector('.practice-session').textContent,/provisional/);assert.deepEqual(Object.keys(w.practiceRead(course.id,moduleInfo.id).concepts),[]);
  w.document.querySelector('[data-retry-grade]').click();await settle();
  w.invalidateModuleRequests();w.showResponse('Another module','<p>Unchanged</p>');
  release({ok:true,json:async()=>({correct:true,feedback:'Correct calculation.',evidenceId:passage.id})});await settle();await settle();assert.equal(w.document.querySelector('#response-body').textContent,'Unchanged');assert.deepEqual(Object.keys(w.practiceRead(course.id,moduleInfo.id).concepts),[]);
 }finally{w.close();}
});
test('code controls appear only with code, options persist the mix, and weak concepts get generation priority',()=>{
 const dom=browser(),w=dom.window;try{
  w.showResponse('Options',w.renderAiOptions());w.bindAiOptions();assert.ok([...w.document.querySelectorAll('[data-code-option]')].every(el=>el.hidden));
  w.bindAiOptions(w.document.querySelector('#response-body'),{items:[source]});assert.ok([...w.document.querySelectorAll('[data-code-option]')].every(el=>!el.hidden));
  w.document.querySelector('[data-question-type][value="matching"]').click();assert.ok(w.readAiOptions().questionTypes.includes('matching'));
  const plan=createIndexPlan([source]),concepts=[{id:'a',name:'A',importance:3,evidenceIds:[passage.id]},{id:'z',name:'Z',importance:1,evidenceIds:[passage.id]}];
  w.practiceResult(course.id,moduleInfo.id,{...question(),conceptId:'z'},false);
  const selected=w.preferredPracticeConcepts({courseId:course.id,moduleId:moduleInfo.id,count:1,index:{plan,concepts}});assert.equal(selected[0].id,'z');assert.equal(selected[0].importance,1);
  assert.match(w.courseWeakSpots(course,[moduleInfo]),/Practise my weak spots/);
 }finally{w.close();}
});
test('exam mode mixes selected modules and attributes results to their original module',async()=>{
 const dom=browser(),w=dom.window;try{
  const modules=[{id:1,name:'First',generated:{mcq:{result:result([question()])}}},{id:2,name:'Second',generated:{mcq:{result:result([question('true_false')])}}}];
  w.showResponse('Exam',w.renderExamPicker(course,modules));w.bindExamPicker(course,modules);
  w.document.querySelectorAll('[data-exam-module]').forEach(el=>el.click());w.document.querySelector('[data-start-exam]').click();start(w);
  assert.equal(w.document.querySelectorAll('[data-practice-question]').length,2);w.document.querySelector('[data-finish]').click();await settle();
  assert.equal(w.practiceRead(course.id,1).concepts[cite.conceptId].wrong,1);assert.equal(w.practiceRead(course.id,2).concepts[cite.conceptId].wrong,1);
  assert.equal(w.practiceRead(course.id,'exam-1-2').examModules.length,2);
 }finally{w.close();}
});
test('timer expiry finishes a quiz and preserves answered work',async()=>{
 const dom=browser(),w=dom.window;try{
  show(w,result([question()]));w.document.querySelector('[data-minutes]').value='1';w.document.querySelector('[data-start-quiz]').click();
  const saved=w.practiceRead(course.id,moduleInfo.id);saved.drafts.mcq.deadline=Date.now()-1;w.practiceWrite(course.id,moduleInfo.id,saved);
  show(w,result([question()]));await new Promise(r=>setTimeout(r,1100));assert.match(w.document.querySelector('[data-score]').textContent,/0 \/ 1/);
 }finally{w.close();}
});

test('non-array choices, inherited type names and corrupted saved records are discarded safely',()=>{
 for(const choices of ['wrong',{},null,1])assert.doesNotThrow(()=>assert.equal(server.parseAiTutorJson(JSON.stringify(result([{...question(),choices}]))).mcq.length,0));
 for(const type of ['constructor','toString','__proto__'])assert.equal(P.normalizeItem({...question(),type}),null);
 assert.deepEqual(P.normalizeSaved({sets:{mcq:{at:1,result:{mcq:[{...question(),choices:'wrong'}]}}},boxes:{a:{box:99,due:1}},concepts:{b:{label:'mean',correct:-1,wrong:0}}}).sets,{});
});
test('retry-only-missed progress restores after refresh without replacing the full quiz',async()=>{
 const dom=browser(),w=dom.window;let saved;
 try{
  const questions=[question(),question('true_false')];w.saveGeneratedPractice(course,moduleInfo,'mcq',result(questions));show(w,result(questions));start(w);
  const fields=w.document.querySelectorAll('[data-practice-question]');[...fields[0].querySelectorAll('input')].find(el=>el.value===questions[0].answer).click();w.document.querySelector('[data-finish]').click();await settle();w.document.querySelector('[data-missed]').click();start(w);
  saved=w.localStorage.getItem(P.storageKey(course.id,moduleInfo.id));
 }finally{w.close();}
 const reload=browser();try{
  const x=reload.window;x.localStorage.setItem(P.storageKey(course.id,moduleInfo.id),saved);const record=x.practiceRead(course.id,moduleInfo.id);assert.equal(record.sets.mcq.result.mcq.length,2);show(x,record.sets.mcq.result);assert.equal(x.document.querySelectorAll('[data-practice-question]').length,1);assert.match(x.document.querySelector('[data-practice-question]').textContent,/The mean divides/);
 }finally{reload.window.close();}
});
test('successful short-answer feedback scores once and Cancel keeps the answer without a false failure',async()=>{
 const dom=browser(async()=>({ok:true,json:async()=>({correct:true,feedback:'Correct: you divide total by count.',evidenceId:passage.id})})),w=dom.window;
 try{
  w.saveGeneratedPractice(course,moduleInfo,'mcq',result([question('short_answer')]));show(w,result([question('short_answer')]));start(w);const input=w.document.querySelector('[data-answer]');input.value='Total / count';input.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('[data-finish]').click();await settle();await settle();
  assert.match(w.document.querySelector('[data-score]').textContent,/1 \/ 1/);assert.match(w.document.querySelector('.practice-session').textContent,/Correct: you divide/);
  assert.equal(w.practiceRead(course.id,moduleInfo.id).concepts[cite.conceptId].correct,1);
  let release;w.fetch=()=>new Promise(r=>release=r);w.document.querySelector('[data-restart]').click();start(w);w.document.querySelector('[data-answer]').value='Total / count';w.document.querySelector('[data-finish]').click();await settle();w.document.querySelector('[data-cancel-grade]').click();await settle();await settle();
  assert.match(w.document.querySelector('.practice-session').textContent,/awaiting AI grading/);assert.equal(w.practiceRead(course.id,moduleInfo.id).drafts.mcq.responses[0],'Total / count');assert.equal(w.practiceRead(course.id,moduleInfo.id).concepts[cite.conceptId].correct,1);
  release({ok:true,json:async()=>({correct:false,feedback:'Late result',evidenceId:passage.id})});
 }finally{w.close();}
});
test('Saved practice navigation is available offline and opens an exam with original module attribution',()=>{
 const dom=browser(),w=dom.window;try{
  const exam={id:'exam-1-2',name:'Mixed exam'};w.saveGeneratedPractice(course,exam,'mcq',result([question(),question('true_false')]));const saved=w.practiceRead(course.id,exam.id);saved.examModules=['1','2'];w.practiceWrite(course.id,exam.id,saved);
  w.showSavedPractice();assert.match(w.document.querySelector('#response-body').textContent,/Mixed exam/);w.document.querySelector('[data-open-saved]').click();start(w);assert.equal(w.document.querySelectorAll('[data-practice-question]').length,2);
 }finally{w.close();}
});

test('all ten question types render usable inputs and finish with a score and cited review',async()=>{
 const dom=browser(async()=>({ok:true,json:async()=>({correct:true,feedback:'Supported by the cited passage.',evidenceId:passage.id})})),w=dom.window;
 try{
  const questions=Object.keys(P.questionTypes).map((type,i)=>({...question(type),conceptId:'concept:'+i}));show(w,result(questions));start(w);
  w.document.querySelectorAll('[data-practice-question]').forEach((field,i)=>{
    const q=questions[i];
    if(q.choices)field.querySelectorAll('input').forEach(el=>{if((q.answers || [q.answer]).includes(el.value))el.click();});
    else if(q.pairs || q.steps)field.querySelectorAll('select').forEach((el,j)=>{el.value=q.pairs?q.pairs[j].definition:q.steps[j];el.dispatchEvent(new w.Event('change',{bubbles:true}));});
    else {const input=field.querySelector('[data-answer]');input.value=q.answer;input.dispatchEvent(new w.Event('input',{bubbles:true}));}
  });
  w.document.querySelector('[data-finish]').click();await settle();await settle();
  assert.match(w.document.querySelector('[data-score]').textContent,/10 \/ 10 \(100%\)/);assert.equal(w.document.querySelectorAll('.practice-session .source-citation').length,10);
 }finally{w.close();}
});
test('short-answer provider failure retries once; unsupported schema falls back with validation',async()=>{
 let calls=0;
 await provider(async(_url,options)=>{
  calls++;if(calls===1)return {ok:false,status:429,json:async()=>({error:{message:'Rate limited fixture'}})};
  if(calls===2)return {ok:false,status:400,json:async()=>({error:{message:'json_schema is not supported for this fixture model'}})};
  assert.equal(JSON.parse(options.body).text.format.type,'json_object');return {ok:true,json:async()=>({output_text:JSON.stringify({correct:true,feedback:'Correct total / count.',evidenceId:'invented'})})};
 },async()=>{const response=await invoke({question:question('short_answer'),answer:'total / count',sources:[source],passages:[passage]},server.proxyGradeAnswer);assert.match(response.body.error,/invalid grading evidence/);assert.equal(response.body.correct,undefined);});assert.equal(calls,3);
});
test('new browser scripts are served by the static allowlist without exposing private files',async()=>{
 function request(url){return new Promise(resolve=>{let status,body='';const response=new EventEmitter();response.writeHead=s=>{status=s;};response.write=chunk=>{body+=chunk;};response.end=chunk=>resolve({status,body:body+(chunk || '')});server.server.emit('request',{method:'GET',url,headers:{host:'localhost:4177'}},response);});}
 for(const file of ['practice-core.js','practice-ui.js']){const response=await request('/'+file);assert.equal(response.status,200);assert.equal(response.body,fs.readFileSync(path.join(root,file),'utf8'));}
 assert.equal((await request('/.env')).status,403);
});
