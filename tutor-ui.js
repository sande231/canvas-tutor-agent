/* Module-grounded guides and conversations. Chat stays in memory, never in credential storage. */
let activeTutorChat=null;
let tutorChatInstance=0;
const tutorConversations=new Map();
function cancelTutorChat(){activeTutorChat?.abort();}
function assertStudyGuide(result){
  const guide=TutorCore.normalizeGuide(result?.guide,{citations:true});
  if(!Object.values(guide).some(rows=>rows.length))throw Error('No study-guide sections with source citations were returned. Try again.');
  for(const key of Object.keys(TutorCore.sections))if(!Array.isArray(result.guide[key]) || guide[key].length!==result.guide[key].length)throw Error('Study guide contains an invalid section or citation. Try again.');
}
async function generateStudyGuide(payload,{signal,onProgress=()=>{}}={}){
  const index=payload.index;
  if(!index?.concepts?.length)throw Error('Read and index the module before making a study guide.');
  // Unlike a deck, a guide covers every available indexed concept, including the last source.
  const chosen=selectIndexedConcepts(index,index.concepts.length),groups=groupIndexedConcepts(chosen,index);
  const guide=TutorCore.emptyGuide(),warnings=[],covered=new Set();let completed=0;
  for(const [i,concepts] of groups.entries()){
    if(signal?.aborted){warnings.push('Guide creation canceled. Completed sections were kept.');break;}
    onProgress(covered.size,i+1,false);
    const ids=new Set(concepts.flatMap(c=>c.evidenceIds));
    const passages=index.plan.batches.flat().filter(p=>ids.has(p.id));
    const sourceIds=new Set(passages.map(p=>p.sourceId));
    try{
      const result=await fetchAiTutorResult({mode:'study',courseId:payload.courseId,moduleId:payload.moduleId,courseName:payload.courseName,moduleName:payload.moduleName,difficulty:payload.difficulty,count:concepts.length,concepts,passages,sources:index.plan.sources.filter(s=>sourceIds.has(s.id))},{signal});
      if(signal?.aborted)throw Error('Guide creation canceled. Completed sections were kept.');
      assertStudyGuide(result);
      for(const key of Object.keys(guide))for(const row of result.guide[key]){
        if(!concepts.some(c=>c.id===row.conceptId && c.evidenceIds.includes(row.evidenceId)))throw Error('Study guide returned evidence outside the selected concepts.');
        const p=passages.find(p=>p.id===row.evidenceId);
        if(!p || row.evidence!==p.text || row.sourceId!==p.sourceId)throw Error('Study guide returned changed source evidence.');
      }
      for(const key of Object.keys(guide))for(const row of result.guide[key]){
        const duplicate=guide[key].some(old=>old.conceptId===row.conceptId && practiceItemKey(old.title+' '+old.text)===practiceItemKey(row.title+' '+row.text));
        if(!duplicate)guide[key].push(row);
        if(key==='keyConcepts')covered.add(row.conceptId);
      }
      completed++;warnings.push(...(result.warnings || []));
    }catch(error){warnings.push(`Guide part ${i+1}: ${error.message}`);if(signal?.aborted)break;}
  }
  const rows=Object.values(guide).flat(),coverage=indexedGenerationCoverage(index,rows);
  const shortfall=completed<groups.length || covered.size<chosen.length;
  return {guide,flashcards:[],mcq:[],keyPoints:[],madeCount:rows.length,coverage,warnings,shortfall,
    notice:`Study guide covers ${covered.size} of ${chosen.length} indexed concepts across ${coverage.sourcesUsed} of ${coverage.totalSources} readable sources. ${completed} of ${groups.length} guide parts completed.${shortfall?' Partial guide: some concepts or parts are missing. Retry generation to fill the gaps.':''}`};
}
function renderStudyGuide(course,module,result){
  const guide=TutorCore.normalizeGuide(result.guide,{citations:true});
  return `<article class="study-guide"><h3>${escapeHtml(module.name)} — Study guide</h3><p>${escapeHtml(course.name)}</p><p role="${result.shortfall?'alert':'status'}">${escapeHtml(result.notice || 'Saved study guide')} ${escapeHtml((result.warnings || []).join(' '))}</p>
    ${result.coverage?.mode==='quick'?'<p role="status">Quick index: this guide covers sampled passages, not every page.</p>':''}
    ${Object.entries(TutorCore.sections).map(([key,label])=>`<section><h3>${label}</h3>${guide[key].length?`<${key==='studyOrder'?'ol':'ul'}>${guide[key].map(row=>`<li>${key==='checkYourself'?`<details><summary>${escapeHtml(row.title)}</summary><p class="source-prose">${escapeHtml(row.text)}</p></details>`:`<strong>${escapeHtml(row.title)}</strong><p class="source-prose">${escapeHtml(row.text)}</p>`}${aiSourceCitation(row)}</li>`).join('')}</${key==='studyOrder'?'ol':'ul'}>`:'<p>No supported material was returned for this section; no examples or facts were invented.</p>'}</section>`).join('')}
    <p>Guide generation uses every available indexed concept; the card-count preference does not limit it.</p><button type="button" data-ai-tutor-mode="study">Generate guide again</button><button type="button" data-open-module-chat>Ask the tutor about this module</button></article>`;
}
function tutorPicker(course,modules,selected){
  return `<label>Module <select data-tutor-module>${modules.map(m=>`<option value="${escapeHtml(m.id)}" ${String(m.id)===String(selected)?'selected':''}>${escapeHtml(m.name)}</option>`).join('')}</select></label><button type="button" data-open-tutor-module ${modules.length?'':'disabled'}>Open module tutor</button>`;
}
function bindTutorPicker(course,modules){responseBody.querySelector('[data-open-tutor-module]')?.addEventListener('click',()=>{const id=responseBody.querySelector('[data-tutor-module]').value;const module=modules.find(m=>String(m.id)===id);if(module)openModuleTutor(course,module);});}
function renderTutorTab(context){
  const {course,modules}=context;
  showResponse('Ask the tutor',`<p>Choose a module to ask questions or create a cited study guide.</p>${renderAiStatus()}${tutorPicker(course,modules)}${modules.length?'':'<p>No modules available. Saved practice remains available from the sidebar.</p>'}`);
  refreshAiStatus(responseBody);bindTutorPicker(course,modules);
}
async function openModuleTutor(course,module){
  const fresh=await hydrateSelectedModule(course,[module],module.id,'Reading module for the tutor');
  if(fresh && moduleRequestCurrent(fresh))showModuleTutor(course,fresh);
}
function showModuleTutor(course,module){
  cancelTutorChat();
  const modules=typeof activeCourseContext!=='undefined' && String(activeCourseContext?.course.id)===String(course.id)?activeCourseContext.modules:[module];
  const ready=Boolean(module.index?.concepts?.length);
  showResponse('Ask the tutor',`<h3>${escapeHtml(module.name)}</h3>${tutorPicker(course,modules,module.id)}${renderAiStatus()}
    <p>${ready?'Ask questions using this module’s indexed passages.':'Read and index this module to prepare its passages for questions and a study guide.'}</p>
    <button type="button" data-index-for-chat>${ready?'Read / update index':'Read and index module'}</button><button type="button" data-ai-tutor-mode="study">Create study guide</button>
    ${module.generated?.study?.result?.guide?'<button type="button" data-open-guide>Open saved study guide</button>':''}
    <div data-module-chat></div>${renderModuleIndex(module.index)}${moduleCoverage(module)}`);
  bindTutorPicker(course,modules);bindModuleNoteActions(course,module);bindModuleIndex(course,module,'chat');
  responseBody.querySelector('[data-index-for-chat]').onclick=()=>runAiTutor(course,module,'chat');
  responseBody.querySelector('[data-open-guide]')?.addEventListener('click',()=>{
    showResponse('Study guide',renderStudyGuide(course,module,module.generated.study.result));bindModuleNoteActions(course,module);
  });
  mountTutorChat(responseBody.querySelector('[data-module-chat]'),{course,module,disabled:!ready});
}
function bindTutorGuideActions(course,module){
  responseBody.querySelector('[data-open-module-chat]')?.addEventListener('click',()=>openModuleTutor(course,module));
}
const itemTutorLabels={explain:'Explain this',simplify:'Explain it more simply',example:'Give me another example',quiz:'Quiz me on this'};
function itemTutorButtons(index){return `<div class="item-tutor" data-item-tutor="${index}"><div class="practice-actions">${Object.entries(itemTutorLabels).map(([key,label])=>`<button type="button" data-item-action="${key}">${label}</button>`).join('')}</div><div data-item-chat></div></div>`;}
function bindItemTutor(root,course,module,items){
  root.querySelectorAll('[data-item-tutor]').forEach(panel=>{
    if(panel.dataset.bound)return;panel.dataset.bound='true';
    const entry=items[Number(panel.dataset.itemTutor)],item=entry?.item || entry;
    if(!item)return;
    panel.querySelectorAll('[data-item-action]').forEach(button=>button.onclick=()=>{
      const target=panel.querySelector('[data-item-chat]');
      mountTutorChat(target,{course,module:{...module,id:entry?.moduleId ?? module.id},item,initialAction:button.dataset.itemAction});
      target.querySelector('textarea')?.focus();
    });
  });
}
function mountTutorChat(root,{course,module,item,disabled=false,initialAction}){
  cancelTutorChat();
  const key=JSON.stringify([course.id,module.id,item?.evidenceId || module.index?.plan?.signature || '',item?.front || item?.question || 'module']);
  if(!tutorConversations.has(key))tutorConversations.set(key,{turns:[],mode:'explain',draft:''});
  const state=tutorConversations.get(key),version=moduleRequestVersion,instance=String(++tutorChatInstance);
  root.dataset.chatInstance=instance;
  let controller,busy=false,lastQuestion='',lastAction='ask';
  const current=()=>root.isConnected && version===moduleRequestVersion && root.dataset.chatInstance===instance;
  function draw(){
    root.innerHTML=`<section class="tutor-chat"><h3>${item?'Ask about this item':'Ask about this module'}</h3><p>Uses up to 8 relevant passages and the last 6 conversation turns. Conversation stays in this tab. ${module.index?.plan?.mode==='quick'?'The current index samples the files.':''}</p>
      <div class="chat-turns" role="log" aria-live="polite">${state.turns.map(turn=>turn.role==='user'?`<p><strong>You:</strong> ${escapeHtml(turn.content)}</p>`:`<article><strong>Tutor:</strong>${turn.reply.supported?turn.reply.parts.map(part=>`<p class="source-prose">${escapeHtml(part.text)}</p>${aiSourceCitation(part)}`).join(''):`<p>${escapeHtml(turn.reply.message)}</p>`}</article>`).join('')}</div>
      <form data-chat-form><label>Teaching style <select data-chat-mode><option value="explain" ${state.mode==='explain'?'selected':''}>Just explain</option><option value="hints" ${state.mode==='hints'?'selected':''}>Guide me with hints</option></select></label><label>Your question <textarea data-chat-question maxlength="4000" rows="3" required ${disabled?'disabled':''}>${escapeHtml(state.draft)}</textarea></label>
      <button type="submit" data-chat-send ${disabled?'disabled':''}>Ask tutor</button><button type="button" data-chat-reveal ${disabled?'disabled':''}>Reveal answer</button><button type="button" data-chat-cancel hidden>Cancel</button><button type="button" data-chat-clear>New conversation</button></form><p role="status" data-chat-status>${disabled?'Read and index the module first.':''}</p><p role="alert" data-chat-error></p></section>`;
    root.querySelector('[data-chat-mode]').onchange=event=>{controller?.abort();state.mode=event.target.value;};
    root.querySelector('[data-chat-question]').oninput=event=>{state.draft=event.target.value;};
    root.querySelector('[data-chat-form]').onsubmit=event=>{event.preventDefault();ask(root.querySelector('[data-chat-question]').value,'ask',false);};
    root.querySelector('[data-chat-reveal]').onclick=()=>{const question=lastQuestion || state.turns.filter(t=>t.role==='user').at(-1)?.content;if(question)ask(question,lastAction,true);else root.querySelector('[data-chat-error]').textContent='Ask a question first.';};
    root.querySelector('[data-chat-clear]').onclick=()=>{controller?.abort();state.turns=[];state.draft='';lastQuestion='';draw();};
  }
  async function ask(question,action='ask',reveal=false){
    if(disabled || busy || !question.trim())return;
    if(question.length>4000){root.querySelector('[data-chat-error]').textContent='Keep the question under 4,000 characters.';return;}
    busy=true;state.draft=question;lastQuestion=question;lastAction=action;
    controller=new AbortController();activeTutorChat=controller;
    const observer=new MutationObserver(()=>{if(!root.isConnected)controller.abort();});observer.observe(document.body,{childList:true,subtree:true});
    const send=root.querySelector('[data-chat-send]'),cancel=root.querySelector('[data-chat-cancel]');send.disabled=true;cancel.hidden=false;cancel.onclick=()=>controller.abort();
    root.querySelector('[data-chat-status]').textContent='Finding relevant passages and asking the tutor…';root.querySelector('[data-chat-error]').textContent='';
    try{
      const status=await fetchAiStatus();if(!current() || controller.signal.aborted)return;
      if(!status.configured)throw Error('AI tutor is not configured. Saved practice and source reading still work. Add the key privately in the server configuration to ask new questions.');
      const followup=question.trim().split(/\s+/).length<6;
      const query=question+(followup?' '+state.turns.filter(t=>t.role==='user').slice(-2).map(t=>t.content).join(' '):'');
      const passages=item?[TutorCore.itemPassage(item)].filter(Boolean):TutorCore.retrievePassages(module.index,query);
      const sources=item?[{id:item.sourceId,title:item.source}]:module.index.plan.sources.filter(s=>passages.some(p=>p.sourceId===s.id));
      const history=state.turns.slice(-6).map(t=>({role:t.role,content:t.content}));
      const reply=await fetchAiTutorResult({courseId:course.id,moduleId:module.id,question,action,teachingMode:state.mode,reveal,passages,sources,history},{signal:controller.signal,endpoint:'/api/ai-chat'});
      if(!current() || controller.signal.aborted)return;
      if(typeof reply.supported!=='boolean' || !Array.isArray(reply.parts) || (reply.supported && (!reply.parts.length || reply.parts.some(p=>!passages.some(original=>original.id===p.evidenceId && original.text===p.evidence && original.sourceId===p.sourceId) || typeof p.text!=='string' || !p.text.trim()))))throw Error('Tutor returned an invalid source citation. Please try again.');
      if(!reply.supported)reply.message='I could not find that answer in your course files among the passages searched. Try a more specific question or read and index the full module.';
      state.turns.push({role:'user',content:question},{role:'assistant',content:reply.supported?reply.parts.map(p=>p.text).join('\n'):reply.message,reply});state.draft='';draw();
      root.querySelector('[data-chat-status]').textContent=`Searched ${passages.length} passages. ${reply.supported?'Answer includes source citations.':'No supported answer found.'}`;
    }catch(error){if(current())root.querySelector('[data-chat-error]').textContent=controller.signal.aborted?'Tutor request canceled. Your question is kept.':error.message;}
    finally{observer.disconnect();busy=false;if(activeTutorChat===controller)activeTutorChat=null;if(current()){root.querySelector('[data-chat-send]').disabled=disabled;root.querySelector('[data-chat-cancel]').hidden=true;}}
  }
  draw();
  if(initialAction){if(initialAction==='quiz')state.mode='hints';root.querySelector('[data-chat-mode]').value=state.mode;ask(`${itemTutorLabels[initialAction]}: ${item.front || item.question}`,initialAction,false);}
}
