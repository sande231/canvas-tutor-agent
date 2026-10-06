const test = require('node:test');
const assert = require('node:assert/strict');
process.env.EMAIL_DISABLED = '1';
const server = require('../server');
function zip(entries) {
 const locals=[],central=[];let offset=0;
 for(const [name,text] of entries){
  const data=Buffer.from(text), filename=Buffer.from(name), local=Buffer.alloc(30), directory=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(filename.length,26);
  directory.writeUInt32LE(0x02014b50);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
  locals.push(local,filename,data);central.push(directory,filename);offset+=local.length+filename.length+data.length;
 }
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,...central,end]);
}
function pdf(pages=60) {
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${Array.from({length:pages},(_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${pages} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(let page=1;page<=pages;page++){
  const stream=`BT /F1 10 Tf 30 750 Td (Unique lesson on page ${page}.) Tj `+Array.from({length:18},()=> '0 -15 Td (Data analysis compares observed values to find patterns and missing measurements.) Tj ').join('')+'ET';
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+(page-1)*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 }
 let text='%PDF-1.4\n';const offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(text.length);text+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const start=text.length;
 text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Root 1 0 R /Size ${objects.length+1} >>\nstartxref\n${start}\n%%EOF`;
 return Buffer.from(text);
}
test('60-page PDF keeps the last page beyond the old character limit',async()=>{
 const result=await server.processSourceDocument('Full.pdf','application/pdf',pdf());
 assert.match(result.text,/Unique lesson on page 60/);assert.ok(result.text.length>45000);
 assert.equal(result.reading.pagesRead,60);assert.equal(result.reading.totalPages,60);assert.equal(result.reading.truncated,false);
});
test('PDF inside ZIP uses PDF.js and retains its final page',async()=>{
 const result=await server.processSourceDocument('module.zip','application/zip',zip([['Full.pdf',pdf()]]));
 assert.match(result.text,/Unique lesson on page 60/);
 assert.equal(result.sources[0].extractor,'pdfjs');assert.equal(result.sources[0].reading.pagesRead,60);
});

test('Office, notebooks, text, code and ZIP retain content beyond the old limits',async()=>{
 const long='A measurement records observed values for later comparison. '.repeat(600)+'LAST_CONTENT';
 for(const [title,buffer] of [
  ['long.txt',Buffer.from(long)],['long.py',Buffer.from('x = 1\n'.repeat(4000)+'print("LAST_CONTENT")')],
  ['long.docx',zip([['word/document.xml',`<w:p><w:t>${long}</w:t></w:p>`]])],
  ['long.pptx',zip([['ppt/slides/slide1.xml',`<a:p><a:t>${long}</a:t></a:p>`]])],
  ['long.ipynb',Buffer.from(JSON.stringify({cells:Array.from({length:100},(_,i)=>({cell_type:'markdown',source:[long.slice(0,250)+` CELL_${i+1}`]}))}))],
 ]) {
  const result=await server.processSourceDocument(title,'',buffer);
  assert.ok(result.text.includes(title.endsWith('ipynb')?'CELL_100':'LAST_CONTENT'),title);
  assert.equal(result.reading.truncated,false,title);assert.equal(result.reading.characters,result.text.length);
 }
 const archive=await server.processSourceDocument('many.zip','',zip(Array.from({length:50},(_,i)=>[`file${i+1}.txt`,long.slice(0,5000)+` FILE_END_${i+1}`])));
 assert.match(archive.text,/FILE_END_50/);assert.equal(archive.sources.length,50);assert.ok(archive.text.length>250000);
 assert.equal(archive.reading.truncated,false);
});

test('reader environment overrides validate integers; safety truncation reports pages, cells and characters',async()=>{
 const configured=server.configuredReaderLimits({READER_PDF_PAGES:'3',READER_TEXT_CHARS:'100',READER_OFFICE_CHARS:'bad',READER_ZIP_FILES:'-1'});
 assert.equal(configured.PDF_PAGES,3);assert.equal(configured.TEXT_CHARS,100);assert.equal(configured.OFFICE_CHARS,2000000);assert.equal(configured.ZIP_FILES,1000);
 const original={...server.readerLimits};
 try {
  server.readerLimits.PDF_PAGES=2;
  let result=await server.processSourceDocument('limited.pdf','',pdf(3));
  assert.equal(result.reading.pagesRead,2);assert.equal(result.reading.totalPages,3);assert.equal(result.reading.truncated,true);
  server.readerLimits.TEXT_CHARS=20;
  result=await server.processSourceDocument('limited.txt','',Buffer.from('A long passage about evidence and observations.'));
  assert.equal(result.text.length,20);assert.match(result.reading.limits.join(' '),/TEXT_CHARS/);
  server.readerLimits.NOTEBOOK_CELLS=1;
  result=await server.processSourceDocument('limited.ipynb','',Buffer.from(JSON.stringify({cells:[{cell_type:'code',source:['a = 1']},{cell_type:'code',source:['b = 2']}]})));
  assert.equal(result.reading.cellsRead,1);assert.equal(result.reading.totalCells,2);assert.equal(result.reading.truncated,true);
  server.readerLimits.ZIP_FILES=1;
  result=await server.processSourceDocument('limited.zip','',zip([['one.txt','Readable material'],['two.txt','Unread material']]));
  assert.equal(result.reading.filesRead,1);assert.equal(result.reading.totalFiles,2);assert.equal(result.reading.truncated,true);
 } finally {Object.assign(server.readerLimits,original);}
});

const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const content='Data analysis compares observed values to identify patterns and missing measurements before modeling.';
function app(handler) {
 const root=path.join(__dirname,'..');
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://127.0.0.1:4177',runScripts:'outside-only'});
 dom.window.localStorage.setItem('canvas-tutor-ai-options-v1',JSON.stringify({count:1,difficulty:'mixed'}));
 dom.window.fetch=async(url,options)=>({ok:true,status:200,json:async()=>url==='/api/ai-status'?{configured:true,model:'fixture'}:handler(url,JSON.parse(options?.body||'{}'))});
 dom.window.eval(['source-quality.js','app.js'].map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('\n') + '\ncanvasConnection = {baseUrl:"https://canvas.example",token:"fixture-memory-only",profile:{},courses:[]}; window.newFixtureSession = () => {canvasReadingSession++;};');
 return dom;
}
const firstPage=body=>new URL(body.path,'https://canvas.example').searchParams.get('page')==='1';
test('Canvas HTML keeps headings and reads same-origin linked files once, one level deep',async()=>{
 const downloaded=[];
 const dom=app((url,body)=>{
  if(url==='/api/canvas-file-text'){downloaded.push(body.fileId);return {title:`File ${body.fileId}`,readable:true,text:content+' <a href="/files/99">No recursive link</a>',reading:{characters:content.length,truncated:false,limits:[],pagesRead:3,totalPages:3}};}
  if(body.path.includes('/items?'))return firstPage(body)?[
   {id:1,type:'Page',page_url:'lesson',title:'Lesson'},
   {id:2,type:'Discussion',content_id:22,title:'Discussion'},
   {id:3,type:'Assignment',content_id:33,title:'Assignment'},
   {id:4,type:'File',content_id:8,title:'Direct file'},
  ]:[];
  const html=`<h2>Observations</h2><p>${content}</p><a href="/courses/1/files/7/download?download_frd=1">Reading</a><a href="https://canvas.example/files/7">Duplicate</a><a href="/files/8">Direct duplicate</a><a href="https://external.example/files/9">External</a><a href="https://user:pass@canvas.example/files/10">Credentials</a><a href="/pages/other">Other page</a><script>Hidden text</script>`;
  return {body:html,message:html,description:html};
 });
 try {
  const module=await dom.window.hydrateSelectedModule({id:1},[{id:2,name:'Module',items:[]}],2,'Reading');
  assert.deepEqual(downloaded.sort(),['7','8']);assert.equal(module.items.filter(i=>i.type==='File').length,2);
  const parent=module.items.find(i=>i.type==='Page'),child=module.items.find(i=>i.contentId==='7');
  assert.match(parent.summary,/Section: Observations\n/);assert.doesNotMatch(parent.summary,/Hidden text/);
  assert.equal(child.parentId,1);assert.ok(parent.children.some(i=>i.id===child.id));
  const report=dom.window.renderModuleSourceReport(module);assert.match(report,/Linked from: Lesson/);assert.match(report,/3 of 3 pages read/);
  assert.ok(dom.window.buildAiTutorPayload({id:1},module,'mcq').sources.some(source=>source.id===child.id));
 } finally {dom.window.close();}
});

test('four-worker hydration reports progress and preserves module order',async()=>{
 let active=0,max=0;const releases=[];
 const dom=app(async(url,body)=>{
  if(body.path.includes('/items?'))return firstPage(body)?Array.from({length:8},(_,i)=>({id:i+1,type:'Page',page_url:`page${i+1}`,title:`Page ${i+1}`})):[];
  active++;max=Math.max(max,active);
  await new Promise(resolve=>releases.push(resolve));active--;
  return {body:content};
 });
 try {
  const pending=dom.window.hydrateSelectedModule({id:1},[{id:2,name:'Module',items:[]}],2,'Reading');
  for(let i=0;i<10&&releases.length<4;i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(max,4);releases.shift()();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.match(dom.window.document.querySelector('#reading-progress').textContent,/Reading 1 of 8: Page 1/);
  for(let round=0;round<4;round++){releases.splice(0).forEach(resolve=>resolve());await new Promise(resolve=>setTimeout(resolve,0));}
  const module=await pending;assert.equal(max,4);assert.deepEqual(Array.from(module.items,i=>i.id),[1,2,3,4,5,6,7,8]);
 } finally {dom.window.close();}
});

test('Generate again reuses session extraction; Re-read module refreshes sources and clears generated material',async()=>{
 let downloads=0,lists=0,aiCalls=0;
 const dom=app((url,body)=>{
  if(url==='/api/ai-tutor'){aiCalls++;return {keyPoints:[],mcq:[],flashcards:[{front:'Why analyze data?',back:'To identify patterns.',source:'Reading',evidence:content}]};}
  if(url==='/api/canvas-file-text'){downloads++;return {title:'Reading',readable:true,text:content,reading:{characters:content.length,truncated:false,limits:[]}};}
  if(body.path.includes('/items?')){lists++;return firstPage(body)?[{id:1,type:'File',content_id:7,title:'Reading'}]:[];}
  throw Error('Unexpected fixture request');
 });
 try {
  const w=dom.window,module={id:2,name:'Module',items:[]},course={id:1,name:'Course'};
  await w.runAiTutor(course,module,'flashcards');await w.runAiTutor(course,module,'flashcards');
  assert.equal(downloads,1);assert.equal(lists,2);assert.equal(aiCalls,2);
  w.document.querySelector('[data-reread-module]').click();
  for(let i=0;i<30&&!w.document.querySelector('#response-title').textContent.includes('refreshed');i++)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(downloads,2);assert.equal(lists,4);assert.equal(Object.keys(module.generated).length,0);
  await w.runAiTutor(course,module,'flashcards');assert.equal(downloads,2);assert.equal(aiCalls,3);
  // A new authenticated session must not reuse a previous session's source cache.
  w.newFixtureSession();await w.runAiTutor(course,module,'flashcards');assert.equal(downloads,3);
 } finally {dom.window.close();}
});

test('source report discloses safety truncation and unavailable page counts',()=>{
 const dom=app(()=>{throw Error('No requests expected');});
 try {
  const report=dom.window.renderModuleSourceReport({items:[{id:1,title:'Long text',type:'File',readable:true,summary:content,reading:{characters:100,truncated:true,limits:['TEXT_CHARS: 100 characters']}}]});
  assert.match(report,/100 characters extracted/);assert.match(report,/Safety limit — partial extraction/);assert.match(report,/Page\/slide count not available/);
 } finally {dom.window.close();}
});

test('ZIP per-file and total text limits remain explicit, including each affected child',async()=>{
 const original={...server.readerLimits};
 try {
  server.readerLimits.ZIP_FILE_CHARS=100;
  server.readerLimits.ZIP_TOTAL_CHARS=170;
  const result=await server.processSourceDocument('limited.zip','',zip([['one.txt',content.repeat(3)],['two.txt',content.repeat(3)],['three.txt',content.repeat(3)]]));
  assert.ok(result.text.length<=170);assert.equal(result.reading.truncated,true);
  assert.equal(result.sources[0].text.length,100);assert.match(result.sources[0].reading.limits.join(' '),/ZIP_FILE_CHARS/);
  assert.match(result.sources[1].reading.limits.join(' '),/ZIP_TOTAL_CHARS/);assert.equal(result.reading.totalFiles,3);
 } finally {Object.assign(server.readerLimits,original);}
});

test('file items missing IDs remain individually visible, and failed re-reading invalidates the cache',async()=>{
 const dom=app((url,body)=>{
  return firstPage(body)?[{id:1,type:'File',title:'Missing one'},{id:2,type:'File',title:'Missing two'}]:[];
 });
 try {
  const w=dom.window,course={id:1},module={id:2,name:'Module',items:[]};
  await w.hydrateSelectedModule(course,[module],2,'Reading');
  assert.equal(module.items.length,2);assert.ok(module.items.every(item=>item.status==='blocked'));
  w.fetch=async()=>{throw Error('Canvas unavailable');};
  assert.equal(await w.hydrateSelectedModule(course,[module],2,'Reading',{force:true}),null);
  assert.equal(module.hydrated,false);
  assert.match(w.document.querySelector('#response-body').textContent,/Canvas unavailable/);
 } finally {dom.window.close();}
});
