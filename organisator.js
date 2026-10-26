import {summarize,formatPoints} from './scoring.mjs';
const API = 'https://vps.opticore-insights.nl/pubquiz-api/v1';
const root = document.getElementById('organizer');
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token = '';
let actor = '';
try {
  token = localStorage.getItem('pubquiz-beheersleutel') || '';
  actor = localStorage.getItem('pubquiz-organisatornaam') || '';
} catch {}
const secret = new URLSearchParams(location.hash.slice(1)).get('sleutel');
if (secret) {
  token = secret;
  try { localStorage.setItem('pubquiz-beheersleutel',token); } catch {}
  history.replaceState(null,'',location.pathname+location.search);
}
let state;
let tab = 'teams';
let selectedRound = '1';
let selectedTeam = '';
let through = '9';
let includeBonus = false;
let pending = 0;
let dirty = false;
let polling = false;
let lastSync = null;
let toastTimer;
let loadingError = '';
const answerDrafts = new Map();
const modelDrafts = new Map();
const teamDrafts = new Map();
const answerKey = qid => `${selectedTeam}/${selectedRound}/${qid}`;
const modelKey = qid => `${selectedRound}/${qid}`;
function updateDirty(){dirty=!!(answerDrafts.size || modelDrafts.size || teamDrafts.size);saveIndicator();}
const projection = new URLSearchParams(location.search).get('scherm') === 'stand';
if (projection) {
  tab='stand';
  through=new URLSearchParams(location.search).get('ronde') || '9';
  includeBonus=new URLSearchParams(location.search).get('bonus') === '1';
}
function notice(message,error=false) {
  const toast=document.getElementById('toast');
  toast.hidden=false; toast.textContent=message; toast.classList.toggle('error',error);
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>{toast.hidden=true;},error?10000:5000);
}
function confirmAction(title,message,label='Doorgaan') {
  const dialog=document.getElementById('confirm-dialog');
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-message').textContent=message;
  document.getElementById('confirm-button').textContent=label;
  dialog.returnValue=''; dialog.showModal();
  return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));
}
async function api(path,body) {
  const response=await fetch(API+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify({...body,actor})}:{})});
  let data;
  try { data=await response.json(); } catch { throw new Error('De server gaf geen geldig antwoord. Probeer opnieuw.'); }
  if(!response.ok) { const error=new Error(data.error || 'De actie kon niet worden uitgevoerd.'); error.status=response.status; error.data=data; throw error; }
  return data;
}
function activeTeams(){ return state.teams.filter(team=>team.active); }
function currentRound(){return state.rounds.find(round=>round.id===selectedRound);}
function questions(){return state.questions.filter(question=>question.round_id===selectedRound).sort((a,b)=>Number(a.id)-Number(b.id)).map(question=>{const draft=tab==='model'?modelDrafts.get(modelKey(question.id)):null;return draft?{...question,...draft,max_cents:Math.round(Number(draft.max_points)*100),alternatives:draft.alternatives.split('\n').map(x=>x.trim()).filter(Boolean)}:question;});}
function getAnswer(qid){return state.answers.find(answer=>answer.team_id===selectedTeam && answer.round_id===selectedRound && answer.question_id===qid);}
function roundLabel(round){return round.id==='bonus'?'Bonusronde':`Ronde ${round.id} · ${round.title}`;}
function options(items,selected,label){return items.map(item=>`<option value="${esc(item.id)}" ${item.id===selected?'selected':''}>${esc(label(item))}</option>`).join('');}
function nav(){return [['teams','Teams'],['nakijken','Antwoorden & punten'],['stand','Tussenstand'],['model','Antwoordmodel']].map(([id,label])=>`<button class="org-nav-button ${tab===id?'active':''}" data-tab="${id}" ${tab===id?'aria-current="page"':''}>${label}</button>`).join('');}
function saveIndicator(){const node=document.getElementById('sync-status');if(node){node.classList.toggle('unsaved',!!(dirty || pending || loadingError));node.textContent=loadingError?'Verbinding verbroken':pending?'Bezig met opslaan…':dirty?'Er is nog niet-opgeslagen invoer':lastSync?`Gedeeld · bijgewerkt ${lastSync.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Verbinden…';}}
function accessPage(message='Open de gedeelde beheerlink om verder te gaan.') {
  root.innerHTML=`<main class="access-page"><a class="brand" href="./"><span class="brand-mark">PQ</span><span>PUBQUIZ<small>Organisator</small></span></a><p class="eyebrow dark">SAMEN DE QUIZ BIJHOUDEN</p><h1>Het beheer van de quiz</h1><p>${esc(message)}</p><p>Je hebt geen account nodig. Vraag de organisator om de volledige beheerlink. Die geeft toegang tot de teams, antwoorden en scores.</p><a class="button outline" href="./">Terug naar de quiz</a></main>`;
}
function namePage(){
  root.innerHTML=`<main class="access-page"><span class="brand-mark">PQ</span><p class="eyebrow dark">WELKOM BIJ HET QUIZBEHEER</p><h1>Hoe mogen we je noemen?</h1><p>Je naam komt bij je wijzigingen te staan, zodat de andere organisatoren weten wie heeft nagekeken.</p><form id="actor-form"><label for="actor-name">Jouw naam</label><input id="actor-name" name="actor" required maxlength="80" autocomplete="given-name" placeholder="Bijvoorbeeld Thomas"><button class="button primary">Verder naar het beheer →</button></form></main>`;
}
async function refresh(force=false) {
  if(polling || (!force && (dirty || pending || root.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName))))return;
  polling=true;
  try{
    const next=await api('/state');
    const changed=!state || next.revision!==state.revision;
    state=next; lastSync=new Date(); loadingError='';
    if(!selectedTeam || !activeTeams().some(team=>team.id===selectedTeam))selectedTeam=activeTeams()[0]?.id || '';
    if(changed || force)render();else saveIndicator();
  }catch(error){loadingError=error.message;if(!state)accessPage(error.status===401?error.message:'De database is tijdelijk niet bereikbaar. Vernieuw de pagina om opnieuw te verbinden.');saveIndicator();}
  finally{polling=false;}
}
function render(){
  if(!state)return;
  if(projection){root.innerHTML=`<main class="projection"><header><span class="brand">PUBQUIZ · T.V. HEYNKENSORT</span><span id="sync-status"></span></header>${standingsView(true)}</main>`; saveIndicator();return;}
  const view=tab==='teams'?teamsView():tab==='nakijken'?gradingView():tab==='model'?modelView():standingsView();
  root.innerHTML=`<header class="org-header"><a class="brand" href="./"><span class="brand-mark">PQ</span><span>PUBQUIZ<small>Organisator</small></span></a><div class="org-header-right"><span class="actor-badge">${esc(actor)}</span><button class="text-button" data-action="change-actor">Naam wijzigen</button><a class="text-button" href="./" target="_blank" rel="noopener">Quiz openen ↗</a></div></header><div class="org-layout"><aside class="org-sidebar"><p class="eyebrow dark">QUIZADMINISTRATIE</p><nav aria-label="Beheernavigatie">${nav()}</nav><div class="org-sharing"><strong>Samen aan het nakijken</strong><p>Iedereen met de beheerlink werkt in dezelfde database.</p><button class="button outline" data-action="share">Beheerlink kopiëren</button><button class="text-button" data-action="backup">Reservekopie downloaden ↓</button><button class="text-button" data-action="forget">Beheerlink vergeten op dit apparaat</button></div></aside><main class="org-content"><div class="org-sync"><span id="sync-status"></span><button class="text-button" data-action="refresh">Vernieuwen ↻</button></div>${view}</main></div>`;
  saveIndicator();
}
function teamsView(){
  const teams=activeTeams(),archived=state.teams.filter(team=>!team.active);
  return `<div class="org-title"><div><p class="eyebrow dark">DE DEELNEMERS</p><h1>Teams</h1><p>Voeg de teams toe voordat het nakijken begint.</p></div><span class="count-badge">${teams.length} teams</span></div><form id="team-add-form" class="team-add org-panel"><label for="team-name">Teamnaam</label><div><input name="name" id="team-name" required maxlength="80" placeholder="Naam van het team" autocomplete="off"><button class="button primary">Team toevoegen +</button></div></form>${teams.length?`<div class="org-panel team-list">${teams.map((team,index)=>`<div class="team-row"><span class="team-index">${String(index+1).padStart(2,'0')}</span><form class="team-rename" data-id="${team.id}"><label class="sr-only" for="name-${team.id}">Naam ${esc(team.name)}</label><input id="name-${team.id}" name="name" value="${esc(teamDrafts.get(team.id) ?? team.name)}" maxlength="80" required><button class="text-button">Naam opslaan</button></form><button class="text-button" data-action="grade-team" data-id="${team.id}">Nakijken →</button><button class="text-button danger" data-action="archive-team" data-id="${team.id}">Uitsluiten</button></div>`).join('')}</div>`:`<div class="empty-state"><span>01</span><h2>De eerste teams kunnen erbij</h2><p>Gebruik het veld hierboven. Daarna kun je per team de antwoorden invoeren en punten geven.</p></div>`}${archived.length?`<details class="org-panel archived"><summary>Uitgesloten teams (${archived.length})</summary>${archived.map(team=>`<div class="team-row"><strong>${esc(team.name)}</strong><button class="text-button" data-action="restore-team" data-id="${team.id}">Weer laten meedoen</button></div>`).join('')}</details>`:''}<div class="info-note">Uitgesloten teams tellen niet mee in de tussenstand. Hun antwoorden blijven bewaard en kunnen worden teruggezet.</div>`;
}
function selectorBar(){return `<div class="selector-bar org-panel"><div><label for="grading-round">Ronde</label><select id="grading-round">${options(state.rounds,selectedRound,roundLabel)}</select></div>${tab==='nakijken'?`<div><label for="grading-team">Team</label><select id="grading-team">${options(activeTeams(),selectedTeam,team=>team.name)}</select></div>`:''}</div>`;}
function gradingView(){
  if(!activeTeams().length)return `<div class="org-title"><div><h1>Antwoorden & punten</h1></div></div><div class="empty-state"><h2>Voeg eerst een team toe</h2><p>Daarna kun je de antwoorden per ronde bijhouden.</p><button class="button primary" data-tab="teams">Naar teams →</button></div>`;
  const round=currentRound(),list=questions(),locked=round.closed;
  const reviewed=list.filter(q=>getAnswer(q.id)?.points_cents!=null).length;
  const points=list.reduce((sum,q)=>sum+(getAnswer(q.id)?.points_cents || 0),0);
  return `<div class="org-title"><div><p class="eyebrow dark">PER TEAM EN PER RONDE</p><h1>Antwoorden & punten</h1><p>Voer de antwoorden in en beoordeel ze. Afwijkende formuleringen kun je zelf goed rekenen.</p></div></div>${selectorBar()}<div class="grading-summary"><div><strong>${reviewed} / ${list.length}</strong><span>beoordeeld</span></div><div><strong>${formatPoints(points)}</strong><span>punten in deze ronde</span></div><button class="button outline" data-action="match" ${locked?'disabled':''}>Herken gelijke antwoorden</button><button class="button ${locked?'outline':'primary'}" data-action="round-status">${locked?'Heropen ronde':'Ronde afsluiten'}</button></div>${locked?'<div class="info-note">Deze ronde is afgesloten voor alle organisatoren. Heropen de ronde om nog iets te corrigeren.</div>':''}${selectedRound==='5'?'<div class="info-note">De bingopunten staan voorlopig op 0. Spreek de puntentelling af en pas de maxima aan bij Antwoordmodel voordat je beoordeelt.</div>':''}<div class="answer-list">${list.map(q=>{
    const a=getAnswer(q.id),score=a?.points_cents,draft=answerDrafts.get(answerKey(q.id));
    return `<article class="answer-card ${score!=null?'reviewed':''}" data-question="${q.id}"><div class="question-number">${q.id}</div><div class="answer-body"><h2>${esc(q.prompt)}</h2><details class="expected"><summary>Modelantwoord bekijken</summary><p>${esc(q.correct || 'Nog niet ingevuld — beoordeel dit onderdeel zelf of vul het antwoordmodel aan.')}</p>${q.alternatives.length?`<small>Ook goed: ${q.alternatives.map(esc).join(' · ')}</small>`:''}</details><label for="answer-${q.id}">Antwoord van het team</label><textarea id="answer-${q.id}" data-answer="${q.id}" rows="2" maxlength="3000" ${locked?'disabled':''} placeholder="Noteer het ingeleverde antwoord…">${esc(draft?.answer ?? a?.answer ?? '')}</textarea><div class="score-actions"><button class="grade-button good ${score===q.max_cents?'chosen':''}" data-score="${q.id}" data-value="${q.max_cents/100}" ${locked?'disabled':''}>Goed · ${formatPoints(q.max_cents)}</button><button class="grade-button wrong ${score===0?'chosen':''}" data-score="${q.id}" data-value="0" ${locked?'disabled':''}>Fout · 0</button><label class="points-input">Punten<input aria-label="Punten voor vraag ${q.id}" data-points="${q.id}" type="number" min="0" max="${q.max_cents/100}" step="0.25" value="${esc(draft?.points ?? (score==null?'':score/100))}" ${locked?'disabled':''} placeholder="—"><span>/ ${formatPoints(q.max_cents)}</span></label><button class="text-button" data-action="save-answer" data-id="${q.id}" ${locked?'disabled':''}>Opslaan</button>${score!=null?`<button class="text-button" data-action="ungrade" data-id="${q.id}" ${locked?'disabled':''}>Beoordeling wissen</button>`:''}</div><div class="answer-meta" id="meta-${q.id}">${draft?'Niet-opgeslagen invoer':a?`${score!=null?'Beoordeeld':'Nog te beoordelen'} · ${esc(a.updated_by)} · ${new Date(a.updated_at).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}`:'Nog niet ingevuld'}</div></div></article>`;
  }).join('')}</div>`;
}
function standingsView(projected=false){
  const result=summarize(state,through,includeBonus);
  const standard=state.rounds.filter(round=>round.id!=='bonus');
  return `<div class="org-title"><div><p class="eyebrow dark">PUNTEN OP HET BORD</p><h1>${projected?'De tussenstand':'Tussenstand per ronde'}</h1><p>Stand na ${esc(roundLabel(state.rounds.find(round=>round.id===through) || standard.at(-1)))}${includeBonus?' · inclusief bonus':''}</p></div>${projected?'':`<button class="button outline" data-action="project">Projecteer tussenstand ↗</button>`}</div>${projected?'':`<div class="stand-controls org-panel"><div><label for="stand-through">Tussenstand na</label><select id="stand-through">${options(standard,through,roundLabel)}</select></div><label class="checkbox"><input type="checkbox" id="include-bonus" ${includeBonus?'checked':''}> Bonusronde meetellen</label><button class="text-button" data-action="csv">Download CSV ↓</button></div>`}${result.provisional?'<div class="info-note">Voorlopige stand: nog niet alle geselecteerde rondes zijn afgesloten. Alleen toegekende punten tellen mee. Een streepje betekent dat er nog niets is beoordeeld.</div>':'<div class="info-note success">Alle geselecteerde rondes zijn afgesloten.</div>'}<div class="table-scroll org-panel"><table class="standings-table"><thead><tr><th scope="col">Pos.</th><th scope="col">Team</th>${result.rounds.map(round=>`<th scope="col" title="${esc(round.title)}">${round.id==='bonus'?'Bonus':`R${round.id}`}</th>`).join('')}<th scope="col">Totaal</th>${projected?'':'<th scope="col">Beoordeeld</th>'}</tr></thead><tbody>${result.entries.map(entry=>`<tr><td class="rank">${entry.rank}</td><th scope="row">${esc(entry.name)}</th>${result.rounds.map(round=>{const score=entry.scores[round.id];return `<td title="${score.reviewed} van ${score.total} beoordeeld">${score.reviewed?formatPoints(score.points):'—'}${score.reviewed && score.reviewed<score.total?'<sup>*</sup>':''}</td>`;}).join('')}<td class="total">${formatPoints(entry.total)}</td>${projected?'':`<td class="review-count">${entry.reviewed} / ${entry.questionCount}</td>`}</tr>`).join('') || `<tr><td colspan="${result.rounds.length+4}">Er zijn nog geen actieve teams.</td></tr>`}</tbody></table></div><p class="table-note">Gelijke totaalscores delen dezelfde positie. * Deze ronde is voor dit team nog niet volledig beoordeeld.</p>${projected?'':`<details class="org-panel changes"><summary>Recente wijzigingen</summary>${state.changes.map(change=>`<div><strong>${esc(change.actor)}</strong><span>${esc(change.action)}</span><time>${new Date(change.created_at).toLocaleString('nl-NL')}</time></div>`).join('') || '<p>Er zijn nog geen wijzigingen.</p>'}</details>`}`;
}
function modelView(){
  const locked=currentRound().closed;
  return `<div class="org-title"><div><p class="eyebrow dark">DE BASIS VOOR HET NAKIJKEN</p><h1>Antwoordmodel</h1><p>Controleer de antwoorden en stel de punten per vraag vast voordat je gaat nakijken.</p></div></div>${selectorBar()}<div class="info-note">Het model is overgenomen uit het bestaande controleblad en moet inhoudelijk nog worden gecontroleerd. De muziekfragmenten en het aantal tennisballen zijn nog niet definitief. Wijzigingen rekenen eerder beoordeelde antwoorden niet automatisch opnieuw na.</div>${locked?'<div class="info-note">Deze ronde is afgesloten. Heropen hem bij Antwoorden & punten om het model te wijzigen.</div>':''}<div class="model-list">${questions().map(q=>`<form class="model-form org-panel" data-id="${q.id}"><div class="model-heading"><span class="question-number">${q.id}</span><h2>Vraag ${q.id}</h2><label class="points-input">Maximaal<input name="max_points" aria-label="Maximumscore vraag ${q.id}" type="number" min="0" max="1000" step="0.25" value="${q.max_cents/100}" ${locked?'disabled':''} required>punten</label></div><label for="prompt-${q.id}">Vraag of onderdeel</label><textarea id="prompt-${q.id}" name="prompt" maxlength="3000" rows="2" required ${locked?'disabled':''}>${esc(q.prompt)}</textarea><label for="correct-${q.id}">Correct antwoord</label><textarea id="correct-${q.id}" name="correct" rows="2" maxlength="3000" ${locked?'disabled':''}>${esc(q.correct)}</textarea><label for="alternatives-${q.id}">Andere toegestane antwoorden (één per regel)</label><textarea id="alternatives-${q.id}" name="alternatives" rows="2" ${locked?'disabled':''}>${esc(q.alternatives.join('\n'))}</textarea><button class="button primary" ${locked?'disabled':''}>Vraag opslaan</button></form>`).join('')}</div>`;
}
async function mutation(path,body){
  pending++;saveIndicator();
  try{return await api(path,body);}
  finally{pending--;saveIndicator();}
}
async function saveAnswer(qid,points,button){
  if(pending)return notice('Wacht tot de vorige wijziging is opgeslagen.');
  const area=root.querySelector(`[data-answer="${qid}"]`),current=getAnswer(qid);
  const key=answerKey(qid),draft=answerDrafts.get(key);
  const body={team_id:selectedTeam,round_id:selectedRound,question_id:qid,version:draft?.version ?? current?.version ?? 0,answer:area.value};
  if(points!==undefined)body.points=points;
  if(button)button.disabled=true;
  try{
    const saved=await mutation('/answers/save',body);
    const index=state.answers.findIndex(a=>a.team_id===selectedTeam && a.round_id===selectedRound && a.question_id===qid);
    if(index<0)state.answers.push(saved);else state.answers[index]=saved;
    answerDrafts.delete(key);updateDirty();await refresh(true);notice('Antwoord en punten opgeslagen.');
  }catch(error){
    dirty=true;saveIndicator();
    if(error.status===409 && 'current' in (error.data || {})){
      const latest=error.data.current;
      if(await confirmAction('Dit antwoord is tegelijk gewijzigd',`Jouw invoer blijft in beeld. De andere organisator heeft ingevuld: “${latest?.answer || '(leeg)'}”, met ${latest?.points_cents==null?'nog geen':formatPoints(latest.points_cents)} punten. Wil je jouw invoer alsnog overnemen?`,'Mijn invoer overnemen')){
        try{await mutation('/answers/save',{...body,version:latest?.version || 0});answerDrafts.delete(key);updateDirty();await refresh(true);notice('Jouw invoer is overgenomen.');}catch(retry){notice(retry.message,true);}
      }
    }else notice(error.message,true);
  }finally{if(button)button.disabled=false;}
}
async function navigate(callback){
  if(pending){notice('Wacht tot het opslaan klaar is.');return;}
  if(dirty && !await confirmAction('Er is nog niet-opgeslagen invoer','Als je nu verdergaat, vervalt de invoer die nog niet is opgeslagen.','Verder zonder opslaan')){render();return;}
  answerDrafts.clear();modelDrafts.clear();teamDrafts.clear();dirty=false;callback();render();
}
function download(name,content,type){const link=document.createElement('a');const url=URL.createObjectURL(new Blob([content],{type}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
root.addEventListener('input',event=>{
  const field=event.target;
  if(field.dataset.answer || field.dataset.points){
    const qid=field.dataset.answer || field.dataset.points,key=answerKey(qid),current=getAnswer(qid);
    const old=answerDrafts.get(key);
    const points=root.querySelector(`[data-points="${qid}"]`);
    if(field.dataset.answer)points.value='';
    answerDrafts.set(key,{version:old?.version ?? current?.version ?? 0,answer:root.querySelector(`[data-answer="${qid}"]`).value,points:points.value});
  }else if(field.closest('.model-form')){
    const form=field.closest('.model-form'),data=Object.fromEntries(new FormData(form));
    const q=questions().find(q=>q.id===form.dataset.id);
    modelDrafts.set(modelKey(q.id),{...data,version:modelDrafts.get(modelKey(q.id))?.version ?? q.version});
  }else if(field.closest('.team-rename'))teamDrafts.set(field.closest('.team-rename').dataset.id,field.value);
  updateDirty();
});
root.addEventListener('change',event=>{
  if(event.target.id==='grading-round')navigate(()=>{selectedRound=event.target.value;});
  if(event.target.id==='grading-team')navigate(()=>{selectedTeam=event.target.value;});
  if(event.target.id==='stand-through'){through=event.target.value;render();}
  if(event.target.id==='include-bonus'){includeBonus=event.target.checked;render();}
});
root.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;
  if(form.id==='actor-form'){
    actor=new FormData(form).get('actor').trim();if(!actor)return;
    try{localStorage.setItem('pubquiz-organisatornaam',actor);}catch{}
    await refresh(true);return;
  }
  const button=form.querySelector('button');if(pending)return;
  button.disabled=true;
  try{
    if(form.id==='team-add-form'){await mutation('/teams/add',{name:new FormData(form).get('name')});await refresh(true);notice('Team toegevoegd.');document.getElementById('team-name')?.focus();}
    else if(form.matches('.team-rename')){const team=state.teams.find(t=>t.id===form.dataset.id);await mutation('/teams/update',{id:team.id,version:team.version,name:new FormData(form).get('name')});teamDrafts.delete(team.id);updateDirty();await refresh(true);notice('Teamnaam opgeslagen.');}
    else if(form.matches('.model-form')){const data=new FormData(form),q=questions().find(q=>q.id===form.dataset.id);await mutation('/questions/save',{round_id:selectedRound,id:q.id,version:q.version,prompt:data.get('prompt'),correct:data.get('correct'),alternatives:data.get('alternatives').split('\n').map(x=>x.trim()).filter(Boolean),max_points:Number(data.get('max_points'))});modelDrafts.delete(modelKey(q.id));updateDirty();await refresh(true);notice('Antwoordmodel opgeslagen.');}
  }catch(error){notice(error.message,true);}finally{button.disabled=false;}
});
root.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.tab)return navigate(()=>{tab=button.dataset.tab;});
  if(button.dataset.score){const area=root.querySelector(`[data-answer="${button.dataset.score}"]`);if(!area.value.trim() && !await confirmAction('Geen antwoord genoteerd','Je kunt wel punten toekennen. Wil je doorgaan zonder het teamantwoord vast te leggen?','Punten opslaan'))return;return saveAnswer(button.dataset.score,Number(button.dataset.value),button);}
  const action=button.dataset.action;if(!action)return;
  try{
    if(action==='refresh')return navigate(()=>{refresh(true);});
    if(action==='grade-team')return navigate(()=>{selectedTeam=button.dataset.id;tab='nakijken';});
    if(action==='save-answer'){const qid=button.dataset.id,field=root.querySelector(`[data-points="${qid}"]`);if(!field.checkValidity())return field.reportValidity();return saveAnswer(qid,field.value===''?undefined:Number(field.value),button);}
    if(action==='ungrade')return saveAnswer(button.dataset.id,null,button);
    if(action==='archive-team' || action==='restore-team'){
      const team=state.teams.find(t=>t.id===button.dataset.id),active=action==='restore-team';
      if(!active && !await confirmAction('Team uitsluiten',`${team.name} telt dan niet meer mee in de tussenstand. De antwoorden blijven bewaard.`,'Team uitsluiten'))return;
      await mutation('/teams/update',{id:team.id,version:team.version,active});await refresh(true);notice(active?'Team doet weer mee.':'Team uitgesloten.');
    }
    if(action==='match'){
      if(dirty)return notice('Sla je invoer eerst op.',true);
      const result=await mutation('/answers/match',{team_id:selectedTeam,round_id:selectedRound});await refresh(true);notice(`${result.matched} gelijke antwoorden goed gerekend. De overige antwoorden beoordeel je zelf.`);
    }
    if(action==='round-status'){
      if(dirty)return notice('Sla je invoer eerst op.',true);
      const round=currentRound();
      if(!await confirmAction(round.closed?'Ronde heropenen':'Ronde afsluiten',round.closed?'Alle organisatoren kunnen deze ronde dan weer aanpassen.':'Deze ronde wordt voor alle organisatoren vergrendeld. Dit kan zodra alle actieve teams volledig zijn beoordeeld.',round.closed?'Heropenen':'Afsluiten'))return;
      await mutation('/rounds/status',{id:round.id,version:round.version,closed:!round.closed});await refresh(true);notice(round.closed?'Ronde heropend.':'Ronde afgesloten.');
    }
    if(action==='share'){await navigator.clipboard.writeText(`${location.origin}${location.pathname}#sleutel=${token}`);notice('Beheerlink gekopieerd. Deel deze alleen met de organisatoren.');}
    if(action==='backup'){const backup=await api('/backup');download(`pubquiz-reservekopie-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(backup,null,2),'application/json');notice('Reservekopie gedownload met teams, antwoorden, model en punten.');}
    if(action==='csv'){
      const result=summarize(state,through,includeBonus);
      const cell=value=>`"${String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`;
      const rows=[['Positie','Team',...result.rounds.map(round=>roundLabel(round)),'Totaal','Beoordeeld'],...result.entries.map(entry=>[entry.rank,entry.name,...result.rounds.map(round=>entry.scores[round.id].reviewed?formatPoints(entry.scores[round.id].points):''),formatPoints(entry.total),`${entry.reviewed}/${entry.questionCount}`])];
      download('pubquiz-tussenstand.csv','\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');
    }
    if(action==='project'){window.open(`organisator.html?scherm=stand&ronde=${through}&bonus=${includeBonus?'1':'0'}`,'_blank','noopener');}
    if(action==='change-actor'){if(dirty)return notice('Sla je invoer eerst op.',true);actor='';namePage();}
    if(action==='forget' && await confirmAction('Beheerlink op dit apparaat vergeten','Je hebt daarna de volledige beheerlink nodig om opnieuw toegang te krijgen. De gegevens in de database blijven bewaard.','Vergeten')){localStorage.removeItem('pubquiz-beheersleutel');token='';accessPage();}
  }catch(error){notice(error.message || 'De actie is niet gelukt.',true);}
});
window.addEventListener('beforeunload',event=>{if(dirty || pending){event.preventDefault();event.returnValue='';}});
window.addEventListener('online',()=>refresh());
if(!token)accessPage();else if(!actor && !projection)namePage();else refresh(true);
setInterval(()=>{if(token && (actor || projection) && !document.hidden)refresh();},4000);
