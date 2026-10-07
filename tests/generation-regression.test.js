const {fixtureConcepts}=require('./helpers/index-fixture');
const {buildEvidencePassages}=require('../source-index');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {EventEmitter}=require('node:events');
process.env.EMAIL_DISABLED='1';
const server=require('../server');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const material='Behavioral ethics examines how people actually make moral decisions. Social pressure and cognitive biases influence ethical choices in organizations.';
const evidence='Social pressure and cognitive biases influence ethical choices in organizations.';
const result={summary:'Ethical decisions',keyPoints:[],studyPlan:[],flashcards:[{front:'What influences ethical choices?',back:'Social pressure and cognitive biases.',sourceId:'11',section:'body',evidence}],mcq:[{question:'What influences ethical choices?',choices:['Social pressure and cognitive biases','Only written rules','Only age','Nothing'],answer:'Social pressure and cognitive biases',explanation:'The source identifies both social pressure and cognitive biases.',sourceId:'11',section:'body',evidence}]};
function invoke(body) {
  const request=new EventEmitter();
  return new Promise((resolve,reject)=>{
    let status;
    const response={writeHead(code){status=code;},end(text){resolve({status,body:JSON.parse(text)});}};
    server.proxyAiTutor(request,response).catch(reject);
    request.emit('data',JSON.stringify(body));request.emit('end');
  });
}
const input={mode:'flashcards',courseName:'COSC201',moduleName:'Week 4',sources:[{id:'11',title:'Behavioral Ethics',text:material}]};
test('actual Responses request contains JSON instruction and complete schema; API, malformed and incomplete errors are visible',async()=>{
 const original=global.fetch, oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-key';
 try {
  global.fetch=async(url,options)=>{
   const body=JSON.parse(options.body);
   assert.match(body.input[0].content[0].text,/json/i);
   assert.match(body.instructions,/sourceId/);assert.match(body.instructions,/evidence/);
   assert.equal(body.text.format.type,'json_schema');assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.additionalProperties,false);
   return {ok:true,json:async()=>({status:'completed',output_text:JSON.stringify(result)})};
  };
  const success=await invoke(input);assert.equal(success.body.flashcards.length,1);assert.equal(success.body.flashcards[0].source,'Behavioral Ethics');
  global.fetch=async()=>({ok:false,status:429,json:async()=>({error:{message:'Rate limited fixture'}})});
  assert.match((await invoke(input)).body.error,/Rate limited/);
  global.fetch=async()=>({ok:true,json:async()=>({status:'incomplete'})});
  assert.match((await invoke(input)).body.error,/incomplete/);
  global.fetch=async()=>({ok:true,json:async()=>({output_text:'{"flashcards":'})});
  assert.match((await invoke(input)).body.error,/invalid JSON/);
 } finally {global.fetch=original;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
test('download refresh retains signed query and parses public_url as metadata; metadata denial is distinct',async()=>{
 let refreshes=0;const seen=[];
 const options={metadata:async(base,token,p)=>{
  if(p.includes('/public_url'))return {public_url:'https://cdn.example/public?signature=kept%2Bexact'};
  refreshes++;return {id:55,display_name:'reading.txt',url:`https://cdn.example/file?signature=${refreshes===1?'stale':'fresh%2Bexact'}`};
 },download:async(url,options)=>{
  seen.push(url);assert.equal(options.canvasOrigin,'https://canvas.example');
  return url.includes('fresh%2Bexact') ? {status:200,headers:{'content-type':'text/plain'},buffer:Buffer.from(material)} : {status:403,headers:{},buffer:Buffer.alloc(0)};
 }};
 const recovered=await server.downloadCanvasFile('https://canvas.example','fixture',55,options);
 assert.equal(recovered.readable,true);assert.equal(recovered.downloadRefreshed,true);assert.ok(seen.some(url=>url.endsWith('fresh%2Bexact')));
 assert.ok(seen.includes('https://cdn.example/public?signature=kept%2Bexact'));
 const denied=await server.downloadCanvasFile('https://canvas.example','fixture',55,{metadata:async()=>{const e=Error();e.status=403;throw e;},download:async()=>{throw Error('must not download');}});
 assert.match(denied.reason,/denied file metadata/);
 const failed=await server.downloadCanvasFile('https://canvas.example','fixture',55,{...options,download:async()=>({status:403,headers:{},buffer:Buffer.alloc(0)})});
 assert.equal(failed.readable,false);assert.match(failed.reason,/after refreshing/);assert.ok(failed.trace.some(step=>step.status===403));
});
test('reject 20-character viewer text, login and error shells; resolve public linked documents without credentials',async()=>{
 for(const text of ['Google Drive preview','Sign in to continue','Access denied','<title>Login</title><input type="password">']){
  const outcome=await server.readExternalSource('https://example.com/view',async url=>({url,status:200,headers:{'content-type':'text/html'},buffer:Buffer.from(text)}));
  assert.equal(outcome.readable,false);
 }
 const urls=[];
 const doc=await server.readExternalSource('https://drive.google.com/file/d/fixture/view?resourcekey=kept',async(url,options)=>{
  assert.equal(options,undefined);urls.push(url);
  return {url,status:200,headers:{'content-type':'text/plain','content-disposition':'attachment; filename="Ethics.txt"'},buffer:Buffer.from(material)};
 });
 assert.equal(doc.readable,true);assert.match(urls[0],/export=download/);assert.match(urls[0],/resourcekey=kept/);
 const linked=await server.readExternalSource('https://example.com/view',async url=>({url,status:200,headers:{'content-type':url.endsWith('.docx')?'text/plain':'text/html','content-disposition':'attachment; filename="lesson.txt"'},buffer:Buffer.from(url.endsWith('.docx')?material:'<iframe src="lesson.docx"></iframe>')}));
 assert.equal(linked.readable,true);
 const ppt=await server.processSourceDocument('legacy.ppt','application/vnd.ms-powerpoint',Buffer.from('d0cf11e0a1b11ae1','hex'));
 assert.equal(ppt.readable,false);assert.match(ppt.reason,/LibreOffice/);
});
const waitFor=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail('UI condition timed out');};
test('real Create buttons → actual server validation → interactive flashcards/quiz, retained when returning to tab',async()=>{
 const original=global.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-key';
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://127.0.0.1:4177',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;let calls=0;
 w.localStorage.setItem('canvas-tutor-ai-options-v1',JSON.stringify({count:1,difficulty:'mixed'}));
 global.fetch=async(url, options)=>{
  calls++;
  const prompt=JSON.parse(options.body).input[0].content[0].text;
  const evidenceId=prompt.match(/\[(src:[^\]]+)\]/)[1];
  const conceptId=prompt.match(/"id":"(concept:[^"]+)"/)[1];
  const output={...result,flashcards:result.flashcards.map(({sourceId,evidence,...card})=>({...card,evidenceId,conceptId})),mcq:result.mcq.map(({sourceId,evidence,...q})=>({...q,answer:'A',evidenceId,conceptId}))};
  return {ok:true,json:async()=>({status:'completed',output_text:JSON.stringify(output)})};
 };
 w.fetch=async(url,options)=>{
  if(url==='/api/ai-status')return {ok:true,json:async()=>({configured:true,model:'fixture'})};
  const body=JSON.parse(options?.body||'{}');let data;
  if(url==='/api/ai-index')return {ok:true,json:async()=>({concepts:fixtureConcepts(body.passages)})};
  if(url==='/api/ai-tutor'){const outcome=await invoke(body);return {ok:outcome.status===200,json:async()=>outcome.body};}
  const p=body.path||'';
  const page=new URL(p||'/', 'https://canvas.example').searchParams.get('page');
  if(p.includes('/profile'))data={name:'Fixture student'};
  else if(p.startsWith('/api/v1/courses?'))data=[{id:201,name:'COSC201'}];
  else if(p.includes('/modules?'))data=page==='1'?[{id:4,name:'Week 4',items_count:1}]:[];
  else if(p.includes('/items?')&&p.includes('/modules/'))data=page==='1'?[{id:11,type:'Page',page_url:'ethics',title:'Behavioral Ethics'}]:[];
  else if(p.includes('/pages/ethics'))data={body:`<p>${material}</p>`};
  else data=[];
  return {ok:true,status:200,json:async()=>data};
 };
 try{
  w.eval(['source-quality.js','source-index.js','tutor-core.js','practice-core.js','app.js','practice-ui.js','tutor-ui.js','ui.js'].map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('\n'));
  w.document.querySelector('#canvas-url').value='https://canvas.example';w.document.querySelector('#canvas-token').value='fixture';w.document.querySelector('#connect-canvas').click();
  await waitFor(()=>w.document.querySelector('.course-card'));
  w.location.hash='course/201/flashcards';await waitFor(()=>w.document.querySelector('[data-module-flashcards]'));
  w.document.querySelector('[data-module-flashcards]').click();await waitFor(()=>w.document.querySelector('[data-flip]'));
  const flashcard=w.document.querySelector('[data-flip]');assert.equal(flashcard.getAttribute('aria-pressed'),'false');flashcard.click();assert.equal(w.document.querySelector('[data-flip]').getAttribute('aria-pressed'),'true');assert.match(w.document.querySelector('[data-flip]').textContent,/Social pressure/);
  assert.match(w.document.querySelector('.important-points').textContent,/Social pressure/);
  assert.equal(w.document.querySelector('.source-details').open,false);
  assert.equal(w.document.querySelector('.practice-session .source-citation').open,false);
  w.location.hash='course/201/quizzes';await waitFor(()=>w.document.querySelector('[data-module-quiz]'));
  w.document.querySelector('[data-module-quiz]').click();await waitFor(()=>w.document.querySelector('[data-start-quiz]'));
  w.document.querySelector('[data-start-quiz]').click();assert.equal(w.document.querySelector('.practice-session .source-citation'),null);
  [...w.document.querySelectorAll('[data-practice-question] input')].find(el=>el.value===result.mcq[0].answer).click();w.document.querySelector('[data-finish]').click();
  await waitFor(()=>w.document.querySelector('[data-score]'));assert.match(w.document.querySelector('[data-score]').textContent,/1 \/ 1/);assert.ok(w.document.querySelector('.practice-session .source-citation'));
  w.location.hash='course/201/flashcards';await waitFor(()=>w.document.querySelector('[data-flip]'));
  assert.equal(calls,2);assert.ok(!w.document.querySelector('[data-module-flashcards]'));
  global.fetch=async()=>({ok:false,status:429,json:async()=>({error:{message:'Rate limited fixture'}})});
  w.document.querySelector('[data-ai-tutor-mode]').click();await waitFor(()=>w.document.querySelector('#response-body [role="alert"]')?.textContent.includes('Rate limited'));
 }finally{dom.window.close();global.fetch=original;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
test('legacy PPT converter dispatches conversion, extracts slides, cleans temporary files and reports failure',async()=>{
 let temporary;
 const converted=await server.processLegacyPpt('Week2.ppt',Buffer.from('d0cf11e0a1b11ae1','hex'),{converter:'fixture-converter',run:async(executable,args)=>{
  assert.equal(executable,'fixture-converter');assert.ok(args.includes('pptx'));
  temporary=args[args.indexOf('--outdir')+1];
  fs.copyFileSync(path.join(__dirname,'fixtures/converted-slide.pptx'),path.join(temporary,'slides.pptx'));
 }});
 assert.equal(converted.readable,true);assert.match(converted.text,/Slide 1/);assert.equal(fs.existsSync(temporary),false);
 const failed=await server.processLegacyPpt('Week2.ppt',Buffer.alloc(8),{converter:'fixture-converter',run:async()=>{throw Error('conversion failed');}});
 assert.equal(failed.readable,false);assert.match(failed.reason,/could not convert/);
});

test('reject heading-dump flashcards and filename questions while retaining supported concept questions',()=>{
 const {studyTextProblem}=require('../source-quality');
 assert.match(studyTextProblem('Slide 1: Fall 2026 COSC 470 Artificial Intelligence September 8\nSlide 2: 2\nSlide 3: What is data?\nSlide 4: Data science vs artificial intelligence\nSlide 5: Types of data\nSlide 6: How does machine learning work?'), /Only slide headings/);
 assert.equal(studyTextProblem('Slide 7:\nExploratory data analysis uses summaries and visualizations to identify patterns, missing values and outliers before modeling.'),'');
 const base=result.flashcards[0];
 const accepted=server.validateGroundedResult({keyPoints:[],flashcards:[base,{...base,front:'What should you remember from Week3.pptx?'},{...base,front:'What should you study?',back:'Slide 1: Intro Slide 2: Data Slide 3: Learning'}],mcq:[]},input.sources);
 assert.equal(accepted.flashcards.length,1);assert.equal(accepted.keyPoints[0].text,base.back);
});
test('server deadline covers a stalled provider connection and stalled response body',async()=>{
 for(const fetchImpl of [async()=>new Promise(()=>{}),async()=>({json:async()=>new Promise(()=>{})})]){
  await assert.rejects(server.requestAiResponse({}, {fetchImpl,timeoutMs:5}),/timed out/);
 }
});


test('passage citations accept valid cards and letter answers, reject invented or cross-source references',()=>{
 const body={flashcards:[{front:'Why inspect missing values?',back:'Their cause can affect analysis.',evidenceId:'S1P1'}],mcq:[{question:'Which is affected by missing values?',choices:['Analysis','File names','Nothing','Slide order'],answer:'A',explanation:'Missing values affect analysis.',evidenceId:'S1P1'}]};
 const sources=[{id:'file-42',title:'EDA.ppt',text:'Slide 7:\nMissing values should be investigated because their cause can affect the analysis.'}];
 body.flashcards[0].evidenceId=body.mcq[0].evidenceId=buildEvidencePassages(sources)[0].id;
 const parsed=server.validateGroundedResult(server.parseAiTutorJson(JSON.stringify(body)),sources);
 assert.equal(parsed.flashcards.length,1);assert.equal(parsed.mcq.length,1);
 assert.equal(parsed.mcq[0].answer,'Analysis');assert.equal(parsed.mcq[0].section,'Slide 7');
 assert.equal(parsed.mcq[0].source,'EDA.ppt');assert.match(parsed.mcq[0].evidence,/Missing values should be investigated/);
 for(const card of [{...body.flashcards[0],evidenceId:'S2P99'},{...body.flashcards[0],sourceId:'different-module-file'}]) {
  assert.equal(server.validateGroundedResult(server.parseAiTutorJson(JSON.stringify({...body,flashcards:[card]})),sources).flashcards.length,0);
 }
 const legacy=server.parseAiTutorJson(JSON.stringify({...result,flashcards:[{...result.flashcards[0],sourceId:11}]}));
 assert.equal(server.validateGroundedResult(legacy,input.sources).flashcards.length,1);
 const fabricated=server.parseAiTutorJson(JSON.stringify({...result,flashcards:[{...result.flashcards[0],evidence:'This completely invented explanation is absent from the source.'}]}));
 assert.equal(server.validateGroundedResult(fabricated,input.sources).flashcards.length,0);
});

test('installed reader extracts a real binary PowerPoint file without LibreOffice', {skip: !fs.existsSync(path.join(root,'.tools/catdoc/bin/catppt'))}, async()=>{
 const buffer=fs.readFileSync(path.join(__dirname,'fixtures/basic_test_ppt_file.ppt'));
 assert.equal(buffer.subarray(0,8).toString('hex'),'d0cf11e0a1b11ae1');
 const extracted=await server.processLegacyPpt('Week 5.ppt',buffer,{reader:path.join(root,'.tools/catdoc/bin/catppt')});
 assert.equal(extracted.readable,true);assert.equal(extracted.extractor,'catppt');
 assert.match(extracted.text,/This is page two/);assert.match(extracted.text,/It has several blocks of text/);
 assert.equal(extracted.title,'Week 5.ppt');assert.match(extracted.text,/Section 1:/);
});


test('LibreOffice is preferred and converts a real binary PPT into ordered slide text', {skip: !fs.existsSync('/Applications/LibreOffice.app/Contents/MacOS/soffice')}, async()=>{
 const extracted=await server.processSourceDocument('Original.ppt','application/vnd.ms-powerpoint',fs.readFileSync(path.join(__dirname,'fixtures/basic_test_ppt_file.ppt')));
 assert.equal(extracted.readable,true);assert.equal(extracted.extractor,'libreoffice');
 assert.equal(extracted.title,'Original.ppt');assert.match(extracted.text,/Slide 1:/);assert.match(extracted.text,/Slide 2:/);
 assert.match(extracted.text,/This is page two/);
});

test('legacy reader falls back to catppt if LibreOffice conversion fails',async()=>{
 const calls=[];
 const extracted=await server.processLegacyPpt('Fallback.ppt',Buffer.alloc(8),{converter:'test-libreoffice',reader:'test-catppt',run:async(executable)=>{
  calls.push(executable);
  if(executable==='test-libreoffice')throw Error('Conversion failed');
  return {stdout:material};
 }});
 assert.deepEqual(calls,['test-libreoffice','test-catppt']);
 assert.equal(extracted.readable,true);assert.equal(extracted.extractor,'catppt');
});
