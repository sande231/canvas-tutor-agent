const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const shared = require('../source-index');

test('passage IDs match browser and Node, survive source reordering, and change with evidence',()=>{
 const browser={};vm.createContext(browser);vm.runInContext(fs.readFileSync(path.join(__dirname,'../source-index.js'),'utf8'),browser);
 const sources=[{id:'file/7',title:'Notes',text:'Section: End of chapter\nA confidence interval expresses uncertainty in an estimate from a sample.'},{id:'other',text:'A median is the middle observation after sorting the values.'}];
 const passages=shared.buildEvidencePassages(sources);
 assert.deepEqual(JSON.parse(JSON.stringify(browser.buildEvidencePassages(sources))),passages);
 assert.equal(shared.buildEvidencePassages([...sources].reverse())[1].id,passages[0].id);
 assert.notEqual(shared.buildEvidencePassages([{...sources[0],text:sources[0].text+' Changed.'}])[0].id,passages[0].id);
});

process.env.EMAIL_DISABLED='1';
const server=require('../server');
const {EventEmitter}=require('node:events');
const {JSDOM}=require('jsdom');
const {createHash}=require('node:crypto');
const {fixtureConcepts}=require('./helpers/index-fixture');
const root=path.join(__dirname,'..');
const fact='A confidence interval expresses uncertainty in an estimate based on observed sample measurements.';
function sources(count=3) {
 return Array.from({length:count},(_,i)=>({id:`source-${i+1}`,title:`Lesson ${i+1}`,text:Array.from({length:35},(_,n)=>`Section ${n+1}:\n${fact} ${'Observed sample measurements help compare populations. '.repeat(8)}`).join('\n')+(i===count-1?'\nSection: Final important fact\nStratified sampling preserves small population groups by sampling within each group.':'')}));
}
function newIndex(sourceList,mode='full') {
 const plan=shared.createIndexPlan(sourceList,mode);
 return {plan,parts:plan.batches.map(()=>({status:'pending',concepts:[]})),concepts:[]};
}
function browser(handler) {
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://127.0.0.1:4177',runScripts:'outside-only'});
 dom.window.fetch=async(url,options)=>{
  if(url==='/api/ai-status')return {ok:true,json:async()=>({configured:true,model:'fixture'})};
  return {ok:true,json:async()=>handler(url,JSON.parse(options?.body||'{}'))};
 };
 dom.window.eval(['source-quality.js','source-index.js','tutor-core.js','practice-core.js','app.js','practice-ui.js','tutor-ui.js'].map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('\n'));
 return dom;
}
function invoke(body,indexing=false) {
 const req=new EventEmitter();return new Promise((resolve,reject)=>{
  server.proxyAiTutor(req,{writeHead(status){this.status=status;},end(text){resolve({status:this.status,...JSON.parse(text)});}}, {indexing}).catch(reject);
  req.emit('data',JSON.stringify(body));req.emit('end');
 });
}
async function provider(handler,run) {
 const old=global.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture';global.fetch=handler;
 try {return await run();} finally {global.fetch=old;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
}
function complete(output) {return {ok:true,json:async()=>({status:'completed',output_text:JSON.stringify(output)})};}

test('shared fingerprint is SHA-256, full batches include all passages, quick samples every source including ends',()=>{
 for(const text of ['',fact,'Unicode café 🌿','a'.repeat(5000)])assert.equal(shared.sourceFingerprint(text),createHash('sha256').update(text).digest('hex'));
 const all=sources(),full=shared.createIndexPlan(all),quick=shared.createIndexPlan(all,'quick');
 assert.ok(full.batches.length>1);
 assert.deepEqual(full.batches.flat(),shared.buildEvidencePassages(all));
 assert.ok(full.batches.every(part=>part.reduce((n,p)=>n+p.text.length,0)<=20000));
 assert.equal(quick.selectedPassages,9);assert.equal(quick.totalPassages,full.totalPassages);
 assert.ok(quick.batches.flat().some(p=>p.text.includes('Stratified sampling')));
 assert.equal(new Set(quick.batches.flat().map(p=>p.sourceId)).size,3);
});

test('index validation drops unknown evidence, altered passages and invalid kinds using grounding rules',async()=>{
 const sourceList=sources(1),passages=shared.buildEvidencePassages(sourceList).slice(0,2),concept=fixtureConcepts(passages)[0];
 assert.equal(server.validateIndexedConcepts([concept],sourceList,passages).length,1);
 for(const bad of [{...concept,evidenceIds:['invented']},{...concept,evidenceIds:[passages[0].id,'invented']},{...concept,importance:9},{...concept,kind:'advice'}])assert.equal(server.validateIndexedConcepts([bad],sourceList,passages).length,0);
 assert.throws(()=>server.validatedPassageBundle({sources:sourceList,passages:[{...passages[0],text:'An invented passage that replaced the original text.'}]}),/changed source passage/);
 assert.throws(()=>server.validatedPassageBundle({sources:[{id:'wrong'}],passages}),/Invalid/);
 await provider(async(url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.text.format.name,'module_concepts');assert.equal(body.text.format.strict,true);
  assert.match(body.input[0].content[0].text,/every supplied passage/);assert.match(body.instructions,/untrusted/);
  return complete({concepts:[concept,{...concept,name:'Unsupported',evidenceIds:['unknown']}]});
 },async()=>{
  const result=await invoke({sources:sourceList,passages},true);assert.equal(result.concepts.length,1);assert.equal(result.concepts[0].id,concept.id);
 });
});

test('failed indexing part keeps other parts and a targeted retry merges evidence without redoing successes',async()=>{
 const sourceList=sources(),module={index:newIndex(sourceList)};let fail=true;const calls=[];
 const dom=browser((url,body)=>{
  assert.equal(url,'/api/ai-index');const id=body.passages[0].id;calls.push(id);
  if(fail && id===module.index.plan.batches[1][0].id)return {error:'Fixture indexing failure'};
  return {concepts:[{...fixtureConcepts(body.passages)[0],name:calls.length%2?'Uncertainty':' uncertainty! ',importance:calls.length%2?1:3}]};
 });
 try {
  const progress=[];await dom.window.indexModuleBatches(module,{onProgress:(n,total)=>progress.push([n,total])});
  assert.equal(module.index.parts[1].status,'failed');assert.ok(module.index.parts.filter(p=>p.status==='complete').length>=2);
  assert.equal(module.index.concepts.length,1);assert.ok(module.index.concepts[0].evidenceIds.length>=2);
  const firstEvidence=[...module.index.concepts[0].evidenceIds];const previous=calls.length;fail=false;
  await dom.window.indexModuleBatches(module,{retryPart:1});assert.equal(calls.length,previous+1);
  assert.equal(module.index.parts[1].status,'complete');assert.ok(firstEvidence.every(id=>module.index.concepts[0].evidenceIds.includes(id)));
  assert.equal(module.index.concepts[0].importance,3);assert.equal(progress.length,module.index.parts.length);
  module.index.parts[1].status='failed';module.index.parts[1].error='Fixture indexing failure';
  const report=dom.window.renderModuleIndex(module.index);assert.match(report,/data-retry-index="1"/);assert.match(report,/Fixture indexing failure/);
 } finally {dom.window.close();}
});

test('Cancel preserves indexed parts; late indexing output cannot overwrite a newly selected module',async()=>{
 const module={index:newIndex(sources())};let started,release;
 const waiting=new Promise(resolve=>started=resolve);let calls=0;
 const dom=browser((url,body)=>{
  if(++calls===2){started();return new Promise(resolve=>release=()=>resolve({concepts:fixtureConcepts(body.passages)}));}
  return {concepts:fixtureConcepts(body.passages)};
 });
 try {
  const controller=new dom.window.AbortController();
  const pending=dom.window.indexModuleBatches(module,{signal:controller.signal});await waiting;controller.abort();await pending;
  assert.equal(module.index.parts[0].status,'complete');assert.equal(module.index.parts[1].status,'pending');assert.equal(calls,2);
  const count=module.index.concepts.length;release();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(module.index.concepts.length,count);
 } finally {dom.window.close();}
 let start,finish;const blocked=new Promise(resolve=>start=resolve);
 const second=browser((url,body)=>{
  if(url==='/api/ai-index'){start();return new Promise(resolve=>finish=()=>resolve({concepts:fixtureConcepts(body.passages)}));}
  if(body.path?.includes('/items?'))return body.path.includes('page=1')?[{id:1,type:'Page',title:'Lesson',page_url:'one'}]:[];
  return {body:fact};
 });
 try {
  const pending=second.window.runAiTutor({id:1,name:'Old course'},{id:1,name:'Old module',items:[]},'flashcards');await blocked;
  second.window.invalidateModuleRequests();second.window.showResponse('New module','New material');finish();await pending;
  assert.equal(second.window.document.querySelector('#response-title').textContent,'New module');
 } finally {second.window.close();}
});

test('last passage of last source reaches indexing and produces a concept-cited question; coverage is exact',async()=>{
 const sourceList=sources(),module={index:newIndex(sourceList)};let indexCalls=0,wire;
 const dom=browser(async(url,body)=>{
  if(url==='/api/ai-index'){
   indexCalls++;
   const concepts=[];
   for(const source of body.sources){
    const rows=body.passages.filter(p=>p.sourceId===source.id);
    const tail=rows.find(p=>p.text.includes('Stratified sampling'));
    const p=tail || rows[0];
    concepts.push({name:tail?'Stratified sampling':`Uncertainty ${source.id}`,explanation:tail?'Stratified sampling preserves small population groups.':fact,importance:tail?3:1,kind:'definition',evidenceIds:[p.id]});
   }
   return {concepts};
  }
  wire=body;return invoke(body);
 });
 try {
  await dom.window.indexModuleBatches(module);
  assert.equal(indexCalls,module.index.plan.batches.length);
  await provider(async(url,options)=>{
   const body=JSON.parse(options.body),prompt=body.input[0].content[0].text;
   assert.match(prompt,/Stratified sampling preserves/);
   const concepts=wire.concepts;
   return complete({summary:'',keyPoints:[],flashcards:[],studyPlan:[],mcq:concepts.map(c=>({conceptId:c.id,evidenceId:c.evidenceIds[0],question:`How does ${c.name} help analysis?`,choices:[c.explanation,'By changing file names.','By hiding measurements.','By ignoring the sample.'],answer:c.explanation,explanation:c.explanation}))});
  },async()=>{
   const result=await dom.window.generateAiBatches({mode:'mcq',count:3,difficulty:'mixed',index:module.index});
   assert.equal(result.mcq.length,3);assert.equal(wire.concepts.length,3);assert.ok(wire.sources.every(s=>!s.text));
   const last=result.mcq.find(q=>q.question.includes('Stratified sampling'));assert.ok(last);assert.equal(last.sourceId,'source-3');assert.match(last.evidence,/Stratified sampling/);
   assert.deepEqual(JSON.parse(JSON.stringify(result.coverage)),{items:3,sourcesUsed:3,totalSources:3,conceptsAvailable:4,partsIndexed:module.index.parts.length,totalParts:module.index.parts.length,mode:'full',selectedPassages:module.index.plan.selectedPassages,totalPassages:module.index.plan.totalPassages});
   assert.match(dom.window.renderAiTutorResult({name:'Course'},{name:'Module'},result,'mcq'),/3 questions from 3 of 3 readable sources. 4 concepts available/);
  });
 } finally {dom.window.close();}
});

test('selection gives every source a turn, then uses size weighting and importance; coverage counts actual results',()=>{
 const sourceList=[{id:'large',title:'Large',text:fact.repeat(20)},{id:'small',title:'Small',text:fact}];
 const index=newIndex(sourceList);const passages=index.plan.batches.flat();
 index.parts.forEach(p=>p.status='complete');
 index.concepts=['large','small'].flatMap(id=>Array.from({length:10},(_,i)=>({id:`${id}-${i}`,name:`${id} concept ${i}`,importance:i===9?3:1,evidenceIds:[passages.find(p=>p.sourceId===id).id]})));
 const selected=shared.selectIndexedConcepts(index,10);
 assert.equal(selected[0].id,'large-9');assert.equal(selected[1].id,'small-9');assert.equal(selected.filter(c=>c.sourceId==='large').length,9);
 const coverage=shared.indexedGenerationCoverage(index,[{conceptId:'large-9',sourceId:'large'},{conceptId:'large-1',sourceId:'large'}]);
 assert.equal(coverage.sourcesUsed,1);assert.equal(coverage.totalSources,2);assert.equal(coverage.items,2);assert.equal(coverage.conceptsAvailable,20);
});

test('large module offers Full by default and shows call counts before making an indexing request',async()=>{
 let indexCalls=0;
 const sourceList=sources(1);
 const dom=browser((url,body)=>{
  if(url==='/api/ai-index'){indexCalls++;return {concepts:fixtureConcepts(body.passages)};}
  if(body.path?.includes('/items?'))return body.path.includes('page=1')?[{id:1,type:'File',content_id:1,title:'Large file'}]:[];
  if(url==='/api/canvas-file-text')return {readable:true,text:sourceList[0].text,title:'Large file'};
  return {flashcards:[],mcq:[],keyPoints:[]};
 });
 try {
  const module={id:2,name:'Large module',items:[]};await dom.window.runAiTutor({id:1,name:'Course'},module,'mcq');
  const w=dom.window;
  assert.equal(indexCalls,0);assert.equal(w.document.querySelector('[name="index-mode"]:checked').value,'full');
  assert.match(w.document.querySelector('#response-body').textContent,/Full \(every page\).*AI calls/);
  assert.match(w.document.querySelector('#response-body').textContent,/Quick \(a sample of each file\)/);
  w.document.querySelector('[name="index-mode"][value="quick"]').click();w.document.querySelector('[data-start-index]').click();
  for(let i=0;i<100&&!module.index?.parts.every(p=>p.status==='complete');i++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(module.index.plan.mode,'quick');assert.equal(indexCalls,module.index.plan.batches.length);
 } finally {dom.window.close();}
});

test('indexed generation rejects invented concept IDs and evidence belonging to another concept',async()=>{
 const sourceList=sources(1),passages=shared.buildEvidencePassages(sourceList).slice(0,2);
 const concepts=fixtureConcepts(passages);
 const card={front:'Why express uncertainty?',back:fact,conceptId:concepts[0].id,evidenceId:passages[0].id};
 await provider(async()=>complete({summary:'',keyPoints:[],studyPlan:[],mcq:[],flashcards:[card,{...card,front:'Invented concept?',conceptId:'invented'},{...card,front:'Cross-concept evidence?',evidenceId:passages[1].id}]}),async()=>{
  const result=await invoke({mode:'flashcards',count:3,sources:sourceList,passages,concepts});
  assert.equal(result.flashcards.length,1);assert.equal(result.flashcards[0].conceptId,concepts[0].id);
  assert.equal(result.flashcards[0].evidence,passages[0].text);
 });
});

test('large direct requests fail visibly instead of silently truncating input',async()=>{
 await provider(async()=>{throw Error('Oversized input must not reach the provider');},async()=>{
  const result=await invoke({sources:sources(),mode:'mcq'});
  assert.equal(result.status,400);assert.match(result.error,/nothing was truncated/);
 });
});

test('merged comparisons keep all explanation evidence and generation groups bound text as well as count',()=>{
 const list=sources(),index=newIndex(list),passages=index.plan.batches.flat();
 const a={name:'Sampling comparison',explanation:'Compare the two sampling approaches.',importance:3,kind:'comparison',evidenceIds:passages.slice(0,2).map(p=>p.id)};
 const b={...a,importance:1,evidenceIds:[passages.at(-1).id]};
 index.concepts=shared.mergeIndexedConcepts([a,b]);
 assert.equal(index.concepts[0].evidenceIds.length,3);
 const selected=shared.selectIndexedConcepts(index,1);
 assert.ok(a.evidenceIds.every(id=>selected[0].evidenceIds.includes(id)));
 const huge=Array.from({length:3},(_,i)=>({...a,id:`large-${i}`,evidenceIds:passages.slice(i*30,i*30+30).map(p=>p.id)}));
 const groups=shared.groupIndexedConcepts(huge,index);
 assert.ok(groups.length>1);assert.equal(groups.flat().length,3);
 for(const group of groups){const ids=new Set(group.flatMap(c=>c.evidenceIds));assert.ok(passages.filter(p=>ids.has(p.id)).reduce((n,p)=>n+p.text.length,0)<=20000);}
});

test('concept normalization merges cosmetic variants without collapsing programming language names',()=>{
 assert.equal(shared.indexedConceptId('  Uncertainty! '),shared.indexedConceptId('uncertainty'));
 assert.notEqual(shared.indexedConceptId('C++'),shared.indexedConceptId('C#'));
 assert.notEqual(shared.indexedConceptId('C++'),shared.indexedConceptId('C'));
});

test('static route serves the shared browser script while private files stay blocked',async()=>{
 function request(url) {
  return new Promise(resolve=>{
   const response={writeHead(status){this.status=status;},end(body){resolve({status:this.status,body:String(body)});}};
   server.server.listeners('request')[0]({method:'GET',url,headers:{host:'localhost:4177'}},response);
  });
 }
 const script=await request('/source-index.js');assert.equal(script.status,200);
 assert.equal(script.body,fs.readFileSync(path.join(root,'source-index.js'),'utf8'));
 assert.equal((await request('/.env')).status,403);
 assert.equal((await request('/server.js')).status,403);
});
