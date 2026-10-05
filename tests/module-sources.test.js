const test = require('node:test');
const assert = require('node:assert/strict');
const { readPublicResource, validateDestination } = require('../safe-reader');
process.env.EMAIL_DISABLED = '1';
const { processSourceDocument, extractedResource, validateGroundedResult, parseAiTutorJson } = require('../server');
const lookup = async () => [{address: '93.184.216.34', family: 4}];
test('external destinations, redirects and credentials are constrained', async () => {
  for (const url of ['file:///etc/passwd','http://localhost/x','http://user:pass@example.com','https://example.com:8443','http://[::1]']) {
    await assert.rejects(validateDestination(url, lookup));
  }
  await assert.rejects(validateDestination('http://example.com', async () => [{address:'127.0.0.1'}]));
  const headersSeen = [];
  await readPublicResource('https://canvas.example/file', {lookup, token:'fixture-only',canvasOrigin:'https://canvas.example', transport:async (url, address, headers) => {
    headersSeen.push(headers);
    return headersSeen.length === 1 ? {status:302,headers:{location:'https://public.example/doc'}} : {status:200,headers:{},buffer:Buffer.from('Study text')};
  }});
  assert.equal(Boolean(headersSeen[0].Authorization), true);
  assert.equal(Boolean(headersSeen[1].Authorization), false);
  await assert.rejects(readPublicResource('https://public.example', {lookup,transport:async()=>({status:302,headers:{location:'http://localhost/'}})}));
  await assert.rejects(readPublicResource('https://public.example', {lookup,transport:async()=>({status:302,headers:{location:'/loop'}})}), /Too many/);
});
function zip(entries) {
  const locals = [], central = []; let offset = 0;
  for (const [name, text] of entries) {
    const data = Buffer.from(text), filename = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8,6); local.writeUInt16LE(filename.length,26);
    // Sizes are in the central directory (streamed/data-descriptor Office archive).
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(8,8); directory.writeUInt32LE(data.length,20); directory.writeUInt32LE(data.length,24); directory.writeUInt16LE(filename.length,28); directory.writeUInt32LE(offset,42);
    locals.push(local,filename,data); central.push(directory,filename); offset += local.length + filename.length + data.length;
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,...central,end]);
}
function pdf() {
  const stream = 'BT /F1 12 Tf 50 700 Td (Behavioral ethics studies how people make moral decisions.) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let text = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj,index)=>{offsets.push(text.length); text += `${index+1} 0 obj\n${obj}\nendobj\n`;});
  const start = text.length;
  text += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('') + `trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}
test('PDF, DOCX, PPTX, notebook, text and empty document extraction', async () => {
  const pdfResult = await processSourceDocument('ethics.pdf','application/pdf',pdf());
  assert.equal(pdfResult.readable,true); assert.match(pdfResult.text,/Page 1/); assert.match(pdfResult.text,/moral decisions/);
  const docx = await processSourceDocument('ethics.docx','',zip([['word/document.xml','<w:p><w:t>Ethics examines moral decisions.</w:t></w:p>']]));
  assert.equal(docx.readable,true); assert.match(docx.text,/Ethics/);
  const pptx = await processSourceDocument('ethics.pptx','',zip([['ppt/slides/slide1.xml','<a:p><a:t>Bias affects moral decisions.</a:t></a:p>']]));
  assert.match(pptx.text,/Slide 1/);
  const notebook = await processSourceDocument('lesson.ipynb','',Buffer.from(JSON.stringify({cells:[{cell_type:'markdown',source:['Ethics examines moral decisions.']}]})));
  assert.equal(notebook.readable,true);
  assert.equal((await processSourceDocument('empty.txt','text/plain',Buffer.from('  '))).readable,false);
  const text = await processSourceDocument('lesson.txt','text/plain',Buffer.from('Ethics examines moral decisions.'));
  assert.equal(text.readable,true);
  const html = await extractedResource('Article','text/html',Buffer.from('<h1>Ethics</h1><p>Behavioral ethics examines how bias affects moral decisions, including the influence of social pressure and organizational norms.</p><script>bad text</script>'));
  assert.equal(html.readable,true); assert.ok(!html.text.includes('bad text'));
  assert.equal((await extractedResource('Login','text/html',Buffer.from('<input type="password">'))).readable,false);
  assert.equal((await extractedResource('Empty','text/html',Buffer.from('<html></html>'))).readable,false);
});
test('answers must match choices and cite evidence actually present in selected sources', () => {
  const source = {id:'1',title:'Week 4',text:'Behavioral ethics studies moral decision making.'};
  const question = {question:'What does it study?',choices:['moral decisions','space','weather','music'],answer:'moral decisions',explanation:'The reading defines the subject.',sourceId:'1',evidence:'Behavioral ethics studies moral decision making.'};
  const parsed = parseAiTutorJson(JSON.stringify({mcq:[question,{...question,answer:'missing'}],flashcards:[{front:'Ethics?',back:'Moral decisions',sourceId:'different',evidence:question.evidence}]}));
  const validated = validateGroundedResult(parsed,[source]);
  assert.equal(validated.mcq.length,1); assert.equal(validated.mcq[0].source,'Week 4'); assert.equal(validated.flashcards.length,0);
});
test('PowerPoint extraction drops slide-number placeholders and includes linked speaker explanations',async()=>{
 const archive=zip([
  ['ppt/slides/slide1.xml','<p:sp><p:ph type="sldNum"/><a:p><a:t>99</a:t></a:p></p:sp><p:sp><a:p><a:t>Exploratory data analysis</a:t></a:p></p:sp>'],
  ['ppt/slides/_rels/slide1.xml.rels','<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide7.xml"/></Relationships>'],
  ['ppt/notesSlides/notesSlide7.xml','<a:p><a:t>Exploratory data analysis uses summaries and visualizations to identify patterns, missing values and outliers before modeling.</a:t></a:p>']
 ]);
 const extracted=await processSourceDocument('EDA.pptx','',archive);
 assert.match(extracted.text,/Speaker notes: Exploratory data analysis uses/);
 assert.ok(!extracted.text.includes('99'));
});
