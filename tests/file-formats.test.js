const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
process.env.EMAIL_DISABLED='1';
const server=require('../server');
const root=path.join(__dirname,'..');
function zip(entries){
 const locals=[],central=[];let offset=0;
 for(const [name,text] of entries){const data=Buffer.from(text),filename=Buffer.from(name),local=Buffer.alloc(30),directory=Buffer.alloc(46);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(filename.length,26);directory.writeUInt32LE(0x02014b50);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);locals.push(local,filename,data);central.push(directory,filename);offset+=local.length+filename.length+data.length;}
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,...central,end]);
}
function pdf(texts=['','']){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${texts.map((_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${texts.length} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 texts.forEach((text,i)=>{const stream=text?`BT /F1 10 Tf 30 750 Td (${text}) Tj ET`:'';objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);});
 let text='%PDF-1.4\n';const offsets=[];objects.forEach((obj,i)=>{offsets.push(text.length);text+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const start=text.length;text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Root 1 0 R /Size ${objects.length+1} >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(text);
}
const spreadsheet=()=>zip([
 ['xl/workbook.xml','<workbook><sheets><sheet name="Observations &amp; results" r:id="rId1"/><sheet name="Final sheet" r:id="rId2"/></sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>'],
 ['xl/sharedStrings.xml','<sst><si><r><t>Measure </t></r><r><t>temperature</t></r></si></sst>'],
 ['xl/worksheets/sheet1.xml','<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>0</v></c><c r="C1" t="b"><v>1</v></c><c r="D1"><f>SUM(B1:B2)</f><v>42</v></c><c r="E1"><f>SUM(B1:B2)</f></c></row></sheetData></worksheet>'],
 ['xl/worksheets/sheet2.xml','<worksheet><sheetData><row><c r="A9" t="inlineStr"><is><t>Last sheet important explanation: observe the measurements before drawing conclusions.</t></is></c></row></sheetData></worksheet>'],
]);
const office={docx:()=>zip([['word/document.xml','<w:p><w:t>The mean is the sum divided by the number of measurements.</w:t></w:p>']]),pptx:()=>fs.readFileSync(path.join(__dirname,'fixtures/converted-slide.pptx')),xlsx:spreadsheet};

test('all legacy and OpenDocument extensions dispatch the right LibreOffice conversion and clean temporary files',async()=>{
 for(const [extension,target] of Object.entries({ppt:'pptx',odp:'pptx',doc:'docx',rtf:'docx',odt:'docx',xls:'xlsx',ods:'xlsx'})){
  let directory,calls=0;const updates=[];
  const result=await server.processSourceDocument(`lesson.${extension}`,'',Buffer.from('d0cf11e0a1b11ae1','hex'),{converter:'fixture-office',onProgress:message=>updates.push(message),run:async(executable,args,options)=>{
   calls++;assert.equal(executable,'fixture-office');assert.equal(args[args.indexOf('--convert-to')+1],target);assert.equal(options.timeout,45000);assert.match(args[0],/UserInstallation=file:/);directory=args[args.indexOf('--outdir')+1];assert.equal(path.extname(args.at(-1)),'.'+extension);fs.writeFileSync(path.join(directory,'slides.'+target),office[target]());
  }});
  assert.equal(calls,1,extension);assert.equal(result.readable,true,extension);assert.equal(result.title,`lesson.${extension}`);assert.equal(fs.existsSync(directory),false);assert.match(updates[0],/Converting/);
 }
});
test('converter failures, missing tools and missing output are explicit and cleaned up',async()=>{
 for(const failure of ['timeout','no-output']){
  let directory;const result=await server.processLibreOffice('notes.doc',Buffer.from('fixture'),{converter:'fixture-office',run:async(_exe,args)=>{directory=args[args.indexOf('--outdir')+1];if(failure==='timeout')throw Error('timeout');}});
  assert.equal(result.readable,false);assert.match(result.reason,/LibreOffice could not convert/);assert.equal(fs.existsSync(directory),false);
 }
 const missing=await server.processLibreOffice('table.ods',Buffer.from('fixture'),{converter:false});assert.match(missing.reason,/LIBREOFFICE_PATH/);
});
test('XLSX uses named sheets, shared and inline strings, zero values, booleans and labelled formula caches',async()=>{
 const result=await server.processSourceDocument('values.xlsx','',spreadsheet());
 assert.equal(result.extractor,'xlsx-xml');assert.match(result.text,/Section: Observations & results/);assert.match(result.text,/A1: Measure temperature/);assert.match(result.text,/B1: 0/);assert.match(result.text,/C1: TRUE/);assert.match(result.text,/cached result: 42/);assert.match(result.text,/no cached result \(not calculated\)/);assert.match(result.text,/Section: Final sheet[\s\S]*Last sheet important explanation/);assert.equal(result.reading.sheetsRead,2);assert.equal(result.reading.totalSheets,2);assert.equal(result.reading.truncated,false);
});
test('XLSX truncation and missing relationships or shared strings are reported without following links',async()=>{
 const original=server.readerLimits.OFFICE_CHARS;try{server.readerLimits.OFFICE_CHARS=30;const result=await server.processSourceDocument('values.xlsx','',spreadsheet());assert.equal(result.text.length,30);assert.equal(result.reading.truncated,true);}finally{server.readerLimits.OFFICE_CHARS=original;}
 const bad=await server.processSourceDocument('bad.xlsx','',zip([['xl/workbook.xml','<sheet name="Secret" r:id="r1"/>'],['xl/_rels/workbook.xml.rels','<Relationship Id="r1" TargetMode="External" Target="http://127.0.0.1/private"/>']]));assert.equal(bad.readable,false);assert.match(bad.reason,/external/);assert.equal(bad.reading.partial,true);
 const missingString=await server.processSourceDocument('strings.xlsx','',zip([['xl/workbook.xml','<sheet name="Lesson" r:id="r1"/>'],['xl/_rels/workbook.xml.rels','<Relationship Id="r1" Target="worksheets/sheet1.xml"/>'],['xl/worksheets/sheet1.xml','<c r="A1" t="s"><v>9</v></c>']]));assert.equal(missingString.readable,false);assert.match(missingString.reason,/shared string missing/);
 const malformed=await server.processSourceDocument('broken.xlsx','',Buffer.from('not zip'));assert.equal(malformed.readable,false);assert.match(malformed.reason,/encrypted or damaged/);
});
test('archives and file picker include every new extension',async()=>{
 const formats=['doc','rtf','odt','odp','ods','xls','xlsx'];
 const archive=await server.processSourceDocument('all.zip','',zip(formats.map(ext=>['file.'+ext,ext==='xlsx'?spreadsheet():Buffer.from('fixture')])),{converter:false});
 assert.equal(archive.sources.length,formats.length);assert.ok(archive.sources.find(s=>s.title==='file.xlsx').readable);
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');for(const extension of formats)assert.ok(app.match(/accept="([^"]+)"/)[1].includes('.'+extension));
});
test('scanned PDFs and image-only slides skip OCR with clear missing-tool instructions',async()=>{
 const options={tools:{pdftoppm:false,tesseract:false},run:()=>{throw Error('Must not execute a tool');}};
 for(const [title,bytes] of [['scan.pdf',pdf()],['slides.pptx',zip([['ppt/slides/slide1.xml','<p:sld><p:pic/></p:sld>']])]]){
  const result=await server.processSourceDocument(title,'',bytes,options);assert.equal(result.readable,false);assert.match(result.reason,/pdftoppm and tesseract/);assert.match(result.reason,/Install Poppler and Tesseract/);assert.equal(result.reading.partial,true);
 }
});
function ocrMock({failPage=0}={}){
 const calls=[],directories=new Set();let page;
 return {calls,directories,options:{tools:{pdftoppm:'fixture-pdf',tesseract:'fixture-ocr'},run:async(exe,args,opts)=>{
  calls.push([exe,args]);if(args[0]==='-v' || args[0]==='--version')return {stdout:'fixture version'};
  assert.ok(opts.timeout>0);assert.ok(opts.timeout<=server.readerLimits.OCR_PAGE_TIMEOUT_MS);
  if(exe==='fixture-pdf'){page=Number(args[1]);directories.add(path.dirname(args.at(-1)));assert.ok(args.includes('2200'));fs.writeFileSync(args.at(-1)+'.png','fixture');return {stdout:''};}
  if(page===failPage)throw Error('fixture timeout');return {stdout:`OCR page ${page} explains that a measurement must be checked before drawing conclusions.`};
 }}};
}
test('PDF OCR preserves native text, visits later pages, reports progress and cleans temporary images',async()=>{
 const mock=ocrMock(),progress=[];const result=await server.processSourceDocument('scan.pdf','',pdf(['Native first page facts.','','']),{...mock.options,onProgress:message=>progress.push(message)});
 assert.match(result.text,/Native first page/);assert.match(result.text,/Page 3:[\s\S]*OCR page 3/);assert.equal(result.reading.ocrPagesRead,2);assert.equal(result.reading.pagesRead,3);assert.equal(result.reading.partial,false);assert.equal(progress.length,2);assert.match(progress[1],/page 3 \(2 of 2/);for(const directory of mock.directories)assert.equal(fs.existsSync(directory),false);
});
test('OCR safety limits and per-page failures preserve successful pages and report incomplete coverage',async()=>{
 const original=server.readerLimits.OCR_PAGES;try{server.readerLimits.OCR_PAGES=1;const mock=ocrMock();const result=await server.processSourceDocument('scan.pdf','',pdf(),mock.options);assert.equal(result.reading.ocrPagesRead,1);assert.equal(result.reading.truncated,true);assert.equal(result.reading.partial,true);assert.match(result.reading.limits.join(' '),/1 of 2/);}finally{server.readerLimits.OCR_PAGES=original;}
 const mock=ocrMock({failPage:1}),result=await server.processSourceDocument('scan.pdf','',pdf(),mock.options);assert.match(result.text,/OCR page 2/);assert.equal(result.reading.partial,true);assert.match(result.reading.issues.join(' '),/Page 1: OCR failed or timed out/);for(const directory of mock.directories)assert.equal(fs.existsSync(directory),false);
});
test('image-only slides render through LibreOffice to PDF, use OCR and retain source slide numbers',async()=>{
 const mock=ocrMock();let directory;const result=await server.processSourceDocument('scanned.pptx','',zip([['ppt/slides/slide1.xml','<p:sld><p:pic/></p:sld>'],['ppt/slides/slide2.xml','<a:p><a:t>Native second slide explanation.</a:t></a:p>']]),{...mock.options,converter:'fixture-office',run:async(exe,args,opts)=>{
  if(exe!=='fixture-office')return mock.options.run(exe,args,opts);assert.equal(args[args.indexOf('--convert-to')+1],'pdf');directory=args[args.indexOf('--outdir')+1];fs.writeFileSync(path.join(directory,'slides.pdf'),pdf(['','Native second slide explanation.']));return {stdout:''};
 }});
 assert.match(result.text,/Slide 1: \[OCR\]/);assert.match(result.text,/Slide 2:\nNative second slide/);assert.equal(result.reading.ocrPagesRead,1);assert.equal(result.reading.slidesRead,2);assert.equal(fs.existsSync(directory),false);
});
test('progress delivery streams status and final result, keeps JSON compatibility, and sends no credentials',()=>{
 let output='',headers;const response={writeHead(_status,value){headers=value;},write(value){output+=value;},end(value){output+=value;}};
 const delivery=server.readingDelivery(response,true);delivery.onProgress('OCR file.pdf: page 1 (1 of 2 selected pages)');delivery.finish({title:'file.pdf',text:'Actual study text',readable:true});assert.equal(headers['Content-Type'],'application/x-ndjson');const lines=output.trim().split('\n').map(JSON.parse);assert.match(lines[0].progress,/page 1/);assert.equal(lines[1].result.readable,true);assert.doesNotMatch(output,/token|Authorization/);
 output='';const plain=server.readingDelivery(response,false);plain.onProgress('Ignored');plain.finish({text:'result'});assert.equal(headers['Content-Type'],'application/json; charset=utf-8');assert.equal(JSON.parse(output).text,'result');
});
test('browser parses split progress streams, renders extraction coverage, and rejects interrupted reading',async()=>{
 const {JSDOM}=require('jsdom');const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://127.0.0.1:4177',runScripts:'outside-only'});
 try{const w=dom.window;w.TextDecoder=TextDecoder;w.fetch=async()=>({ok:true,json:async()=>({})});w.eval(['source-quality.js','source-index.js','tutor-core.js','practice-core.js','app.js','practice-ui.js','tutor-ui.js'].map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('\n'));
  const progress=[];const stream=new ReadableStream({start(c){for(const piece of ['{"progress":"OCR page ', '1"}\n{"result":{"text":"facts","readable":true},"status":200}\n'])c.enqueue(new TextEncoder().encode(piece));c.close();}});
  const value=await w.readFileResponse(new Response(stream,{headers:{'content-type':'application/x-ndjson'}}),message=>progress.push(message));assert.equal(value.text,'facts');assert.deepEqual(progress,['OCR page 1']);
  await assert.rejects(w.readFileResponse(new Response('{"progress":"OCR page 1"}\n',{headers:{'content-type':'application/x-ndjson'}})),/stopped before completion/);
  assert.match(w.sourceReadingDetails({reading:{characters:50,pagesRead:3,totalPages:3,ocrPagesRead:1,ocrPagesAttempted:2,partial:true,truncated:true,limits:['OCR_PAGES']}}),/Partial extraction[\s\S]*OCR_PAGES/);
 }finally{dom.window.close();}
});

 test('standalone image OCR uses configured tools with cleanup and explicit errors',async()=>{
  let directory;
  const result=await server.processSourceDocument('photo.png','image/png',Buffer.from('fixture'),{tools:{tesseract:'fixture-ocr'},run:async(_exe,args)=>{if(args[0]==='--version')return {stdout:'version'};directory=path.dirname(args[0]);return {stdout:'The mean is the sum of the values divided by their count.'};}});
  assert.equal(result.readable,true);assert.equal(result.extractor,'tesseract');assert.equal(fs.existsSync(directory),false);
  const missing=await server.processSourceDocument('photo.png','image/png',Buffer.from('fixture'),{tools:{tesseract:false}});assert.match(missing.reason,/TESSERACT_PATH/);
 });

test('slide citations follow presentation order rather than internal filenames',async()=>{
 const result=await server.processSourceDocument('reordered.pptx','',zip([
  ['ppt/presentation.xml','<p:presentation><p:sldIdLst><p:sldId r:id="r2"/><p:sldId r:id="r1"/></p:sldIdLst></p:presentation>'],
  ['ppt/_rels/presentation.xml.rels','<Relationships><Relationship Id="r1" Target="slides/slide1.xml"/><Relationship Id="r2" Target="slides/slide2.xml"/></Relationships>'],
  ['ppt/slides/slide1.xml','<a:p><a:t>This explanation appears second in the actual presentation.</a:t></a:p>'],
  ['ppt/slides/slide2.xml','<a:p><a:t>This explanation appears first in the actual presentation.</a:t></a:p>'],
 ]));
 assert.match(result.text,/Slide 1:\nThis explanation appears first/);assert.match(result.text,/Slide 2:\nThis explanation appears second/);
});

test('OCR character budget stops before another page and reports only retained OCR pages',async()=>{
 const original=server.readerLimits.OCR_CHARS;
 const text='OCR page 1 explains that a measurement must be checked before drawing conclusions.';
 try{server.readerLimits.OCR_CHARS=text.length;const mock=ocrMock();const result=await server.processSourceDocument('scan.pdf','',pdf(),mock.options);assert.equal(result.reading.ocrPagesRead,1);assert.equal(result.reading.ocrPagesAttempted,1);assert.match(result.reading.limits.join(' '),/OCR_CHARS/);assert.equal(result.reading.partial,true);assert.doesNotMatch(result.text,/OCR page 2/);}finally{server.readerLimits.OCR_CHARS=original;}
});
