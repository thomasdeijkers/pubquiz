import {headerMenu} from './navigation.mjs';
import {podium,roundPodium,trophy} from './scoreboard.mjs';
import {summarize,formatPoints} from './scoring.mjs';
const API = 'https://vps.opticore-insights.nl/pubquiz-api/v1';
const root = document.getElementById('organizer');
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let actor = 'Organisator';
try {
  actor = localStorage.getItem('pubquiz-organisatornaam') || 'Organisator';
  localStorage.removeItem('pubquiz-beheersleutel');
} catch {}
// Oude beheerlinks blijven werken, zonder een sleutel te gebruiken.
if (new URLSearchParams(location.hash.slice(1)).has('sleutel')) {
  history.replaceState(null,'',location.pathname+location.search);
}
let state;
const routeParams = new URLSearchParams(location.search);
let tab = ({instellingen:'settings',nakijken:'nakijken',stand:'stand',teams:'teams',model:'model',bingo:'bingo'})[routeParams.get('tab')] || 'teams';
let selectedRound = routeParams.get('ronde') || '1';
let selectedTeam = '';
let through = '9';
let includeBonus = false;
let bingoTimingMode = 'current';
let pending = 0;
let dirty = false;
let polling = false;
let lastSync = null;
let toastTimer;
let loadingError = '';
const answerDrafts = new Map();
const expandedQuestions = new Set();
const modelDrafts = new Map();
const teamDrafts = new Map();
const scoringDrafts = new Map();
const answerKey = (qid,teamId=selectedTeam) => `${teamId}/${selectedRound}/${qid}`;
const modelKey = qid => `${selectedRound}/${qid}`;
function updateDirty(){dirty=!!(answerDrafts.size || modelDrafts.size || teamDrafts.size || scoringDrafts.size);saveIndicator();}
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
  const response=await fetch(API+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify({...body,actor})}:{})});
  let data;
  try { data=await response.json(); } catch { throw new Error('De server gaf geen geldig antwoord. Probeer opnieuw.'); }
  if(!response.ok) { const error=new Error(data.error || 'De actie kon niet worden uitgevoerd.'); error.status=response.status; error.data=data; throw error; }
  return data;
}
function activeTeams(){ return state.teams.filter(team=>team.active); }
function currentRound(){return state.rounds.find(round=>round.id===selectedRound);}
function questions(){return state.questions.filter(question=>question.round_id===selectedRound).sort((a,b)=>Number(a.id)-Number(b.id)).map(question=>{const draft=tab==='model'?modelDrafts.get(modelKey(question.id)):null;return draft?{...question,...draft,max_cents:Math.round(Number(draft.max_points)*100),alternatives:draft.alternatives.split('\n').map(x=>x.trim()).filter(Boolean)}:question;});}
function getAnswer(qid,teamId=selectedTeam){return state.answers.find(answer=>answer.team_id===teamId && answer.round_id===selectedRound && answer.question_id===qid);}
function roundLabel(round){return round.id==='bonus'?'Bonusronde':`Ronde ${round.id} · ${round.title}`;}
function options(items,selected,label){return items.map(item=>`<option value="${esc(item.id)}" ${item.id===selected?'selected':''}>${esc(label(item))}</option>`).join('');}

function saveIndicator(){const node=document.getElementById('sync-status');if(node){node.classList.toggle('unsaved',!!(dirty || pending || loadingError));node.textContent=loadingError?'Verbinding verbroken':pending?'Bezig met opslaan…':dirty?'Er is nog niet-opgeslagen invoer':lastSync?`Gedeeld · bijgewerkt ${lastSync.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Verbinden…';}}
function accessPage(message='De database is tijdelijk niet bereikbaar. Vernieuw de pagina om opnieuw te verbinden.') {
  root.innerHTML=`<main class="access-page"><a class="brand" href="./"><img class="club-brand-logo" src="assets/clublogo-render.png" width="64" height="64" alt="Heynkensort"><span>PUBQUIZ<small>Het wedstrijdsecretariaat · après-ski editie</small></span></a><p class="eyebrow dark">SAMEN DE QUIZ BIJHOUDEN</p><h1>Het beheer van de quiz</h1><p>${esc(message)}</p><p>Het beheer is rechtstreeks toegankelijk zonder account of toegangssleutel.</p><a class="button outline" href="./">Terug naar de quiz</a></main>`;
}
function namePage(){
  root.innerHTML=`<main class="access-page"><img class="club-brand-logo" src="assets/clublogo-render.png" width="64" height="64" alt="Heynkensort"><p class="eyebrow dark">WELKOM BIJ HET QUIZBEHEER</p><h1>Hoe mogen we je noemen?</h1><p>Je naam komt bij je wijzigingen te staan, zodat de andere organisatoren weten wie heeft nagekeken.</p><form id="actor-form"><label for="actor-name">Jouw naam</label><input id="actor-name" name="actor" required maxlength="80" autocomplete="given-name" placeholder="Bijvoorbeeld Thomas"><button class="button primary">Verder naar het beheer →</button></form></main>`;
}
async function refresh(force=false) {
  if(polling || (!force && (dirty || pending || root.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName))))return;
  polling=true;
  try{
    if(state && !force){
      const check=await api('/revision');
      if(check.revision===state.revision){lastSync=new Date();loadingError='';saveIndicator();return;}
    }
    const next=await api('/state');
    const changed=!state || next.revision!==state.revision;
    state=next; lastSync=new Date(); loadingError='';
    if(!state.rounds.some(round=>round.id===selectedRound))selectedRound=state.rounds[0]?.id || '1';
    if(!selectedTeam || !activeTeams().some(team=>team.id===selectedTeam))selectedTeam=activeTeams()[0]?.id || '';
    if(changed || force)render();else saveIndicator();
  }catch(error){loadingError=error.message;if(!state)accessPage();saveIndicator();}
  finally{polling=false;}
}
function render(){
  if(!state)return;
  if(projection){root.innerHTML=`<main class="projection"><header><span class="brand"><img class="club-brand-logo" src="assets/clublogo-render.png" width="64" height="64" alt="Heynkensort">PUBQUIZ · T.V. HEYNKENSORT</span><div class="header-actions"><span id="sync-status"></span>${headerMenu()}</div></header>${standingsView(true)}</main>`; saveIndicator();return;}
  const view=tab==='teams'?teamsView():tab==='nakijken'?gradingView():tab==='model'?modelView():tab==='bingo'?bingoView():tab==='settings'?settingsView():standingsView();
  root.innerHTML=`<header class="org-header"><a class="brand" href="./"><img class="club-brand-logo" src="assets/clublogo-render.png" width="64" height="64" alt="Heynkensort"><span>PUBQUIZ<small>Het wedstrijdsecretariaat · après-ski editie</small></span></a><div class="header-actions"><span class="actor-badge">${esc(actor)}</span>${headerMenu({admin:true,active:tab})}</div></header><div class="org-layout"><main class="org-content"><div class="org-sync"><span id="sync-status"></span><button class="text-button" data-action="refresh">Vernieuwen ↻</button></div>${view}</main></div>`;
  saveIndicator();
}
function bingoCardOptions(card){return `<option value="">Nog niet gekoppeld</option>${[1,2,3].map(id=>`<option value="${id}" ${String(card)===String(id)?'selected':''}>K${id}</option>`).join('')}`;}
function teamsView(){
  const teams=activeTeams(),archived=state.teams.filter(team=>!team.active),newDraft=teamDrafts.get('new');
  return `<div class="org-title"><div><p class="eyebrow dark">DE DEELNEMERS</p><h1>Teams</h1><p>Vul de teamnaam en de leden apart in. Alleen de teamnaam verschijnt in de tussenstand en op de printbladen.</p></div><span class="count-badge">${teams.length} teams</span></div><form id="team-add-form" class="team-add org-panel"><div class="team-create-fields"><label class="team-field" for="team-name">Teamnaam<input name="name" id="team-name" required maxlength="80" value="${esc(newDraft?.name || '')}" placeholder="Naam van het team" autocomplete="off"></label><label class="team-field" for="team-members">Leden<textarea name="members" id="team-members" rows="2" maxlength="2000" placeholder="Elk lid op een nieuwe regel">${esc(newDraft?.members || '')}</textarea></label><label class="team-field" for="team-bingo-card">Bingokaart<select id="team-bingo-card" name="bingo_card">${bingoCardOptions(newDraft?.bingo_card)}</select></label><button class="button primary">Team toevoegen +</button></div></form>${teams.length?`<div class="org-panel team-list">${teams.map((team,index)=>{const draft=teamDrafts.get(team.id);return `<div class="team-row"><span class="team-index">${String(index+1).padStart(2,'0')}</span><form class="team-rename" data-id="${team.id}"><label class="team-field" for="name-${team.id}">Teamnaam<input id="name-${team.id}" name="name" value="${esc(draft?.name ?? team.name)}" maxlength="80" required></label><label class="team-field" for="members-${team.id}">Leden<textarea id="members-${team.id}" name="members" rows="2" maxlength="2000" placeholder="Elk lid op een nieuwe regel">${esc(draft?.members ?? team.members ?? '')}</textarea></label><label class="team-field team-card-field" for="bingo-card-${team.id}">Bingokaart<select id="bingo-card-${team.id}" name="bingo_card">${bingoCardOptions(draft?.bingo_card ?? team.bingo_card)}</select></label><button class="text-button">Opslaan</button></form><a class="text-button team-print-link" href="./?invulblad=alle&amp;team=${encodeURIComponent(team.name)}&amp;bingokaart=${team.bingo_card || index%3+1}" target="_blank" rel="noopener" aria-label="Print invulbladen voor ${esc(team.name)}">Invulbladen printen ↗</a><button class="text-button" data-action="grade-team" data-id="${team.id}">Nakijken →</button><button class="text-button danger" data-action="archive-team" data-id="${team.id}">Uitsluiten</button><button class="text-button danger" data-action="delete-team" data-id="${team.id}">Verwijderen</button></div>`;}).join('')}</div>`:`<div class="empty-state"><span>01</span><h2>De eerste teams kunnen erbij</h2><p>Vul hierboven een teamnaam en eventueel de leden in.</p></div>`}${archived.length?`<details class="org-panel archived"><summary>Uitgesloten teams (${archived.length})</summary>${archived.map(team=>`<div class="team-row"><strong>${esc(team.name)}</strong><button class="text-button" data-action="restore-team" data-id="${team.id}">Weer laten meedoen</button><button class="text-button danger" data-action="delete-team" data-id="${team.id}">Verwijderen</button></div>`).join('')}</details>`:''}<div class="info-note">Uitgesloten teams tellen niet mee in de tussenstand. Hun leden, antwoorden en scores blijven bewaard.</div>`;
}

function selectorBar(){return `<div class="selector-bar org-panel"><div><label for="grading-round">Ronde</label><select id="grading-round">${options(state.rounds,selectedRound,roundLabel)}</select></div>${tab==='nakijken'?'<div class="all-teams-note"><strong>Alle teams onder iedere vraag</strong><span>Vul het antwoord in en klik rechts op Goed of Fout.</span></div>':''}</div>`;}
function teamAnswerRow(q,team,locked){
  const a=getAnswer(q.id,team.id),score=a?.points_cents,draft=answerDrafts.get(answerKey(q.id,team.id));
  const fieldId=`answer-${q.id}-${team.id}`;
  return `<div class="team-answer-row ${score!=null?'reviewed':''} ${draft?'has-draft':''}" data-team="${team.id}" data-question="${q.id}"><label class="team-answer-name" for="${fieldId}">${esc(team.name)}<span>${score==null?'Nog te beoordelen':`${formatPoints(score)} / ${formatPoints(q.max_cents)} punten`}</span></label><div class="team-answer-editor"><textarea id="${fieldId}" aria-label="Antwoord ${esc(team.name)} vraag ${q.id}" data-answer="${q.id}" rows="1" maxlength="3000" ${locked?'disabled':''} placeholder="Antwoord van ${esc(team.name)}…">${esc(draft?.answer ?? a?.answer ?? '')}</textarea><div class="team-answer-status"><span class="answer-meta">${draft?'Niet-opgeslagen invoer':a?`${score!=null?'Beoordeeld':'Opgeslagen'} · ${esc(a.updated_by)}`:'Nog niet ingevuld'}</span><button class="text-button" data-action="save-answer" data-id="${q.id}" ${locked?'disabled':''}>Opslaan</button></div></div><div class="team-answer-controls"><div class="team-grade-buttons"><button class="grade-button good ${score===q.max_cents && q.max_cents>0?'chosen':''}" aria-label="Goed ${esc(team.name)} vraag ${q.id}" data-score="${q.id}" data-value="${q.max_cents/100}" ${locked?'disabled':''}>Goed · ${formatPoints(q.max_cents)}</button><button class="grade-button wrong ${score===0?'chosen':''}" aria-label="Fout ${esc(team.name)} vraag ${q.id}" data-score="${q.id}" data-value="0" ${locked?'disabled':''}>Fout · 0</button></div><details class="team-extra-points"><summary>Andere punten</summary><div class="score-actions"><label class="points-input">Punten<input aria-label="Punten ${esc(team.name)} vraag ${q.id}" data-points="${q.id}" type="number" min="0" max="${q.max_cents/100}" step="0.01" value="${esc(draft?.points ?? (score==null?'':score/100))}" ${locked?'disabled':''}><span>/ ${formatPoints(q.max_cents)}</span></label><button class="text-button" data-action="save-answer" data-id="${q.id}" ${locked?'disabled':''}>Opslaan</button>${score!=null?`<button class="text-button" data-action="ungrade" data-id="${q.id}" ${locked?'disabled':''}>Beoordeling wissen</button>`:''}</div></details></div></div>`;
}
function questionStanding(q,teams){
  const correct=teams.filter(team=>q.max_cents>0 && getAnswer(q.id,team.id)?.points_cents===q.max_cents);
  return correct.length
    ? `${trophy(1)}${correct.map(team=>`<span class="question-team-score scored">${esc(team.name)}</span>`).join('')}`
    : '<span class="question-no-correct">Nog geen teams goed gerekend</span>';
}
function bingoTimingControls(){
  return `<div class="org-panel bingo-timing-controls"><label for="bingo-timing-mode">Bereken winmomenten met<select id="bingo-timing-mode"><option value="current" ${bingoTimingMode==='current'?'selected':''}>Huidige DJ-kaart</option>${state.bingo?.proposal?`<option value="proposal" ${bingoTimingMode==='proposal'?'selected':''}>Playlistvoorstel · nog niet toegepast in Spotify</option>`:''}</select></label><p>Onder elk bingo-onderdeel staat wanneer K1, K2 en K3 compleet kunnen zijn. Koppel de uitgedeelde bingokaart aan ieder team bij <a href="organisator.html?tab=teams">Teams</a>. Teams met dezelfde kaart kunnen tegelijk bingo hebben.</p></div>`;
}
function bingoWinOrder(qid){
  const phase={'1':'first','2':'second','3':'full'}[String(qid)];
  const config=bingoTimingMode==='proposal'?state.bingo?.proposal:state.bingo;
  if(!phase || !config?.completions)return '';
  const teams=activeTeams();
  const rows=[1,2,3].map(id=>({id,after:config.completions['K'+id]?.[phase] ?? null,names:teams.filter(t=>Number(t.bingo_card)===id).map(t=>t.name)})).sort((a,b)=>(a.after ?? Infinity)-(b.after ?? Infinity)||a.id-b.id);
  const first=Math.min(...Object.values(config.completions).map(c=>c.first ?? Infinity));
  const earlySecond=phase==='second' && rows.some(row=>row.after!==null && row.after<=first);
  const noFull=phase==='full' && rows.every(row=>row.after===null);
  const warning=earlySecond?'Let op: deze diagonalen kunnen al vóór de eerste bingo compleet zijn. De huidige volgorde geeft daardoor geen afzonderlijke tweede winronde.':noFull?'Met de huidige DJ-kaart is een volle bingokaart niet haalbaar. Het playlistvoorstel lost dit op.':'';
  return `<div class="bingo-win-order"><strong>Mogelijke winvolgorde · ${bingoTimingMode==='proposal'?'playlistvoorstel (nog niet actief)':'huidige DJ-kaart'}</strong><ol>${rows.map(row=>`<li><b>Kaart K${row.id}</b><span class="bingo-win-teams">${row.names.length?row.names.map(esc).join(' · '):'Nog geen team gekoppeld'}</span><strong>${row.after===null?'Niet haalbaar':`Vanaf nummer ${row.after}`}</strong></li>`).join('')}</ol>${warning?`<p class="bingo-timing-warning">${warning}</p>`:''}<small>Momenten berekend met de gedrukte kaarten en deze afspeelvolgorde, zonder shuffle.</small></div>`;
}
function questionCard(q,teams,locked){
  const reviewed=teams.filter(team=>getAnswer(q.id,team.id)?.points_cents!=null).length;
  const filled=teams.filter(team=>String(getAnswer(q.id,team.id)?.answer ?? '').trim().length>0).length;
  const foldKey=`${selectedRound}/${q.id}`;
  return `<details class="answer-card question-all-teams question-fold" data-question="${q.id}" data-question-fold="${foldKey}" ${expandedQuestions.has(foldKey)?'open':''}><summary class="question-fold-summary"><span class="question-heading"><span class="question-number">${q.id}</span><span class="question-prompt">${esc(q.prompt)}</span><span class="question-progress">${filled}/${teams.length} ingevuld · ${reviewed}/${teams.length} nagekeken</span><span class="question-fold-arrow" aria-hidden="true">⌄</span></span><span class="question-collapsed-standing"><span class="question-standing-label">Goed beantwoord</span><span class="question-scoreboard">${questionStanding(q,teams)}</span></span></summary><div class="answer-body question-fold-body"><div class="expected"><strong class="expected-label">Modelantwoord</strong><p>${esc(q.correct || 'Nog niet ingevuld — beoordeel dit onderdeel zelf of vul het antwoordmodel aan.')}</p>${q.alternatives.length?`<small>Ook goed: ${q.alternatives.map(esc).join(' · ')}</small>`:''}</div>${selectedRound==='5'?bingoWinOrder(q.id):''}<div class="compact-teams-heading"><span>Team & punten</span><span>Ingeleverd antwoord</span><span>Beoordeling</span></div><div class="question-team-answers">${teams.map(team=>teamAnswerRow(q,team,locked)).join('')}</div></div></details>`;
}
function gradingView(){
  const teams=activeTeams();
  if(!teams.length)return `<div class="org-title"><div><h1>Antwoorden & punten</h1></div></div><div class="empty-state"><h2>Voeg eerst een team toe</h2><p>Daarna kun je alle teams direct onder iedere vraag nakijken.</p><button class="button primary" data-tab="teams">Naar teams →</button></div>`;
  const round=currentRound(),list=questions(),locked=round.closed;
  const answers=teams.flatMap(team=>list.map(q=>getAnswer(q.id,team.id)));
  const reviewed=answers.filter(a=>a?.points_cents!=null).length;
  const points=answers.reduce((sum,a)=>sum+(a?.points_cents || 0),0);
  return `<div class="org-title"><div><p class="eyebrow dark">VRAAG VOOR VRAAG · ALLE TEAMS BIJ ELKAAR</p><h1>Antwoorden & punten</h1><p>Onder iedere vraag staan alle teams. Vul hun antwoord in en klik rechts op Goed of Fout; het antwoord en de punten worden samen opgeslagen.</p></div></div>${selectorBar()}${selectedRound==='5'?bingoTimingControls():''}${roundPodium(state,selectedRound,false)}<div class="grading-summary"><div><strong>${reviewed} / ${list.length*teams.length}</strong><span>teamantwoorden beoordeeld</span></div><div><strong>${formatPoints(points)}</strong><span>punten verdeeld in deze ronde</span></div><button class="button outline" data-action="match" ${locked?'disabled':''}>Herken gelijke antwoorden · alle teams</button><button class="button ${locked?'outline':'primary'}" data-action="round-status">${locked?'Heropen ronde':'Ronde afsluiten'}</button></div>${locked?'<div class="info-note">Deze ronde is afgesloten voor alle organisatoren. Heropen de ronde om nog iets te corrigeren.</div>':''}<div class="answer-list">${list.map(q=>questionCard(q,teams,locked)).join('')}</div>`;
}
function standingsView(projected=false){
  const result=summarize(state,through,includeBonus);
  const standard=state.rounds.filter(round=>round.id!=='bonus');
  return `<div class="org-title"><div><p class="eyebrow dark">PUNTEN OP HET BORD</p><h1>${projected?'De tussenstand':'Tussenstand per ronde'}</h1><p>Stand na ${esc(roundLabel(state.rounds.find(round=>round.id===through) || standard.at(-1)))}${includeBonus?' · inclusief bonus':''}</p></div>${projected?'':`<button class="button outline" data-action="project">Projecteer tussenstand ↗</button>`}</div>${projected?'':`<div class="stand-controls org-panel"><div><label for="stand-through">Tussenstand na</label><select id="stand-through">${options(standard,through,roundLabel)}</select></div><label class="checkbox"><input type="checkbox" id="include-bonus" ${includeBonus?'checked':''}> Bonusronde meetellen</label><button class="text-button" data-action="csv">Download CSV ↓</button></div>`}${result.provisional?'<div class="info-note">Voorlopige stand: nog niet alle geselecteerde rondes zijn afgesloten. Alleen toegekende punten tellen mee. Een streepje betekent dat er nog niets is beoordeeld.</div>':'<div class="info-note success">Alle geselecteerde rondes zijn afgesloten.</div>'}${podium(result,'Top 3 · totaal')}<div class="table-scroll org-panel"><table class="standings-table"><thead><tr><th scope="col">Pos.</th><th scope="col">Team</th>${result.rounds.map(round=>`<th scope="col" title="${esc(round.title)}">${round.id==='bonus'?'Bonus':`R${round.id}`}</th>`).join('')}<th scope="col">Totaal</th>${projected?'':'<th scope="col">Beoordeeld</th>'}</tr></thead><tbody>${result.entries.map(entry=>`<tr><td class="rank">${entry.rank}</td><th scope="row">${esc(entry.name)}</th>${result.rounds.map(round=>{const score=entry.scores[round.id];return `<td title="${score.reviewed} van ${score.total} beoordeeld">${score.reviewed?formatPoints(score.points):'—'}${score.reviewed && score.reviewed<score.total?'<sup>*</sup>':''}</td>`;}).join('')}<td class="total">${formatPoints(entry.total)}</td>${projected?'':`<td class="review-count">${entry.reviewed} / ${entry.questionCount}</td>`}</tr>`).join('') || `<tr><td colspan="${result.rounds.length+4}">Er zijn nog geen actieve teams.</td></tr>`}</tbody></table></div><p class="table-note">Gelijke totaalscores delen dezelfde positie. * Deze ronde is voor dit team nog niet volledig beoordeeld.</p>${projected?'':`<details class="org-panel changes"><summary>Recente wijzigingen</summary>${state.changes.map(change=>`<div><strong>${esc(change.actor)}</strong><span>${esc(change.action)}</span><time>${new Date(change.created_at).toLocaleString('nl-NL')}</time></div>`).join('') || '<p>Er zijn nog geen wijzigingen.</p>'}</details>`}`;
}
function modelView(){
  const locked=currentRound().closed;
  return `<div class="org-title"><div><p class="eyebrow dark">DE BASIS VOOR HET NAKIJKEN</p><h1>Antwoordmodel</h1><p>Controleer de antwoorden en stel de punten per vraag vast voordat je gaat nakijken.</p></div></div>${selectorBar()}<div class="info-note">Het model is overgenomen uit het bestaande controleblad en moet inhoudelijk nog worden gecontroleerd. De muziekfragmenten en het aantal tennisballen zijn nog niet definitief. Wijzigingen rekenen eerder beoordeelde antwoorden niet automatisch opnieuw na.</div>${locked?'<div class="info-note">Deze ronde is afgesloten. Heropen hem bij Antwoorden & punten om het model te wijzigen.</div>':''}<div class="model-list">${questions().map(q=>`<form class="model-form org-panel" data-id="${q.id}"><div class="model-heading"><span class="question-number">${q.id}</span><h2>Vraag ${q.id}</h2><label class="points-input">Maximaal<input name="max_points" aria-label="Maximumscore vraag ${q.id}" type="number" min="0" max="1000" step="0.01" value="${q.max_cents/100}" ${locked?'disabled':''} required>punten</label></div><label for="prompt-${q.id}">Vraag of onderdeel</label><textarea id="prompt-${q.id}" name="prompt" maxlength="3000" rows="2" required ${locked?'disabled':''}>${esc(q.prompt)}</textarea><label for="correct-${q.id}">Correct antwoord</label><textarea id="correct-${q.id}" name="correct" rows="2" maxlength="3000" ${locked?'disabled':''}>${esc(q.correct)}</textarea><label for="alternatives-${q.id}">Andere toegestane antwoorden (één per regel)</label><textarea id="alternatives-${q.id}" name="alternatives" rows="2" ${locked?'disabled':''}>${esc(q.alternatives.join('\n'))}</textarea><button class="button primary" ${locked?'disabled':''}>Vraag opslaan</button></form>`).join('')}</div>`;
}
function bingoProposalView(proposal){
  if(!proposal)return '';
  const phases=[['first','1 · Diagonaal ↘','K2',20],['second','2 · Diagonaal ↙','K3',40],['full','3 · Volle kaart','K1',58]];
  return `<section class="org-panel bingo-proposal"><p class="eyebrow dark">VOORSTEL · NOG NIET TOEGEPAST IN SPOTIFY</p><h2 class="bingo-subtitle">Kaarten houden, playlist in de juiste volgorde</h2><p>Alle 60 benodigde nummers staan al in de Spotify-playlist. Met de voorgestelde volgorde kunnen de drie bingokaarten én het instructieblad blijven. De DJ-kaart moet deze nieuwe volgorde en de juiste kaartvermeldingen overnemen.</p><div class="table-scroll"><table class="standings-table"><thead><tr><th>Prijs</th><th>Winnaar</th><th>Na nummer</th><th>Laatste nummer</th></tr></thead><tbody>${phases.map(([key,label,card,after])=>`<tr><th scope="row">${label}</th><td>${card}</td><td>${after}</td><td>${esc(proposal.tracks[after-1].title)}</td></tr>`).join('')}</tbody></table></div><p class="table-note">Doorgerekend voor alle 36 vakjes per kaart: bij iedere prijs is de genoemde kaart als enige het eerst compleet. Volle kaarten: K1 na 58, K2 na 59 en K3 na 60. Dit geldt bij afspelen in deze volgorde, zonder shuffle en met behoud van eerder afgestreepte vakjes.</p><button class="button primary" data-action="bingo-proposal-csv">Download voorgestelde playlist (CSV) ↓</button><details class="bingo-proposal-order"><summary>Bekijk de 60 nummers en hun huidige Spotify-positie</summary><p>Huidig # is de positie in de Spotify-lijst die op ${esc(proposal.checked_date)} is gecontroleerd. Herorden de bestaande nummers volgens Nieuw #. Gala – Freed From Desire en Avicii – Levels blijven erin; Wrecking Ball en de onduidelijke vermelding “Codich” zijn niet nodig.</p><div class="table-scroll"><table class="standings-table"><thead><tr><th>Nieuw #</th><th>Huidig #</th><th>Nummer</th><th>Artiest</th><th>Op kaarten</th></tr></thead><tbody>${proposal.tracks.map(track=>`<tr><td>${track.position}</td><td>${track.spotify_position}</td><th scope="row"><a href="${esc(track.url)}" target="_blank" rel="noopener noreferrer">${esc(track.title)} ↗</a></th><td>${esc(track.artists)}</td><td>${track.cards.map(esc).join(' · ')}</td></tr>`).join('')}</tbody></table></div></details><p class="table-note">Dit is een voorstel. De Spotify-playlist, actieve DJ-volgorde en kaarten zijn nog niet aangepast. De controle van de huidige materialen staat hieronder.</p></section>`;
}
function bingoView(){
  const bingo=state.bingo;
  if(!bingo)return '<div class="org-title"><h1>Muziekbingo</h1></div><p>De materialen worden nog toegevoegd.</p>';
  const titles={first:'Diagonaal linksboven → rechtsonder',second:'Diagonaal rechtsboven → linksonder',full:'Volle kaart'};
  const newBasis=bingo.basis==='dj-nieuw';
  return `<div class="org-title"><div><p class="eyebrow dark">RONDE 5 · VOOR DE DJ EN ORGANISATIE</p><h1>Muziekbingo</h1><p>De nieuwe DJ-kaart is leidend · 60 nummers · circa 30 seconden per nummer met 3–5 seconden wisseltijd.</p></div><a class="button primary" href="${esc(bingo.playlist_url)}" target="_blank" rel="noopener noreferrer">Open Spotify ↗</a></div>${bingoProposalView(bingo.proposal)}<section class="org-panel bingo-instructions"><h2 class="bingo-subtitle">Instructies & winplanning</h2><p class="table-note">De broninstructie staat hieronder op halve breedte. Klik op de afbeelding om hem te vergroten.</p><button type="button" class="bingo-inline-preview" data-media="bingo-broninstructie.png" data-title="Broninstructie & winplanning" aria-label="Vergroot de broninstructie en winplanning"><img src="${API}/media/bingo-broninstructie.png" alt="Uitleg van de muziekbingo en de oorspronkelijke winplanning"><span>Vergroten ⤢</span></button></section><div class="org-panel bingo-material-buttons"><button class="button outline" data-media="dj-nieuw.png" data-title="DJ-kaart · leidende speelvolgorde">Open DJ-kaart</button>${[1,2,3].map(id=>`<a class="button outline" href="./?invulblad=bingo-${id}" target="_blank" rel="noopener">Bingokaart K${id} printen ↗</a>`).join('')}</div><div class="info-note">Volg de nummering van de nieuwe DJ-kaart, niet de volgorde van de Spotify-playlist. Gebruik Spotify om het juiste nummer op te zoeken en af te spelen.</div>${newBasis?`<div class="info-note bingo-source-warning"><strong>De gedrukte kaarten en de nieuwe DJ-kaart sluiten nog niet volledig op elkaar aan.</strong> Gala – Freed From Desire ontbreekt op de DJ-kaart, maar staat op alle drie de bingokaarten. Avicii – Levels ontbreekt ook en staat op K1. Een volle kaart is met deze combinatie van materialen niet mogelijk. De winmomenten #20, #40 en #58 op de bronafbeelding zijn daarom geen bevestigde winplanning. Hieronder staan de haalbare combinaties volgens de nieuwe DJ-volgorde.</div><div class="org-panel"><h2 class="bingo-subtitle">Combinaties volgens de nieuwe DJ-volgorde</h2><div class="table-scroll"><table class="standings-table"><thead><tr><th>Combinatie</th><th>K1</th><th>K2</th><th>K3</th></tr></thead><tbody>${Object.entries(titles).map(([key,title])=>`<tr><th scope="row">${title}</th>${['K1','K2','K3'].map(card=>`<td>${bingo.completions[card][key]==null?'Niet haalbaar':`Na DJ-nummer ${bingo.completions[card][key]}`}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="table-note">Berekend met de vakjes op de gedrukte kaarten. Een combinatie is pas compleet als ieder benodigd nummer is gespeeld. De tabel beschrijft afzonderlijke combinaties, niet de opeenvolgende prijsuitreiking.</p></div><div class="org-panel"><h2 class="bingo-subtitle">De 60 nummers op de nieuwe DJ-kaart</h2><p class="table-note">Deze nummering is leidend. De kaartvermeldingen van de DJ-kaart en de werkelijk gedrukte kaarten staan naast elkaar, zodat verschillen zichtbaar blijven. De titels #58 en #60 zijn uit de DJ-kaart overgenomen en nog niet aan een Spotify-track gekoppeld; bij #60 staat letterlijk “Codich”.</p><div class="table-scroll"><table class="standings-table bingo-track-table"><thead><tr><th>DJ #</th><th>Nummer</th><th>Artiest</th><th>Volgens DJ-kaart</th><th>Op gedrukte kaarten</th><th>Afspelen</th></tr></thead><tbody>${bingo.tracks.map(track=>`<tr class="${track.membership_differs?'bingo-card-difference':''}"><td>${track.position}</td><th scope="row">${esc(track.title)}</th><td>${track.artists.map(esc).join(', ')}</td><td>${track.dj_cards.join(' · ')}</td><td>${track.cards.join(' · ') || '—'}</td><td><a href="${esc(track.url || 'https://open.spotify.com/search/'+encodeURIComponent(track.artists[0]+' '+track.title))}" target="_blank" rel="noopener noreferrer">${track.url?'Spotify':'Zoek op Spotify'} ↗</a></td></tr>`).join('')}</tbody></table></div></div>`:'<div class="info-note">De nieuwe DJ-volgorde wordt geladen. Vernieuw de pagina voor de bijgewerkte lijst.</div>'}<button class="button primary" data-action="bingo-scores">Naar bingopunten per team →</button>`;
}
function settingsView(){
  return `<div class="org-title"><div><p class="eyebrow dark">DE SPELREGELS VOOR JULLIE QUIZ</p><h1>Instellingen</h1><p>Pas de puntentelling aan en sla iedere ronde apart op. Alle organisatoren gebruiken daarna dezelfde instellingen.</p></div></div><h2 class="settings-title">Puntentelling</h2><div class="info-note">Stel één puntenaantal voor de hele ronde in, of geef afzonderlijke vragen een ander maximum. Kies bij bestaande beoordelingen of je de punten wilt behouden of naar verhouding wilt herberekenen. Afgesloten rondes moet je eerst heropenen.</div>${state.rounds.map(round=>{
    const list=state.questions.filter(q=>q.round_id===round.id).sort((a,b)=>Number(a.id)-Number(b.id));
    const draft=scoringDrafts.get(round.id);
    const maxima=list.map(q=>draft?.values[q.id] ?? String(q.max_cents/100));
    const uniform=draft?.uniform ?? (new Set(maxima).size===1?maxima[0]:'');
    const reviewed=state.answers.filter(a=>a.round_id===round.id && a.points_cents!==null).length;
    const mode=draft?.mode || 'keep';
    const total=maxima.reduce((sum,value)=>sum+(Number.isFinite(Number(value))?Math.round(Number(value)*100):0),0);
    return `<form class="scoring-form org-panel" data-round="${esc(round.id)}"><div class="scoring-heading"><div><h3>${esc(roundLabel(round))}</h3><p>${list.length} onderdelen · <span data-round-total>maximaal ${formatPoints(total)} punten</span> · ${reviewed} opgeslagen beoordelingen</p></div><span class="tag ${round.closed?'pending':''}">${round.closed?'Afgesloten':'Aanpasbaar'}</span></div>${round.closed?`<p class="info-note">Heropen deze ronde bij Antwoorden & punten om de puntentelling te wijzigen.</p><button type="button" class="text-button" data-action="scoring-round" data-id="${esc(round.id)}">Naar deze ronde →</button>`:''}<fieldset ${round.closed?'disabled':''}><div class="scoring-uniform"><div><label for="uniform-${esc(round.id)}">Punten per goed antwoord in deze ronde</label><input id="uniform-${esc(round.id)}" name="uniform" type="number" min="0" max="1000" step="0.01" value="${esc(uniform)}" placeholder="Verschillende punten per vraag"></div><p class="scoring-uniform-help">Dit puntenaantal wordt direct voor alle onderdelen ingevuld. Klik daarna op Puntentelling opslaan.</p></div><details class="scoring-questions" ${draft?'open':''}><summary>Punten per afzonderlijke vraag of onderdeel</summary>${list.map((q,index)=>`<div class="scoring-question"><label for="score-${esc(round.id)}-${q.id}"><strong>${q.id}.</strong> ${esc(q.prompt)}</label><input id="score-${esc(round.id)}-${q.id}" aria-label="Maximum ronde ${esc(round.id)} vraag ${q.id}" data-scoring-question="${q.id}" name="question-${q.id}" type="number" min="0" max="1000" step="0.01" value="${esc(maxima[index])}" required></div>`).join('')}</details><label for="scoring-mode-${esc(round.id)}">Wat gebeurt er met bestaande beoordelingen?</label><select id="scoring-mode-${esc(round.id)}" name="existing_scores"><option value="keep" ${mode==='keep'?'selected':''}>Bestaande punten behouden</option><option value="scale" ${mode==='scale'?'selected':''}>Punten naar verhouding herberekenen</option></select><p class="scoring-help">Bij herberekenen wordt bijvoorbeeld 0,5 van 1 punt veranderd in 1 van 2 punten. Afronding gebeurt op twee decimalen. Antwoorden die nog niet zijn beoordeeld, blijven open.</p><button class="button primary" type="submit">Puntentelling opslaan</button></fieldset></form>`;
  }).join('')}`;
}
function captureScoringDraft(form){
  const rid=form.dataset.round;
  const old=scoringDrafts.get(rid);
  const values=Object.fromEntries(Array.from(form.querySelectorAll('[data-scoring-question]')).map(field=>[field.dataset.scoringQuestion,field.value]));
  const versions=old?.versions || Object.fromEntries(state.questions.filter(q=>q.round_id===rid).map(q=>[q.id,q.version]));
  scoringDrafts.set(rid,{values,versions,uniform:form.elements.uniform.value,mode:form.elements.existing_scores.value});
  const total=Object.values(values).reduce((sum,value)=>sum+(Number.isFinite(Number(value))?Math.round(Number(value)*100):0),0);
  form.querySelector('[data-round-total]').textContent=`maximaal ${formatPoints(total)} punten`;
  updateDirty();
}
async function mutation(path,body){
  pending++;saveIndicator();
  try{return await api(path,body);}
  finally{pending--;saveIndicator();}
}
async function saveAnswer(qid,points,button,teamId=selectedTeam){
  if(pending)return notice('Wacht tot de vorige wijziging is opgeslagen.');
  const row=button.closest('.team-answer-row');
  const area=row.querySelector(`[data-answer="${qid}"]`),current=getAnswer(qid,teamId);
  const key=answerKey(qid,teamId),draft=answerDrafts.get(key);
  const body={team_id:teamId,round_id:selectedRound,question_id:qid,version:draft?.version ?? current?.version ?? 0,answer:area.value};
  if(points!==undefined)body.points=points;
  if(button)button.disabled=true;
  try{
    const saved=await mutation('/answers/save',body);
    const index=state.answers.findIndex(a=>a.team_id===teamId && a.round_id===selectedRound && a.question_id===qid);
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
  answerDrafts.clear();modelDrafts.clear();teamDrafts.clear();scoringDrafts.clear();dirty=false;callback();render();
}
function download(name,content,type){const link=document.createElement('a');const url=URL.createObjectURL(new Blob([content],{type}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
root.addEventListener('toggle',event=>{
  const fold=event.target;
  if(!fold.dataset?.questionFold)return;
  if(fold.open)expandedQuestions.add(fold.dataset.questionFold);else expandedQuestions.delete(fold.dataset.questionFold);
},true);
root.addEventListener('input',event=>{
  const field=event.target;
  if(field.closest('.scoring-form')){
    const form=field.closest('.scoring-form');
    if(field.name==='uniform' && field.value!=='' && field.checkValidity())form.querySelectorAll('[data-scoring-question]').forEach(input=>{input.value=field.value;});
    else if(field.dataset.scoringQuestion){const values=[...form.querySelectorAll('[data-scoring-question]')].map(input=>input.value);form.elements.uniform.value=new Set(values).size===1?values[0]:'';}
    captureScoringDraft(form);return;
  }
  if(field.dataset.answer || field.dataset.points){
    const row=field.closest('.team-answer-row'),teamId=row.dataset.team;
    const qid=field.dataset.answer || field.dataset.points,key=answerKey(qid,teamId),current=getAnswer(qid,teamId);
    const old=answerDrafts.get(key);
    const points=row.querySelector(`[data-points="${qid}"]`);
    if(field.dataset.answer)points.value='';
    answerDrafts.set(key,{version:old?.version ?? current?.version ?? 0,answer:row.querySelector(`[data-answer="${qid}"]`).value,points:points.value});
  }else if(field.closest('.model-form')){
    const form=field.closest('.model-form'),data=Object.fromEntries(new FormData(form));
    const q=questions().find(q=>q.id===form.dataset.id);
    modelDrafts.set(modelKey(q.id),{...data,version:modelDrafts.get(modelKey(q.id))?.version ?? q.version});
  }else if(field.closest('.team-rename') || field.closest('#team-add-form')){
    const form=field.closest('form'),id=form.dataset.id || 'new',previous=teamDrafts.get(id),team=state.teams.find(item=>item.id===id);
    teamDrafts.set(id,{name:form.elements.name.value,members:form.elements.members.value,bingo_card:form.elements.bingo_card?.value ?? '',version:previous?.version ?? team?.version});
  }
  updateDirty();
});
root.addEventListener('change',event=>{
  if(event.target.name==='bingo_card'){
    const form=event.target.closest('form'),id=form.dataset.id || 'new',previous=teamDrafts.get(id),team=state.teams.find(item=>item.id===id);
    teamDrafts.set(id,{name:form.elements.name.value,members:form.elements.members.value,bingo_card:form.elements.bingo_card.value,version:previous?.version ?? team?.version});updateDirty();return;
  }
  if(event.target.id==='bingo-timing-mode'){bingoTimingMode=event.target.value;render();return;}

  if(event.target.closest('.scoring-form'))captureScoringDraft(event.target.closest('.scoring-form'));
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
  if(form.matches('.scoring-form')){
    captureScoringDraft(form);
    const rid=form.dataset.round,draft=scoringDrafts.get(rid),round=state.rounds.find(r=>r.id===rid);
    const reviewed=state.answers.filter(a=>a.round_id===rid && a.points_cents!==null).length;
    if(draft.mode==='scale' && reviewed && !await confirmAction('Puntentelling herberekenen',`${roundLabel(round)} heeft ${reviewed} opgeslagen beoordelingen. Bij gewijzigde maxima worden de bestaande punten naar verhouding aangepast en afgerond op twee decimalen. De ingevulde antwoorden blijven bewaard.`,'Opslaan en herberekenen'))return;
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    try{
      const result=await mutation('/settings/scoring',{round_id:rid,existing_scores:draft.mode,questions:Object.entries(draft.values).map(([id,value])=>({id,version:draft.versions[id],max_points:Number(value)}))});
      scoringDrafts.delete(rid);updateDirty();await refresh(true);
      notice(result.changed?`Puntentelling opgeslagen voor ${roundLabel(round)}.`:'De puntentelling stond al zo ingesteld.');
    }catch(error){notice(error.message,true);}finally{submit.disabled=false;}
    return;
  }
  button.disabled=true;
  try{
    if(form.id==='team-add-form'){await mutation('/teams/add',Object.fromEntries(new FormData(form)));teamDrafts.delete('new');updateDirty();await refresh(true);notice('Team toegevoegd.');document.getElementById('team-name')?.focus();}
    else if(form.matches('.team-rename')){const team=state.teams.find(t=>t.id===form.dataset.id);await mutation('/teams/update',{id:team.id,version:teamDrafts.get(team.id)?.version ?? team.version,...Object.fromEntries(new FormData(form))});teamDrafts.delete(team.id);updateDirty();await refresh(true);notice('Teamnaam en leden opgeslagen.');}
    else if(form.matches('.model-form')){const data=new FormData(form),q=questions().find(q=>q.id===form.dataset.id);await mutation('/questions/save',{round_id:selectedRound,id:q.id,version:q.version,prompt:data.get('prompt'),correct:data.get('correct'),alternatives:data.get('alternatives').split('\n').map(x=>x.trim()).filter(Boolean),max_points:Number(data.get('max_points'))});modelDrafts.delete(modelKey(q.id));updateDirty();await refresh(true);notice('Antwoordmodel opgeslagen.');}
  }catch(error){notice(error.message,true);}finally{button.disabled=false;}
});
root.addEventListener('click',async event=>{
  const questionSummary=event.target.closest('.question-fold-summary');
  if(questionSummary){
    const fold=questionSummary.parentElement;
    if(!fold.open)requestAnimationFrame(()=>fold.scrollIntoView({block:'start',behavior:'smooth'}));
    return;
  }
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.tab)return navigate(()=>{tab=button.dataset.tab;});
  if(button.dataset.media){
    button.disabled=true;
    try{
      const response=await fetch(API+'/media/'+button.dataset.media);
      if(!response.ok)throw new Error('Het bestand kon niet worden geopend.');
      const url=URL.createObjectURL(await response.blob());
      const dialog=document.getElementById('bingo-media');
      document.getElementById('bingo-media-title').textContent=button.dataset.title;
      const image=document.getElementById('bingo-media-image');image.src=url;image.alt=button.dataset.title;
      dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);image.removeAttribute('src');},{once:true});
      dialog.showModal();
    }catch(error){notice(error.message,true);}finally{button.disabled=false;}
    return;
  }
  if(button.dataset.score){const row=button.closest('.team-answer-row'),area=row.querySelector(`[data-answer="${button.dataset.score}"]`);if(!area.value.trim() && !await confirmAction('Geen antwoord genoteerd','Je kunt wel punten toekennen. Wil je doorgaan zonder het teamantwoord vast te leggen?','Punten opslaan'))return;return saveAnswer(button.dataset.score,Number(button.dataset.value),button,row.dataset.team);}
  const action=button.dataset.action;if(!action)return;
  try{
    if(action==='scoring-uniform'){
      const form=button.closest('.scoring-form'),field=form.elements.uniform;
      if(field.value==='' || !field.checkValidity()){notice('Vul een geldig puntenaantal tussen 0 en 1000 in.',true);field.focus();return;}
      form.querySelectorAll('[data-scoring-question]').forEach(input=>{input.value=field.value;});
      captureScoringDraft(form);notice('Punten ingevuld. Klik op Puntentelling opslaan om ze te bewaren.');return;
    }
    if(action==='scoring-round')return navigate(()=>{selectedRound=button.dataset.id;tab='nakijken';});
    if(action==='refresh')return navigate(()=>{refresh(true);});
    if(action==='grade-team')return navigate(()=>{selectedTeam=button.dataset.id;tab='nakijken';});
    if(action==='bingo-proposal-csv'){
      const rows=[['Nieuw volgnummer','Huidige Spotify-positie','Titel','Artiest','Spotify-link'],...state.bingo.proposal.tracks.map(t=>[t.position,t.spotify_position,t.title,t.artists,t.url])];
      const cell=value=>'"'+String(value).replace(/"/g,'""')+'"';
      download('Spotify-voorstel-muziekbingo.csv','\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');return;
    }
    if(action==='bingo-scores')return navigate(()=>{selectedRound='5';tab='nakijken';});
    if(action==='save-answer'){const row=button.closest('.team-answer-row'),qid=button.dataset.id,field=row.querySelector(`[data-points="${qid}"]`);if(!field.checkValidity())return field.reportValidity();return saveAnswer(qid,field.value===''?undefined:Number(field.value),button,row.dataset.team);}
    if(action==='ungrade')return saveAnswer(button.dataset.id,null,button,button.closest('.team-answer-row').dataset.team);
    if(action==='delete-team'){
      if(dirty)return notice('Sla je invoer eerst op voordat je een team verwijdert.',true);
      const team=state.teams.find(t=>t.id===button.dataset.id);
      if(!team)return;
      if(!await confirmAction('Team definitief verwijderen',`${team.name} en alle bijbehorende leden, antwoorden en punten worden definitief verwijderd. Dit kun je niet ongedaan maken.`,'Definitief verwijderen'))return;
      await mutation('/teams/delete',{id:team.id,version:team.version});
      teamDrafts.delete(team.id);
      for(const key of answerDrafts.keys())if(key.startsWith(team.id+'/'))answerDrafts.delete(key);
      updateDirty();await refresh(true);notice('Team verwijderd.');return;
    }
    if(action==='archive-team' || action==='restore-team'){
      const team=state.teams.find(t=>t.id===button.dataset.id),active=action==='restore-team';
      if(!active && !await confirmAction('Team uitsluiten',`${team.name} telt dan niet meer mee in de tussenstand. De antwoorden blijven bewaard.`,'Team uitsluiten'))return;
      await mutation('/teams/update',{id:team.id,version:team.version,active});await refresh(true);notice(active?'Team doet weer mee.':'Team uitgesloten.');
    }
    if(action==='match'){
      if(dirty)return notice('Sla je invoer eerst op.',true);
      let matched=0;
      for(const team of activeTeams()){const result=await mutation('/answers/match',{team_id:team.id,round_id:selectedRound});matched+=result.matched;}
      await refresh(true);notice(`${matched} gelijke antwoorden goed gerekend voor alle teams. De overige antwoorden beoordeel je zelf.`);
    }
    if(action==='round-status'){
      if(dirty)return notice('Sla je invoer eerst op.',true);
      const round=currentRound();
      if(!await confirmAction(round.closed?'Ronde heropenen':'Ronde afsluiten',round.closed?'Alle organisatoren kunnen deze ronde dan weer aanpassen.':'Deze ronde wordt voor alle organisatoren vergrendeld. Dit kan zodra alle actieve teams volledig zijn beoordeeld.',round.closed?'Heropenen':'Afsluiten'))return;
      await mutation('/rounds/status',{id:round.id,version:round.version,closed:!round.closed});await refresh(true);notice(round.closed?'Ronde heropend.':'Ronde afgesloten.');
    }
    if(action==='share'){await navigator.clipboard.writeText(`${location.origin}${location.pathname}`);notice('Beheerlink gekopieerd. Iedereen met deze link kan de quiz bijhouden.');}
    if(action==='backup'){const backup=await api('/backup');download(`pubquiz-reservekopie-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(backup,null,2),'application/json');notice('Reservekopie gedownload met teams, antwoorden, model en punten.');}
    if(action==='csv'){
      const result=summarize(state,through,includeBonus);
      const cell=value=>`"${String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`;
      const rows=[['Positie','Team',...result.rounds.map(round=>roundLabel(round)),'Totaal','Beoordeeld'],...result.entries.map(entry=>[entry.rank,entry.name,...result.rounds.map(round=>entry.scores[round.id].reviewed?formatPoints(entry.scores[round.id].points):''),formatPoints(entry.total),`${entry.reviewed}/${entry.questionCount}`])];
      download('pubquiz-tussenstand.csv','\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');
    }
    if(action==='project'){window.open(`organisator.html?scherm=stand&ronde=${through}&bonus=${includeBonus?'1':'0'}`,'_blank','noopener');}
    if(action==='change-actor'){if(dirty)return notice('Sla je invoer eerst op.',true);actor='';namePage();}
  }catch(error){notice(error.message || 'De actie is niet gelukt.',true);}
});
window.addEventListener('beforeunload',event=>{if(dirty || pending){event.preventDefault();event.returnValue='';}});
window.addEventListener('online',()=>refresh());
document.getElementById('close-bingo-media').addEventListener('click',()=>document.getElementById('bingo-media').close());
refresh(true);
setInterval(()=>{if(!document.hidden)refresh();},4000);
