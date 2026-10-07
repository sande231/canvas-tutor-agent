/* Shared study-guide contracts and local passage retrieval. No network or credentials. */
const TutorCore = (() => {
  const sections={overview:'Overview',keyConcepts:'Key concepts',keyTerms:'Key terms',workedExamples:'Worked examples',commonMistakes:'Common mistakes',checkYourself:'Check yourself',studyOrder:'Suggested study order'};
  const text=v=>typeof v==='string' && Boolean(v.trim());
  function emptyGuide(){return Object.fromEntries(Object.keys(sections).map(key=>[key,[]]));}
  function normalizeGuide(raw,{citations=false}={}) {
    const guide=emptyGuide();
    for(const key of Object.keys(sections))guide[key]=(Array.isArray(raw?.[key])?raw[key]:[]).flatMap(item=>{
      if(!item || ![item.title,item.text,item.conceptId,item.evidenceId].every(text))return [];
      if(citations && ![item.sourceId,item.source,item.section,item.evidence].every(text))return [];
      return [Object.fromEntries(['title','text','conceptId','evidenceId','sourceId','source','section','evidence'].filter(k=>text(item[k])).map(k=>[k,item[k].trim()]))];
    });
    return guide;
  }
  function guideSchema(){
    const props=Object.fromEntries(['title','text','conceptId','evidenceId'].map(k=>[k,{type:'string'}]));
    const item={type:'object',properties:props,required:Object.keys(props),additionalProperties:false};
    const properties=Object.fromEntries(Object.keys(sections).map(k=>[k,{type:'array',items:item}]));
    return {type:'json_schema',name:'module_study_guide',strict:true,schema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}};
  }
  const stop=new Set('a an the of for to in on and or is are was were be been being what why how when where which who does do did can could would should me my you your this that these those it its please explain more simply give another example answer question tell about from with as by at'.split(' '));
  function words(text){return (String(text).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}_+#]+/gu)||[]).filter(w=>!stop.has(w));}
  function retrievePassages(index,question,{limit=8,maxCharacters=12000}={}) {
    const all=[...new Map((index?.plan?.batches || []).flat().map(p=>[p.id,p])).values()];
    const terms=[...new Set(words(question))];if(!terms.length)return [];
    const docs=all.map(p=>({p,tokens:words(p.text)}));
    const average=docs.reduce((n,d)=>n+d.tokens.length,0)/Math.max(1,docs.length);
    const frequencies=new Map(terms.map(term=>[term,docs.filter(d=>d.tokens.includes(term)).length]));
    const ranked=docs.map(({p,tokens})=>{
      let score=0;
      for(const term of terms){const tf=tokens.filter(t=>t===term).length;if(!tf)continue;const df=frequencies.get(term);const idf=Math.log(1+(docs.length-df+.5)/(df+.5));score+=idf*tf*2.2/(tf+1.2*(.25+.75*tokens.length/Math.max(1,average)));}
      return {p,score};
    }).filter(d=>d.score>0).sort((a,b)=>b.score-a.score || a.p.id.localeCompare(b.p.id));
    const selected=[];let size=0;
    for(const {p} of ranked){if(selected.length>=limit)break;if(size+p.text.length>maxCharacters)continue;selected.push(p);size+=p.text.length;}
    return selected;
  }
  function itemPassage(item){
    const number=Number(String(item.evidenceId || '').match(/:p(\d+):/)?.[1]);
    if(!Number.isInteger(number) || ![item.evidenceId,item.sourceId,item.evidence,item.section].every(text))return null;
    return {id:item.evidenceId,sourceId:item.sourceId,number,section:item.section,text:item.evidence};
  }
  return {sections,emptyGuide,normalizeGuide,guideSchema,retrievePassages,itemPassage};
})();
if(typeof module!=='undefined' && module.exports)module.exports=TutorCore;
