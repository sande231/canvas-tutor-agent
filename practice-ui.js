/* Browser practice sessions. Persist only allowlisted study data through PracticeCore. */
const practiceMemory = new Map();
const practiceViews = new Map();
let practiceViewNumber = 0;
let practiceStorageWarning = '';
function practiceRead(courseId,moduleId) {
  const key=PracticeCore.storageKey(courseId,moduleId);
  if(practiceMemory.has(key))return practiceMemory.get(key);
  let saved;
  try {saved=PracticeCore.readSaved(localStorage,courseId,moduleId);} catch {saved=PracticeCore.normalizeSaved(null);}
  practiceMemory.set(key,saved);return saved;
}
function practiceWrite(courseId,moduleId,saved) {
  const clean=PracticeCore.normalizeSaved(saved);
  practiceMemory.set(PracticeCore.storageKey(courseId,moduleId),clean);
  let ok=false;
  try{ok=PracticeCore.writeSaved(localStorage,courseId,moduleId,clean);}catch{}
  practiceStorageWarning=ok?'':'This browser could not save your practice (storage blocked or full). Keep this tab open; export cards before leaving.';
  document.querySelectorAll('[data-practice-storage]').forEach(p=>{p.textContent=practiceStorageWarning;p.hidden=!practiceStorageWarning;});
  return ok;
}
function saveGeneratedPractice(course,module,mode,result) {
  const saved=practiceRead(course.id,module.id);
  saved.courseName=course.name;saved.moduleName=module.name;
  const at=Date.now();saved.sets[mode]={at,result};
  // A new set starts a new quiz. Old card boxes and concept outcomes remain.
  delete saved.drafts[mode];
  practiceWrite(course.id,module.id,saved);
  return at;
}
function restoreGeneratedPractice(course,module) {
  const saved=practiceRead(course.id,module.id);
  module.generated={...saved.sets,...module.generated};
  return module;
}
function practiceResult(courseId,moduleId,item,correct) {
  const saved=practiceRead(courseId,moduleId);
  saved.concepts[item.conceptId]=PracticeCore.recordConcept(saved.concepts[item.conceptId],correct,item.front || item.question);
  practiceWrite(courseId,moduleId,saved);
}
function preferredPracticeConcepts(payload) {
  const performance=practiceRead(payload.courseId,payload.moduleId).concepts;
  const index={...payload.index,concepts:payload.index.concepts.map(c=>({...c,importance:c.importance+(PracticeCore.isWeak(performance[c.id])?3:0)}))};
  return selectIndexedConcepts(index,payload.count).map(c=>({...c,importance:payload.index.concepts.find(original=>original.id===c.id).importance}));
}
function renderPracticeSession(course,module,result,mode,entries) {
  const key=String(++practiceViewNumber);
  practiceViews.clear();
  practiceViews.set(key,{course,module,result,mode,entries});
  return `<section class="practice-session" data-practice-view="${key}"><p role="status">Preparing practice…</p></section>`;
}
function shuffledPractice(values,seed) {
  let state=2166136261;
  for(const ch of seed)state=Math.imul(state^ch.charCodeAt(0),16777619)>>>0;
  const rows=[...values];
  for(let i=rows.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=state%(i+1);[rows[i],rows[j]]=[rows[j],rows[i]];}
  return rows;
}
function storageNotice() {return `<p data-practice-storage role="alert" ${practiceStorageWarning?'':'hidden'}>${escapeHtml(practiceStorageWarning)}</p>`;}
function bindPracticeSessions() {
  responseBody.querySelectorAll('[data-practice-view]').forEach(root=>{
    if(root.dataset.bound)return;root.dataset.bound='true';
    const view=practiceViews.get(root.dataset.practiceView);if(!view)return;
    if(view.mode==='mcq')mountPracticeQuiz(root,view);else mountPracticeCards(root,view);
  });
}
function mountPracticeCards(root,{course,module,result}) {
  const cards=result.flashcards.map(c=>PracticeCore.normalizeItem(c,true,{legacy:true})).filter(Boolean);
  let queue=[],flipped=false,reviewed=0;
  const endOfToday=()=>{const date=new Date();date.setHours(23,59,59,999);return date.getTime();};
  const due=()=>cards.filter(c=>(practiceRead(course.id,module.id).boxes[PracticeCore.itemId(c)]?.due || 0)<=endOfToday());
  const begin=(all=false)=>{queue=[...(all?cards:due())];flipped=false;reviewed=0;draw();root.querySelector('[data-flip]')?.focus();};
  function mark(known) {
    if(!flipped || !queue.length)return;
    const card=queue.shift(),saved=practiceRead(course.id,module.id),key=PracticeCore.itemId(card);
    saved.boxes[key]=PracticeCore.moveBox(saved.boxes[key],known);
    practiceWrite(course.id,module.id,saved);practiceResult(course.id,module.id,card,known);
    if(!known)queue.push(card);
    reviewed++;flipped=false;draw();
  }
  function flip(){if(!queue.length)return;flipped=!flipped;draw();root.querySelector('[data-flip]')?.focus();}
  function draw() {
    const card=queue[0],box=card && practiceRead(course.id,module.id).boxes[PracticeCore.itemId(card)];
    root.innerHTML=`<h3>Flashcard review</h3>${storageNotice()}<p role="status">${due().length} due today · ${reviewed} reviewed this session · ${queue.length} in this review</p>
      <p>Space: flip · 1: still learning · 2: know it. Missed cards return until you know them.</p>
      ${card?`<p>${escapeHtml(PracticeCore.cardTypes[card.type])} · ${escapeHtml(card.difficulty)} · Box ${box?.box || 1}</p><button type="button" class="review-card ${flipped?'is-flipped':''}" data-flip aria-pressed="${flipped}"><span class="eyebrow">${flipped?'Answer':'Question'}</span><span>${escapeHtml(flipped?card.back:card.front)}</span>${!flipped && card.code?`<code>${escapeHtml(card.code)}</code>`:''}<small>${flipped?'Flip to question':'Flip to answer'}</small></button>
      ${flipped?aiSourceCitation(card):''}<div class="practice-actions"><button type="button" data-learning ${flipped?'':'disabled'}>1 · Still learning</button><button type="button" data-known ${flipped?'':'disabled'}>2 · Know it</button></div>`:'<p role="status">Review complete. Your next review dates are saved.</p>'}
      <div class="practice-actions"><button type="button" data-due>Review due today</button><button type="button" data-all-cards>Review all cards</button><button type="button" data-weak-cards>Practise my weak spots</button><button type="button" data-export>Export CSV for Anki / Quizlet</button></div><p data-review-notice role="status"></p>`;
    root.querySelector('[data-flip]')?.addEventListener('click',flip);
    root.querySelector('[data-learning]')?.addEventListener('click',()=>{mark(false);root.querySelector('[data-flip]')?.focus();});
    root.querySelector('[data-known]')?.addEventListener('click',()=>{mark(true);root.querySelector('[data-flip]')?.focus();});
    root.querySelector('[data-due]').onclick=()=>begin();root.querySelector('[data-all-cards]').onclick=()=>begin(true);
    root.querySelector('[data-weak-cards]').onclick=()=>{
      const performance=practiceRead(course.id,module.id).concepts;
      const weak=cards.filter(c=>PracticeCore.isWeak(performance[c.conceptId]));
      if(!weak.length){root.querySelector('[data-review-notice]').textContent='No weak concepts recorded yet.';return;}
      queue=weak;flipped=false;draw();
    };
    root.querySelector('[data-export]').onclick=()=>{
      const blob=new Blob([PracticeCore.csv(cards)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='canvas-tutor-flashcards.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
  }
  root.addEventListener('keydown',event=>{
    if(event.target.closest('input,textarea,select,summary,a') || event.altKey || event.ctrlKey || event.metaKey || event.repeat)return;
    if(event.code==='Space' && (event.target.matches('[data-flip]') || event.target===root)){event.preventDefault();flip();}
    if(event.key==='1' || event.key==='2'){event.preventDefault();mark(event.key==='2');root.querySelector('[data-flip]')?.focus();}
  });
  begin();
}
function questionInputs(q,i,response,seed) {
  const choices=shuffledPractice(q.choices || [],seed);
  const answer=typeof response==='string'?response:'';
  if(q.choices)return choices.map((choice,n)=>`<label class="quiz-choice"><input type="${q.type==='multi_select'?'checkbox':'radio'}" name="practice-${i}" value="${escapeHtml(choice)}" ${(Array.isArray(response)?response.includes(choice):answer===choice)?'checked':''}> ${escapeHtml(choice)}</label>`).join('');
  if(q.type==='matching') {
    const options=shuffledPractice(q.pairs.map(p=>p.definition),seed);
    return q.pairs.map((p,j)=>`<label>${escapeHtml(p.term)} <select data-match="${j}"><option value="">Choose a definition</option>${options.map(d=>`<option value="${escapeHtml(d)}" ${response?.[j]===d?'selected':''}>${escapeHtml(d)}</option>`).join('')}</select></label>`).join('');
  }
  if(q.type==='ordering') {
    const steps=shuffledPractice(q.steps,seed);
    return q.steps.map((_,j)=>`<label>Step ${j+1} <select data-step="${j}"><option value="">Choose a step</option>${steps.map(d=>`<option value="${escapeHtml(d)}" ${response?.[j]===d?'selected':''}>${escapeHtml(d)}</option>`).join('')}</select></label>`).join('');
  }
  return `<label>Your answer ${q.type==='short_answer'?`<textarea data-answer maxlength="8000" rows="4">${escapeHtml(answer)}</textarea>`:`<input data-answer value="${escapeHtml(answer)}" autocomplete="off">`}</label>`;
}
function mountPracticeQuiz(root,view) {
  const {course,module,result}=view;
  let entries=view.entries || result.mcq.map(item=>({item:PracticeCore.normalizeItem(item,false,{legacy:true}),moduleId:module.id}));
  const allEntries=[...entries];
  const entryKey=e=>JSON.stringify([String(e.moduleId),PracticeCore.itemId(e.item)]);
  const draftKey='mcq';
  let state=practiceRead(course.id,module.id).drafts[draftKey];
  if(state?.itemKeys?.length){const restored=state.itemKeys.map(key=>allEntries.find(e=>entryKey(e)===key));if(restored.every(Boolean))entries=restored;else state=null;}
  if(!state || state.responses.length!==entries.length)state={responses:entries.map(()=>''),results:entries.map(()=>null),position:0,all:false,started:false,finished:false,deadline:0};
  state.shuffleSeed ||= String(Date.now())+'-'+String(Math.random());
  let grading=false,controller;
  const gradingErrors=[];
  const version=moduleRequestVersion;
  const current=()=>root.isConnected && moduleRequestVersion===version;
  function persist(){state.itemKeys=entries.map(entryKey);const saved=practiceRead(course.id,module.id);saved.drafts[draftKey]=state;practiceWrite(course.id,module.id,saved);}
  function capture() {
    root.querySelectorAll('[data-practice-question]').forEach(field=>{
      const i=Number(field.dataset.practiceQuestion),q=entries[i].item;
      if(q.choices){const selected=[...field.querySelectorAll('input:checked')].map(el=>el.value);state.responses[i]=q.type==='multi_select'?selected:selected[0] || '';}
      else if(q.type==='matching' || q.type==='ordering')state.responses[i]=[...field.querySelectorAll('select')].map(el=>el.value);
      else state.responses[i]=field.querySelector('[data-answer]').value;
    });persist();
  }
  async function finish() {
    if(grading)return;
    capture();grading=true;controller=new AbortController();
    const expired=state.deadline && Date.now()>=state.deadline;
    root.querySelector('[data-quiz-status]').textContent=expired?'Time is up. Checking your saved answers…':'Checking answers…';
    root.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);
    const cancel=root.querySelector('[data-cancel-grade]');cancel.hidden=false;cancel.disabled=false;cancel.onclick=()=>controller.abort();
    try {
      for(let i=0;i<entries.length;i++) {
        if(!current() || controller.signal.aborted)break;
        if(state.results[i]?.recorded)continue;
        const {item:q,moduleId}=entries[i],answer=state.responses[i];
        let correct=PracticeCore.scoreAnswer(q,answer),feedback='';
        if(q.type==='short_answer' && String(answer).trim()) {
          try {
            const number=Number(q.evidenceId.match(/:p(\d+):/)?.[1]);
            const grade=await fetchAiTutorResult({question:q,answer,passages:[{id:q.evidenceId,sourceId:q.sourceId,number,section:q.section,text:q.evidence}],sources:[{id:q.sourceId,title:q.source}]},{signal:controller.signal,endpoint:'/api/ai-grade'});
            if(!current() || controller.signal.aborted)break;
            if(typeof grade.correct!=='boolean' || grade.evidenceId!==q.evidenceId || typeof grade.feedback!=='string')throw Error('Invalid grading response. Try again.');
            correct=grade.correct;feedback=grade.feedback;
          }catch(error){if(!current() || controller.signal.aborted)break;state.results[i]=null;gradingErrors.push(error.message);persist();continue;}
        } else if(q.type==='short_answer')correct=false;
        state.results[i]={correct,feedback,recorded:true};
        practiceResult(course.id,moduleId,q,correct);persist();
      }
      if(!current())return;
      state.finished=true;persist();draw();
    }finally{grading=false;}
  }
  function restart(rows) {
    entries=rows;view.entries=rows;
    state={shuffleSeed:String(Date.now())+'-'+String(Math.random()),responses:entries.map(()=>''),results:entries.map(()=>null),position:0,all:state.all,started:false,finished:false,deadline:0};
    persist();draw();
  }
  function draw() {
    const score=PracticeCore.quizScore(state.results);
    root.innerHTML=`<h3>${view.entries?'Practice quiz':'Quiz'}</h3>${storageNotice()}<p data-quiz-status role="status"></p>`;
    if(state.finished) {
      root.insertAdjacentHTML('beforeend',`${gradingErrors.length?`<p role="alert">${escapeHtml([...new Set(gradingErrors)].join(' '))}</p>`:''}<h4 tabindex="-1" data-score>Score: ${score.correct} / ${score.total} (${score.percent}%)</h4>${score.pending?`<p role="alert">${score.pending} answers are awaiting AI grading. This score is provisional; they were not recorded as mistakes.</p><button type="button" data-retry-grade>Retry pending grading</button>`:''}
        <button type="button" data-missed ${score.missed.length?'':'disabled'}>Retry only missed (${score.missed.length})</button><button type="button" data-restart>Retry full set</button>
        <h4>Review mistakes and pending answers</h4>${entries.map(({item:q},i)=>state.results[i]?.correct===true?'':`<article class="mistake-card"><h4>${i+1}. ${escapeHtml(q.question)}</h4><p>Your answer: ${escapeHtml(Array.isArray(state.responses[i])?state.responses[i].join(' · '):state.responses[i] || 'No answer')}</p><p>Correct: ${escapeHtml(q.type==='multi_select'?q.answers.join(' · '):q.type==='ordering'?q.steps.join(' → '):q.type==='matching'?q.pairs.map(p=>p.term+': '+p.definition).join('; '):q.answer)}</p><p>${escapeHtml(q.explanation)}</p>${state.results[i]?.feedback?`<p>AI feedback: ${escapeHtml(state.results[i].feedback)}</p>`:''}${aiSourceCitation(q)}</article>`).join('') || '<p>All correct. Well done!</p>'}
        <details><summary>Review all answers and sources</summary>${entries.map(({item:q},i)=>`<article><h4>${escapeHtml(q.question)}</h4><p>${escapeHtml(q.answer)}</p><p>${escapeHtml(state.results[i]?.feedback || q.explanation)}</p>${aiSourceCitation(q)}</article>`).join('')}</details>`);
      root.querySelector('[data-missed]').onclick=()=>restart(score.missed.map(i=>entries[i]));
      root.querySelector('[data-restart]').onclick=()=>restart(allEntries);
      root.querySelector('[data-retry-grade]')?.addEventListener('click',()=>{state.finished=false;draw();finish();});
      root.querySelector('[data-score]').focus();return;
    }
    if(!state.started) {
      root.insertAdjacentHTML('beforeend',`<p>${entries.length} questions. Choices are shuffled. Unanswered questions count as missed. Short answers use AI grading; other types are marked locally.</p><label>Layout <select data-layout><option value="one" ${state.all?'':'selected'}>One question at a time</option><option value="all" ${state.all?'selected':''}>All on one page</option></select></label><label>Optional timer (minutes; 0 means untimed) <input data-minutes type="number" value="0" min="0" max="180" step="1"></label><button type="button" data-start-quiz>Start quiz</button><button type="button" data-weak-quiz>Practise my weak spots</button>`);
      root.querySelector('[data-start-quiz]').onclick=()=>{
        const input=root.querySelector('[data-minutes]');if(!input.reportValidity())return;
        state.all=root.querySelector('[data-layout]').value==='all';state.deadline=Number(input.value)>0?Date.now()+Number(input.value)*60000:0;state.started=true;persist();draw();root.querySelector('[data-practice-question] input, [data-practice-question] textarea, [data-practice-question] select')?.focus();
      };
      root.querySelector('[data-weak-quiz]').onclick=()=>{
        const weak=entries.filter(e=>PracticeCore.isWeak(practiceRead(course.id,e.moduleId).concepts[e.item.conceptId]));
        if(!weak.length){root.querySelector('[data-quiz-status]').textContent='No weak concepts recorded yet.';return;}
        restart(weak);
      };return;
    }
    state.position=Math.min(state.position,entries.length-1);
    root.insertAdjacentHTML('beforeend',`<p data-time role="status"></p><p>Question ${state.position+1} of ${entries.length}</p>${entries.map(({item:q},i)=>!state.all && i!==state.position?'':`<fieldset class="mcq-card" data-practice-question="${i}"><legend>${i+1}. ${escapeHtml(q.question)}</legend><p>${escapeHtml(PracticeCore.questionTypes[q.type])} · ${escapeHtml(q.difficulty)}</p>${q.code?`<pre><code>${escapeHtml(q.code)}</code></pre>`:''}${questionInputs(q,i,state.responses[i],state.shuffleSeed+PracticeCore.itemId(q))}</fieldset>`).join('')}
      <div class="practice-actions">${!state.all?`<button type="button" data-prev ${state.position===0?'disabled':''}>Previous</button><button type="button" data-next ${state.position>=entries.length-1?'disabled':''}>Next</button>`:''}<button type="button" data-finish>Finish quiz</button><button type="button" data-cancel-grade hidden>Cancel grading</button></div>`);
    root.querySelector('[data-prev]')?.addEventListener('click',()=>{capture();state.position--;persist();draw();root.querySelector('input,textarea,select')?.focus();});
    root.querySelector('[data-next]')?.addEventListener('click',()=>{capture();state.position++;persist();draw();root.querySelector('input,textarea,select')?.focus();});
    root.querySelector('[data-finish]').onclick=finish;
  }
  root.addEventListener('input',()=>{if(!state.finished && state.started && !grading)capture();});
  root.addEventListener('change',()=>{if(!state.finished && state.started && !grading)capture();});
  const interval=setInterval(()=>{
    if(!current()){clearInterval(interval);controller?.abort();return;}
    if(state.started && !state.finished && state.deadline){const seconds=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));const p=root.querySelector('[data-time]');if(p)p.textContent=`Time remaining: ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;if(!seconds && !grading)finish();}
  },1000);
  draw();
}
function courseWeakSpots(course,modules) {
  const rows=modules.flatMap(m=>Object.entries(practiceRead(course.id,m.id).concepts).filter(([,v])=>PracticeCore.isWeak(v)).map(([id,v])=>({id,...v,module:m})));
  return `<section class="weak-spots"><h3>Weak concepts</h3>${rows.length?`<ul>${rows.map(v=>`<li>${escapeHtml(v.label)} · ${escapeHtml(v.module.name)} (${v.wrong} missed)<button type="button" data-weak-module="${escapeHtml(v.module.id)}">Practise my weak spots</button></li>`).join('')}</ul>`:'<p>Complete a quiz or review cards to discover what needs practice.</p>'}</section>`;
}
function bindCourseWeakSpots(course,modules) {
  responseBody.querySelectorAll('[data-weak-module]').forEach(button=>button.onclick=()=>{
    const module=modules.find(m=>String(m.id)===button.dataset.weakModule);restoreGeneratedPractice(course,module);
    const saved=practiceRead(course.id,module.id),weak=item=>PracticeCore.isWeak(saved.concepts[item.conceptId]);
    const questions=(module.generated.mcq?.result.mcq || []).filter(weak),cards=(module.generated.flashcards?.result.flashcards || module.generated.study?.result.flashcards || []).filter(weak);
    if(!questions.length && !cards.length){showResponse('Weak spots','<p>No saved items for these concepts. Generate a new set; weak concepts receive priority.</p>');return;}
    const mode=questions.length?'mcq':'flashcards';delete saved.drafts.mcq;practiceWrite(course.id,module.id,saved);showResponse('Practise my weak spots',renderPracticeSession(course,module,{mcq:questions,flashcards:cards},mode));bindPracticeSessions();
  });
}
function renderExamPicker(course,modules) {
  const available=modules.filter(m=>m.generated?.mcq?.result.mcq.length);
  return `<section class="exam-picker"><h3>Exam mode</h3><p>Mix saved questions from two or more modules. Generate a quiz in each module first.</p>${available.map(m=>`<label class="quiz-choice"><input type="checkbox" data-exam-module value="${escapeHtml(m.id)}"> ${escapeHtml(m.name)} (${m.generated.mcq.result.mcq.length})</label>`).join('') || '<p>No saved quizzes yet.</p>'}<button type="button" data-start-exam ${available.length<2?'disabled':''}>Build mixed exam</button><p data-exam-status role="status"></p></section>`;
}
function bindExamPicker(course,modules) {
  const button=responseBody.querySelector('[data-start-exam]');if(!button)return;
  button.onclick=()=>{
    const selected=[...responseBody.querySelectorAll('[data-exam-module]:checked')].map(el=>el.value);
    if(selected.length<2){responseBody.querySelector('[data-exam-status]').textContent='Select at least two modules.';return;}
    const seen=new Set();
    const entries=shuffledPractice(modules.filter(m=>selected.includes(String(m.id))).flatMap(m=>m.generated.mcq.result.mcq.map(item=>({item,moduleId:m.id}))).filter(({item})=>{const key=JSON.stringify([item.conceptId,item.type]);if(seen.has(key))return false;seen.add(key);return true;}),String(Date.now()));
    const module={id:'exam-'+selected.sort().join('-'),name:'Mixed module exam'};
    const result={mcq:entries.map(e=>e.item),flashcards:[]};
    saveGeneratedPractice(course,module,'mcq',result);
    const saved=practiceRead(course.id,module.id);saved.examModules=entries.map(e=>String(e.moduleId));practiceWrite(course.id,module.id,saved);
    showResponse('Mixed module exam',`<p>${entries.length} questions from ${new Set(entries.map(e=>e.moduleId)).size} of ${selected.length} selected modules. Repeated concepts of the same question type were removed.</p>`+renderPracticeSession(course,module,result,'mcq',entries));bindPracticeSessions();
  };
}
function savedPracticeRecords() {
  const records=[];
  try {
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i),match=key?.match(/^canvasTutor\.practice\.v1\.([^.]+)\.([^.]+)$/);if(!match)continue;
      const courseId=decodeURIComponent(match[1]),moduleId=decodeURIComponent(match[2]),saved=practiceRead(courseId,moduleId);
      if(Object.keys(saved.sets).length)records.push({courseId,moduleId,saved});
    }
  }catch{}
  return records;
}
function showSavedPractice() {
  const records=savedPracticeRecords();
  showResponse('Saved practice',`<p>Study content saved on this browser. No Canvas connection is needed to review it. Short-answer AI feedback still needs the server.</p>${records.map((r,i)=>`<section><h3>${escapeHtml(r.saved.courseName || r.courseId)} · ${escapeHtml(r.saved.moduleName || r.moduleId)}</h3>${Object.keys(r.saved.sets).map(mode=>`<button type="button" data-open-saved="${i}" data-saved-mode="${mode}">${mode==='mcq'?'Quiz':'Flashcards'}</button>`).join('')}</section>`).join('') || '<p>No saved sets yet.</p>'}`);
  responseBody.querySelectorAll('[data-open-saved]').forEach(button=>button.onclick=()=>{
    const r=records[Number(button.dataset.openSaved)],mode=button.dataset.savedMode,result=r.saved.sets[mode].result;
    const entries=mode==='mcq' && r.saved.examModules?.length===result.mcq.length?result.mcq.map((item,i)=>({item,moduleId:r.saved.examModules[i]})):undefined;
    showResponse('Saved practice',`<p><strong>${escapeHtml(r.saved.moduleName || r.moduleId)}</strong> · ${escapeHtml(r.saved.courseName || r.courseId)}</p>`+renderPracticeSession({id:r.courseId,name:r.saved.courseName},{id:r.moduleId,name:r.saved.moduleName},result,mode,entries));bindPracticeSessions();
  });
}
