const {indexedConceptId}=require('../../source-index');
function fixtureConceptName(p) {return `Passage ${p.sourceId} concept ${String(p.number).padStart(5,'0')}`;}
function fixtureConcepts(passages) {
 return passages.map(p=>({id:indexedConceptId(fixtureConceptName(p)),name:fixtureConceptName(p),explanation:p.text,importance:2,kind:'fact',evidenceIds:[p.id]}));
}
async function fixtureIndexedResponse(url,body,handler) {
 if(url==='/api/ai-index')return {concepts:fixtureConcepts(body.passages)};
 const result=await handler(url,body);
 if(url!=='/api/ai-tutor' || !body.concepts || result?.error)return result;
 for(const key of ['flashcards','mcq','keyPoints']) for(const [i,item] of (result[key]||[]).entries()){
  const concept=body.concepts.find(c=>c.evidenceIds.includes(item.evidenceId)) || body.concepts[i%body.concepts.length];
  item.conceptId ||= concept.id;item.evidenceId ||= concept.evidenceIds[0];
  item.sourceId ||= body.passages.find(p=>p.id===item.evidenceId)?.sourceId;
 }
 return result;
}
module.exports={fixtureConcepts,fixtureConceptName,fixtureIndexedResponse};
