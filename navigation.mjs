export function headerMenu({admin=false,active=''}={}){
  const demo=new URLSearchParams(location.search).get('demo')==='1';
  const items=[['teams','Teams'],['perteam','Scores invullen'],['model','Antwoordmodel'],['masterprint','Vraagkaarten printen (2 op A4)'],['spelregels','Spelregels printen'],['bingo','Muziekbingo · Spotify'],['settings','Instellingen & punten']];
  const tabs={spelregels:'spelregels',masterprint:'masterprint',settings:'instellingen',model:'model',bingo:'bingo',teams:'teams',perteam:'perteam',nakijken:'nakijken',stand:'stand'};
  return `<details class="header-menu"><summary class="header-menu-toggle" aria-label="Navigatiemenu"><span class="hamburger-icon" aria-hidden="true"><i></i><i></i><i></i></span><span>Menu</span></summary><nav class="header-menu-panel" aria-label="Alle pagina’s"><div class="menu-panel-heading"><strong>Organisatie</strong></div><div class="menu-question-search"><label for="menu-question-query">Zoek een vraag</label><input id="menu-question-query" type="search" placeholder="Bijv. tennis of cocktail" autocomplete="off" aria-controls="menu-question-results"><div id="menu-question-results" class="menu-question-results" aria-live="polite"></div></div><div class="menu-group">${items.map(([id,label])=>admin?`<button type="button" data-tab="${id}" ${active===id?'aria-current="page"':''}>${label}</button>`:`<a href="organisator.html?tab=${tabs[id]}">${label}</a>`).join('')}<a href="narrowcast.html${demo?'?demo=1':''}" target="_blank" rel="noopener noreferrer">Tussenstand · narrowcast ↗</a><a href="https://vps.opticore-insights.nl/pubquiz-api/v1/media/pubquiz-presentatie.pdf#view=Fit&amp;pagemode=none" target="_blank" rel="noopener noreferrer">Presentatie (pdf) ↗</a><a href="https://vps.opticore-insights.nl/pubquiz-api/v1/media/drankkaart.pdf#view=Fit&amp;pagemode=none" target="_blank" rel="noopener noreferrer">Drankkaart (pdf) ↗</a></div><div class="menu-group menu-version-links"><a href="./?demo=1" class="${demo?'version-active':''}">Demo bekijken${demo?'<span>Actief</span>':''}</a><a href="./" data-exit-demo="true" class="${!demo?'version-active':''}">Echte quiz${!demo?'<span>Actief</span>':''}</a></div></nav></details>`;
}
// Native details provides keyboard activation and the expanded state.
if(typeof document!=='undefined')document.addEventListener('click',event=>{
  const menu=document.querySelector('.header-menu[open]');
  if(!menu)return;
  if(!menu.contains(event.target) || event.target.closest('.header-menu-panel a,.header-menu-panel button'))menu.open=false;
});
if(typeof document!=='undefined')document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const menu=document.querySelector('.header-menu[open]');
  if(menu){menu.open=false;menu.querySelector('summary').focus();event.preventDefault();}
});

const escapeSearch=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const searchText=value=>String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('nl');
export function findQuestions(state,query){
  const words=searchText(query).trim().split(/\s+/).filter(Boolean);
  if(!words.length)return [];
  return state.questions.filter(q=>{
    const round=state.rounds.find(r=>String(r.id)===String(q.round_id));
    const text=searchText(`${q.prompt} ${round?.title || ''} ${q.round_id==='bonus'?'bonus':`ronde ${q.round_id}`} vraag ${q.id}`);
    return words.every(word=>text.includes(word));
  });
}
export function questionLink(question,demo=false){
  const params=new URLSearchParams({tab:'nakijken',ronde:question.round_id,vraag:question.id});
  if(demo)params.set('demo','1');
  return `organisator.html?${params}`;
}
let questionIndex;
async function loadQuestionIndex(){
  if(!questionIndex)questionIndex=fetch('https://vps.opticore-insights.nl/pubquiz-api/v1/state').then(async response=>{
    if(!response.ok)throw new Error('Zoeken niet beschikbaar');
    const state=await response.json();
    return {rounds:state.rounds.map(({id,title})=>({id,title})),questions:state.questions.map(({id,round_id,prompt})=>({id,round_id,prompt}))};
  }).catch(error=>{questionIndex=null;throw error;});
  return questionIndex;
}
if(typeof document!=='undefined')document.addEventListener('input',async event=>{
  if(event.target.id!=='menu-question-query')return;
  const input=event.target,results=document.getElementById('menu-question-results'),query=input.value.trim();
  if(query.length<2){results.textContent=query?'Typ minimaal 2 tekens.':'';return;}
  results.textContent='Vragen zoeken…';
  try{
    const state=await loadQuestionIndex();
    if(!input.isConnected || input.value.trim()!==query)return;
    const matches=findQuestions(state,query);
    results.innerHTML=matches.length?matches.map(q=>{
      const round=state.rounds.find(r=>String(r.id)===String(q.round_id));
      const label=q.round_id==='bonus'?'Bonusronde':`Ronde ${q.round_id} · ${round?.title || ''}`;
      return `<a href="${escapeSearch(questionLink(q,new URLSearchParams(location.search).get('demo')==='1'))}"><small>${escapeSearch(label)} · Vraag ${escapeSearch(q.id)}</small><span>${escapeSearch(q.prompt)}</span></a>`;
    }).join(''):'Geen vragen gevonden.';
  }catch{if(input.isConnected && input.value.trim()===query)results.textContent='Zoeken lukt nu niet. Typ opnieuw om het nog eens te proberen.';}
});
if(typeof document!=='undefined')document.addEventListener('keydown',event=>{
  if(event.target.id==='menu-question-query' && event.key==='Enter'){
    event.preventDefault();document.querySelector('#menu-question-results a')?.click();
  }
});
