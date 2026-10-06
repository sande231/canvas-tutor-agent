// Shared, deterministic source indexing. No credentials, network or persistent storage.
function sourceFingerprint(value) {
  // SHA-256 over UTF-8, synchronous so the same passage builder works in both runtimes.
  const input = String(value).toWellFormed();
  const bytes = Array.from(unescape(encodeURIComponent(input)), char => char.charCodeAt(0));
  const length = bytes.length;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(length / 0x20000000), low = (length * 8) >>> 0;
  for (const word of [high,low]) for (let shift=24;shift>=0;shift-=8) bytes.push((word >>> shift) & 255);
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const rotate=(word,n)=>(word>>>n)|(word<<(32-n));
  for(let offset=0;offset<bytes.length;offset+=64){
    const w=new Array(64);
    for(let i=0;i<16;i++)w[i]=(bytes[offset+i*4]<<24)|(bytes[offset+i*4+1]<<16)|(bytes[offset+i*4+2]<<8)|bytes[offset+i*4+3];
    for(let i=16;i<64;i++)w[i]=(w[i-16]+(rotate(w[i-15],7)^rotate(w[i-15],18)^(w[i-15]>>>3))+w[i-7]+(rotate(w[i-2],17)^rotate(w[i-2],19)^(w[i-2]>>>10)))|0;
    let [a,b,c,d,e,f,g,j]=h;
    for(let i=0;i<64;i++){
      const t1=(j+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0;
      const t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))|0;
      [a,b,c,d,e,f,g,j]=[(t1+t2)|0,a,b,c,(d+t1)|0,e,f,g];
    }
    [a,b,c,d,e,f,g,j].forEach((word,i)=>{h[i]=(h[i]+word)|0;});
  }
  return h.map(word=>(word>>>0).toString(16).padStart(8,'0')).join('');
}
function evidencePassageId(sourceId, number, section, text) {
  return `src:${encodeURIComponent(String(sourceId))}:p${number}:${sourceFingerprint(section+'\n'+text)}`;
}
function buildEvidencePassages(sources) {
  return sources.flatMap(source => {
    const passages=[];
    let section='body',pending='';
    const flush=()=>{
      const text=pending.trim().toWellFormed(),number=passages.length+1;
      if(text)passages.push({id:evidencePassageId(source.id,number,section,text),sourceId:String(source.id),number,section,text});
      pending='';
    };
    for(const line of String(source.text || '').split(/\r?\n/)){
      const heading=line.match(/^\s*((?:Slide|Page|Section)\s+\d+)(?:\s*:|\s*$)/i) || line.match(/^\s*(Section:\s*.+)$/i);
      if(heading){flush();section=heading[1];}
      for(const chunk of line.match(/.{1,900}(?:\s|$)|.{1,900}/g)||[]){
        if(pending.length+chunk.length>1100)flush();
        pending+=(pending?'\n':'')+chunk;
      }
    }
    flush();return passages;
  });
}
function normalizedConceptName(name) { return String(name).normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/[–—]/g,'-').replace(/\s+/g,' ').replace(/^[\s.!?,;:]+|[\s.!?,;:]+$/g,''); }
function indexedConceptId(name) { return `concept:${sourceFingerprint(normalizedConceptName(name))}`; }
function createIndexPlan(sources, mode='full') {
  const all=buildEvidencePassages(sources);
  const selected=mode==='quick'?sources.flatMap(source=>{
    const rows=all.filter(p=>p.sourceId===String(source.id));
    return [...new Set([0,Math.floor(rows.length/2),rows.length-1])].filter(i=>i>=0).map(i=>rows[i]).filter(Boolean);
  }):all;
  const batches=[];let current=[],characters=0;
  for(const passage of selected){
    if(current.length && characters+passage.text.length>18000){batches.push(current);current=[];characters=0;}
    current.push(passage);characters+=passage.text.length;
  }
  if(current.length)batches.push(current);
  return {mode,batches,totalPassages:all.length,selectedPassages:selected.length,
    signature:sourceFingerprint(mode+'\n'+all.map(p=>p.id).join('\n')),
    sources:sources.map(s=>({id:String(s.id),title:s.title,characters:s.text.length}))};
}
function mergeIndexedConcepts(concepts) {
  const merged=new Map();
  for(const concept of concepts){
    const name=normalizedConceptName(concept.name);
    if(!name)continue;
    const old=merged.get(name);
    const explanationSource=old && old.importance >= concept.importance ? old : concept;
    merged.set(name,{...explanationSource,id:indexedConceptId(name),supportingEvidenceIds:explanationSource.supportingEvidenceIds || explanationSource.evidenceIds,
      evidenceIds:[...new Set([...(old?.evidenceIds || []),...concept.evidenceIds])]});
  }
  return [...merged.values()];
}
function selectIndexedConcepts(index, count, previous=[]) {
  const passages=new Map(index.plan.batches.flat().map(p=>[p.id,p]));
  const used=new Set(previous.map(c=>c.id)),assigned=new Map();
  for(const c of previous)assigned.set(c.sourceId,(assigned.get(c.sourceId)||0)+1);
  const selected=[];
  while(selected.length<count){
    const candidates=index.plan.sources.map(source=>({source,concept:index.concepts.filter(c=>!used.has(c.id) && c.evidenceIds.some(id=>passages.get(id)?.sourceId===source.id)).sort((a,b)=>b.importance-a.importance || a.name.localeCompare(b.name))[0]})).filter(row=>row.concept);
    if(!candidates.length)break;
    candidates.sort((a,b)=>{
      const x=assigned.get(a.source.id)||0,y=assigned.get(b.source.id)||0;
      // First represent each available source, then allocate proportionally by size.
      return (x===0?0:1)-(y===0?0:1) || b.source.characters/(y+1)-a.source.characters/(x+1) || b.concept.importance-a.concept.importance;
    });
    const {source,concept}=candidates[0];
    // Keep all passages supporting the retained explanation, plus an anchor from the allocated source.
    const evidenceId=concept.evidenceIds.find(id=>passages.get(id)?.sourceId===source.id);
    selected.push({...concept,sourceId:source.id,evidenceIds:[...new Set([...(concept.supportingEvidenceIds || concept.evidenceIds),evidenceId])]});
    used.add(concept.id);assigned.set(source.id,(assigned.get(source.id)||0)+1);
  }
  return selected;
}
function groupIndexedConcepts(concepts, index) {
  const passages=new Map(index.plan.batches.flat().map(p=>[p.id,p]));
  const groups=[];let group=[],ids=new Set(),length=0;
  for(const concept of concepts){
    let added=concept.evidenceIds.filter(id=>!ids.has(id)).reduce((n,id)=>n+(passages.get(id)?.text.length || 0),0);
    if(group.length && (group.length===10 || length+added>20000)){groups.push(group);group=[];ids=new Set();length=0;added=concept.evidenceIds.reduce((n,id)=>n+(passages.get(id)?.text.length || 0),0);}
    if(added>20000)throw Error('A concept needs more evidence than fits in one generation call. Re-index this material with more focused concepts.');
    group.push(concept);concept.evidenceIds.forEach(id=>ids.add(id));length+=added;
  }
  if(group.length)groups.push(group);
  return groups;
}
function indexedGenerationCoverage(index, items) {
  const allowed=new Set(index.concepts.map(c=>c.id));
  const valid=items.filter(item=>allowed.has(item.conceptId));
  return {items:valid.length,sourcesUsed:new Set(valid.map(item=>item.sourceId)).size,totalSources:index.plan.sources.length,
    conceptsAvailable:index.concepts.length,partsIndexed:index.parts.filter(p=>p.status==='complete').length,totalParts:index.parts.length,
    mode:index.plan.mode,selectedPassages:index.plan.selectedPassages,totalPassages:index.plan.totalPassages};
}
if(typeof module!=='undefined')module.exports={sourceFingerprint,evidencePassageId,buildEvidencePassages,normalizedConceptName,indexedConceptId,createIndexPlan,mergeIndexedConcepts,selectIndexedConcepts,groupIndexedConcepts,indexedGenerationCoverage};
