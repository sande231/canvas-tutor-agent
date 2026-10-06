/* Shared practice contracts and pure review logic. No credentials or network access. */
const PracticeCore = (() => {
  const questionTypes = {
    multiple_choice:'Multiple choice', multi_select:'Choose all that apply', true_false:'True or false',
    fill_blank:'Fill in the blank', short_answer:'Short answer (AI feedback)', code_output:'What does this code print?',
    find_bug:'Find the bug', scenario:'Apply a concept', matching:'Match terms', ordering:'Order the steps',
  };
  const cardTypes = {term_definition:'Term → definition',why_how:'Why / how',cloze:'Fill the gap',compare:'Compare A and B',example_concept:'Example → concept',code_meaning:'Code → what it does'};
  const codeTypes = ['code_output','find_bug','code_meaning'];
  const text = v => typeof v === 'string' && Boolean(v.trim());
  const norm = v => String(v ?? '').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  const distinct = a => Array.isArray(a) && a.every(text) && new Set(a.map(norm)).size === a.length;
  const list = (a,min,max) => distinct(a) && a.length >= min && a.length <= max;
  const levels = ['easy','medium','hard'];
  function normalizeItem(raw, card = false, {legacy = false} = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const type = raw.type ?? (legacy ? card ? 'why_how' : 'multiple_choice' : '');
    const difficulty = raw.difficulty ?? (legacy ? 'medium' : '');
    if (!Object.hasOwn(card ? cardTypes : questionTypes,type) || !levels.includes(difficulty)) return null;
    // Explicit field allowlist, also used at the persistence boundary.
    const item = {type,difficulty};
    for (const k of ['conceptId','evidenceId','sourceId','source','section','evidence']) if(text(raw[k])) item[k]=raw[k].trim();
    if (card) {
      if (![raw.front,raw.back].every(text)) return null;
      if (type==='cloze' && !/_{3,}/.test(raw.front)) return null;
      if (type==='code_meaning' && !text(raw.code)) return null;
      Object.assign(item,{front:raw.front.trim(),back:raw.back.trim()});
      if (type==='code_meaning') item.code=raw.code;
      return item;
    }
    if (![raw.question,raw.answer,raw.explanation].every(text)) return null;
    Object.assign(item,{question:raw.question.trim(),answer:raw.answer.trim(),explanation:raw.explanation.trim()});
    if (['multiple_choice','scenario','code_output','find_bug','multi_select','true_false'].includes(type)) {
      const choices = Array.isArray(raw.choices)?raw.choices.map(v=>typeof v==='string'?v.trim():v):[];
      if (!list(choices,type==='true_false'?2:4,type==='multi_select'?6:type==='true_false'?2:4)) return null;
      if (choices.some(c=>/\b(?:all|none) of the above\b/i.test(c))) return null;
      if (type==='multi_select') {
        if (!list(raw.answers,2,choices.length-1) || raw.answers.some(a=>!choices.includes(a))) return null;
        item.answers=[...raw.answers];
      } else {
        const label = item.answer.match(/^([A-D])[.)]?$/i);
        if (legacy && !choices.includes(item.answer) && label) item.answer=choices[label[1].toUpperCase().charCodeAt(0)-65];
        if (!choices.includes(item.answer)) return null;
      }
      if (type==='true_false' && (!choices.includes('True') || !choices.includes('False'))) return null;
      item.choices=choices;
    }
    if (codeTypes.includes(type)) {if(!text(raw.code))return null;item.code=raw.code;}
    if (type==='fill_blank') {
      if (!/_{3,}/.test(item.question) || !list(raw.acceptedAnswers,1,12) || !raw.acceptedAnswers.some(a=>norm(a)===norm(item.answer))) return null;
      item.acceptedAnswers=[...raw.acceptedAnswers];
    }
    if (type==='matching') {
      if (!Array.isArray(raw.pairs) || raw.pairs.length<2 || raw.pairs.length>8 || !distinct(raw.pairs.map(p=>p?.term)) || !distinct(raw.pairs.map(p=>p?.definition))) return null;
      item.pairs=raw.pairs.map(({term,definition})=>({term,definition}));
    }
    if (type==='ordering') {if(!list(raw.steps,2,8))return null;item.steps=[...raw.steps];}
    return item;
  }
  function hasCode(sources = []) {
    return sources.some(s=>/\.(ipynb|py|js|ts|java|c|cpp|r|sql|sh)\b/i.test(s.title || '') || /(?:```|\bdef \w+\(|\bfunction \w+\(|\bprint\(|\bconsole\.log\(|\bSELECT\b.+\bFROM\b)/i.test(s.text || s.summary || ''));
  }
  function selectedTypes(value, card, allowCode) {
    const allowed = Object.keys(card ? cardTypes : questionTypes).filter(k=>allowCode || !codeTypes.includes(k));
    const chosen = Array.isArray(value) ? [...new Set(value.filter(k=>allowed.includes(k)))] : [];
    return chosen.length ? chosen : [card?'why_how':'multiple_choice'];
  }
  function schemas(reference) {
    const str={type:'string'}, arr=items=>({type:'array',items});
    const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
    const base=type=>({type:{type:'string',enum:[type]},difficulty:{type:'string',enum:levels},...reference});
    return {
      flashcards:{anyOf:Object.keys(cardTypes).map(type=>obj({...base(type),front:str,back:str,...(type==='code_meaning'?{code:str}:{})}))},
      mcq:{anyOf:Object.keys(questionTypes).map(type=>{
        const fields={...base(type),question:str,answer:str,explanation:str};
        if (['multiple_choice','multi_select','true_false','scenario','code_output','find_bug'].includes(type)) fields.choices=arr(str);
        if (type==='multi_select')fields.answers=arr(str);
        if (type==='fill_blank')fields.acceptedAnswers=arr(str);
        if (codeTypes.includes(type))fields.code=str;
        if (type==='matching')fields.pairs=arr(obj({term:str,definition:str}));
        if (type==='ordering')fields.steps=arr(str);
        return obj(fields);
      })},
    };
  }
  function scoreAnswer(q, response) {
    if(q.type==='short_answer')return null; // Never silently substitute string matching for model grading.
    if(q.type==='multi_select')return distinct(response) && response.length===q.answers.length && q.answers.every(a=>response.includes(a));
    if(q.type==='fill_blank')return q.acceptedAnswers.some(a=>norm(a)===norm(response));
    if(q.type==='matching')return Array.isArray(response) && response.length===q.pairs.length && q.pairs.every((p,i)=>response[i]===p.definition);
    if(q.type==='ordering')return Array.isArray(response) && response.length===q.steps.length && q.steps.every((p,i)=>response[i]===p);
    return response===q.answer;
  }
  function quizScore(results) {
    const correct=results.filter(r=>r?.correct===true).length;
    const pending=results.filter(r=>r?.correct!==true && r?.correct!==false).length;
    return {correct,total:results.length,pending,percent:results.length?Math.round(correct/results.length*100):0,missed:results.flatMap((r,i)=>r?.correct===false?[i]:[])};
  }
  const retryMissed = (items,results) => quizScore(results).missed.map(i=>items[i]);
  function moveBox(previous, known, now=Date.now()) {
    const box=known?Math.min(5,(Number.isInteger(previous?.box)?previous.box:0)+1):1;
    return {box,due:now+(known?[0,1,3,7,14,30][box]*86400000:0),reviewed:now};
  }
  const itemId = item => JSON.stringify([item.conceptId,item.type,item.evidenceId,item.front || item.question]);
  function recordConcept(old, correct, label, now=Date.now()) {
    return {correct:(old?.correct || 0)+(correct?1:0),wrong:(old?.wrong || 0)+(correct?0:1),lastCorrect:correct,label,lastAt:now};
  }
  const isWeak = v => v && (v.lastCorrect===false || v.wrong>v.correct);
  function normalizeSaved(value) {
    const out={version:1,sets:{},boxes:{},concepts:{},drafts:{}};
    if(!value || typeof value!=='object')return out;
    for(const key of ['courseName','moduleName'])if(text(value[key]))out[key]=value[key];
    if(Array.isArray(value.examModules) && value.examModules.every(text))out.examModules=[...value.examModules];
    for(const mode of ['flashcards','mcq','study']) {
      const saved=value.sets?.[mode];if(!saved || !Number.isFinite(saved.at))continue;
      const result=saved.result;
      const clean={flashcards:[],mcq:[],keyPoints:[],studyPlan:[],summary:''};
      for(const field of ['flashcards','mcq']) clean[field]=(Array.isArray(result?.[field])?result[field]:[]).flatMap(raw=>{
        const item=normalizeItem(raw,field==='flashcards',{legacy:true});
        return item && [item.conceptId,item.source,item.evidence,item.evidenceId,item.sourceId].every(text)?[item]:[];
      });
      clean.keyPoints=(Array.isArray(result?.keyPoints)?result.keyPoints:[]).flatMap(p=>p && [p.text,p.evidence,p.source].every(text)?[Object.fromEntries(['text','conceptId','evidenceId','sourceId','source','section','evidence'].filter(k=>text(p[k])).map(k=>[k,p[k]]))]:[]);
      if(result?.coverage && typeof result.coverage==='object'){clean.coverage={};for(const k of ['items','sourcesUsed','totalSources','conceptsAvailable','partsIndexed','totalParts','selectedPassages','totalPassages'])if(Number.isFinite(result.coverage[k]))clean.coverage[k]=result.coverage[k];clean.coverage.mode=result.coverage.mode==='quick'?'quick':'full';}
      if(text(result?.notice))clean.notice=result.notice;
      clean.shortfall=Boolean(result?.shortfall);
      if(clean.flashcards.length || clean.mcq.length)out.sets[mode]={at:saved.at,result:clean};
    }
    for(const [id,v] of Object.entries(value.boxes || {}))if(Number.isInteger(v?.box)&&v.box>=1&&v.box<=5&&Number.isFinite(v.due))Object.defineProperty(out.boxes,id,{value:{box:v.box,due:v.due,reviewed:Number(v.reviewed)||0},enumerable:true,writable:true,configurable:true});
    for(const [id,v] of Object.entries(value.concepts || {}))if(text(v?.label)&&Number.isSafeInteger(v.correct)&&v.correct>=0&&Number.isSafeInteger(v.wrong)&&v.wrong>=0&&typeof v.lastCorrect==='boolean')Object.defineProperty(out.concepts,id,{value:{label:v.label,correct:v.correct,wrong:v.wrong,lastCorrect:v.lastCorrect,lastAt:Number(v.lastAt)||0},enumerable:true,writable:true,configurable:true});
    // Drafts only contain responses and review state. Never serialize a module or connection object.
    for(const [id,v] of Object.entries(value.drafts || {})) {
      if(!v || typeof v!=='object' || !Array.isArray(v.responses))continue;
      const answer = x => typeof x==='string' ? x : Array.isArray(x) && x.every(y=>typeof y==='string') ? [...x] : '';
      Object.defineProperty(out.drafts,id,{value:{shuffleSeed:typeof v.shuffleSeed==='string'?v.shuffleSeed:'',itemKeys:Array.isArray(v.itemKeys)&&v.itemKeys.every(text)?[...v.itemKeys]:[],responses:v.responses.map(answer),results:(Array.isArray(v.results)?v.results:[]).map(r=>r && typeof r.correct==='boolean'?{correct:r.correct,feedback:typeof r.feedback==='string'?r.feedback:'',recorded:Boolean(r.recorded)}:null),position:Number.isInteger(v.position)&&v.position>=0?v.position:0,all:Boolean(v.all),started:Boolean(v.started),finished:Boolean(v.finished),deadline:Number.isFinite(v.deadline)?v.deadline:0},enumerable:true,writable:true,configurable:true});
    }
    return out;
  }
  function storageKey(course,module) {return `canvasTutor.practice.v1.${encodeURIComponent(course)}.${encodeURIComponent(module)}`;}
  function readSaved(storage,course,module) {try{return normalizeSaved(JSON.parse(storage.getItem(storageKey(course,module))||'null'));}catch{return normalizeSaved(null);}}
  function writeSaved(storage,course,module,value) {try{storage.setItem(storageKey(course,module),JSON.stringify(normalizeSaved(value)));return true;}catch{return false;}}
  function csv(cards) {
    const cell=value=>'"'+String(value).replace(/^[\t\r\n ]*([=+@-])/,'\'$1').replaceAll('"','""')+'"';
    return 'Front,Back,Source\r\n'+cards.map(c=>[c.front+(c.code?'\n'+c.code:''),c.back,`${c.source} · ${c.section || 'body'}: ${c.evidence}`].map(cell).join(',')).join('\r\n');
  }
  return {questionTypes,cardTypes,codeTypes,normalizeItem,hasCode,selectedTypes,schemas,scoreAnswer,quizScore,retryMissed,moveBox,itemId,recordConcept,isWeak,normalizeSaved,storageKey,readSaved,writeSaved,csv};
})();
if(typeof module!=='undefined' && module.exports)module.exports=PracticeCore;
