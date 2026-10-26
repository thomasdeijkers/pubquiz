import {answerSheetPack} from './answer-sheets.mjs';
import {headerMenu} from './navigation.mjs';
import {summarize,summarizeRound,formatPoints} from './scoring.mjs';
import {podium,roundPodium,standingsTable,trophy} from './scoreboard.mjs';
'use strict';
const byId = id => document.getElementById(id);
let quiz;
let slides = [];
let slideIndex = 0;
const viewer = byId('viewer');
byId('header-menu-slot').innerHTML=headerMenu();
const pageHeader=document.querySelector('.topbar');
if(pageHeader && typeof ResizeObserver!=='undefined')new ResizeObserver(()=>document.documentElement.style.setProperty('--header-offset',`${Math.ceil(pageHeader.getBoundingClientRect().height)+16}px`)).observe(pageHeader);
const safe = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function init() {
  try {
    const response = await fetch('data/quiz.json');
    if (!response.ok) throw new Error('Inhoud niet beschikbaar');
    quiz = await response.json();
    if (new URLSearchParams(location.search).has('invulblad')) return renderSheet();
    const overviewRounds=[...quiz.rounds,{id:'bonus',title:'Bonusronde',summary:'30 afbeeldingen · de hele avond',description:'Herken de personen, plaatsen en voorwerpen op de bonuskaart. Deze ronde loopt de hele avond door.'}];
    byId('round-grid').innerHTML = overviewRounds.map(round => `<article class="round-tile round-overview-tile" id="${round.id==='bonus'?'bonus':'ronde-'+round.id}"><details class="round-overview" data-overview="${round.id}"><summary class="round-overview-summary"><span class="round-number">${round.id==='bonus'?'B':String(round.id).padStart(2,'0')}</span><span class="round-overview-title"><strong>${safe(round.title)}</strong><small>${safe(round.summary)}</small></span><span class="round-leader" data-round-leader="${round.id}">Stand laden…</span><span class="round-overview-arrow" aria-hidden="true">⌄</span></summary><div class="round-overview-body"><div class="round-overview-actions"><p>${safe(round.description)}</p>${[3,5].includes(round.id)?'<a class="button outline" href="organisator.html?tab=bingo">Uitleg, playlist & bingokaarten →</a>':`<button class="button outline" data-round="${round.id}">${round.id==='bonus'?'Open de bonuskaart':'Open ronde · vraagkaarten'} ↗</button>`}${round.id===5?'':`<a class="button outline" href="?invulblad=${round.id}" target="_blank" rel="noopener">Invulblad printen ↗</a>`}</div><div data-round-podium="${round.id}"><p class="score-loading">De top 3 wordt geladen…</p></div></div></details><a class="round-control-link" href="organisator.html?tab=nakijken&amp;ronde=${round.id}" aria-label="Open controle ronde ${round.id} · ${safe(round.title)}">Open controle <span aria-hidden="true">→</span></a></article>`).join('');
    byId('collapse-rounds').addEventListener('click',()=>document.querySelectorAll('.round-overview[open]').forEach(round=>{round.open=false;}));
    document.querySelectorAll('[data-round]').forEach(button => button.addEventListener('click', () => button.dataset.round==='bonus'?openBonus():openRound(Number(button.dataset.round))));
    byId('start').addEventListener('click', () => {
      slides = quiz.rounds.flatMap(round => round.cards.map(card => ({...card, round: round.title, id: round.id, note: round.note || ''})));
      showViewer();
    });
    byId('close-viewer').addEventListener('click', closeViewer);
    byId('previous').addEventListener('click', () => changeSlide(-1));
    byId('next').addEventListener('click', () => changeSlide(1));
    byId('slide').addEventListener('error', () => { byId('image-error').hidden = false; });
    byId('fullscreen').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (viewer.requestFullscreen) await viewer.requestFullscreen();
      } catch { byId('viewer-note').textContent = 'Volledig scherm is niet beschikbaar. De presentatie blijft hier geopend.'; }
    });
    document.addEventListener('keydown', event => {
      if (!viewer.open) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); changeSlide(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); changeSlide(-1); }
    });
    viewer.addEventListener('close', () => { document.body.style.overflow = ''; });
    initScoreboard();
    const round = Number(new URLSearchParams(location.search).get('ronde'));
    if (quiz.rounds.some(item => item.id === round)) openRound(round);
  } catch (error) {
    byId('round-grid').innerHTML = '<p class="fatal-error">De quiz kon niet worden geladen. Vernieuw de pagina om het opnieuw te proberen.</p>';
    console.error(error);
  }
}
function openRound(id) {
  const round = quiz.rounds.find(item => item.id === id);
  slides = round.cards.map(card => ({...card, round: round.title, id, note: round.note || ''}));
  showViewer();
}
function openBonus() {
  slides = [{src:quiz.bonus.image, label:'30 afbeeldingen', round:'De bonusronde', id:'BONUS', note:'Deze ronde loopt de hele avond door. Gebruik het bonusblad voor jullie antwoorden.'}];
  showViewer();
}
function showViewer() {
  slideIndex = 0;
  updateSlide();
  viewer.showModal();
  document.body.style.overflow = 'hidden';
}
async function closeViewer() {
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} }
  viewer.close();
}
function changeSlide(direction) {
  const next = slideIndex + direction;
  if (next < 0 || next >= slides.length) return;
  slideIndex = next;
  updateSlide();
}
function updateSlide() {
  const slide = slides[slideIndex];
  byId('viewer-kicker').textContent = slide.id === 'BONUS' ? 'BONUSRONDE' : `RONDE ${slide.id}`;
  byId('viewer-title').textContent = slide.round;
  byId('viewer-note').textContent = slide.note;
  byId('viewer-control').href = `organisator.html?tab=nakijken&ronde=${slide.id==='BONUS'?'bonus':slide.id}`;
  byId('viewer-resource').hidden = slide.id !== 5;
  byId('image-error').hidden = true;
  byId('slide').src = slide.src;
  byId('slide').alt = `${slide.round} — ${slide.label}`;
  byId('slide-label').textContent = `${slide.label} · ${slideIndex+1} / ${slides.length}`;
  byId('previous').disabled = slideIndex === 0;
  byId('next').disabled = slideIndex === slides.length-1;
  const next = slides[slideIndex+1];
  if (next) { const preload = new Image(); preload.src = next.src; }
}
function renderTeamPack(){
  const params=new URLSearchParams(location.search);
  let team=(params.get('team') || '').slice(0,80);
  const bingo=[1,2,3].includes(Number(params.get('bingokaart')))?Number(params.get('bingokaart')):1;
  document.body.className='print-pack';
  document.title=`Invulbladen · ${team || 'Pubquiz'}`;
  document.body.innerHTML=`<div class="pack-toolbar"><a class="pack-back" href="organisator.html?tab=teams">← Terug naar teams</a><label>Teamnaam<input id="pack-team" maxlength="80" value="${safe(team)}" placeholder="Vul de teamnaam in"></label><label>Bingokaart<select id="pack-bingo">${[1,2,3].map(id=>`<option value="${id}" ${id===bingo?'selected':''}>K${id}</option>`).join('')}</select></label><button class="button primary" id="print-pack">Print complete set (10 bladen) ↗</button><p>Een A4 per ronde, inclusief een bingokaart en het bonusblad. Pas hierboven eventueel de teamnaam of bingokaart aan. Print op 100% / werkelijke grootte.</p></div><main id="sheet-pack">${answerSheetPack(quiz,team,bingo)}</main>`;
  byId('pack-team').addEventListener('input',event=>{
    team=event.target.value;
    document.querySelectorAll('[data-sheet-team]').forEach(label=>{label.textContent=team || '________________________________________________';});
    document.title=`Invulbladen · ${team || 'Pubquiz'}`;
  });
  byId('pack-bingo').addEventListener('change',event=>{
    const card=event.target.value,image=document.querySelector('[data-pack-bingo]');
    image.src=`assets/bingo-kaart-${card}.png`;image.alt=`Bingokaart K${card}`;
    document.querySelector('[data-pack-card-label]').textContent=`Kaart K${card}`;
  });
  byId('print-pack').addEventListener('click',async()=>{
    const button=byId('print-pack');button.disabled=true;
    try{await document.fonts.ready;await Promise.all([...document.querySelectorAll('#sheet-pack img')].map(image=>image.decode()));window.print();}
    catch{alert('Een afbeelding kon niet worden geladen. Vernieuw de pagina en probeer opnieuw.');}
    finally{button.disabled=false;}
  });
}
function renderSheet() {
  const id = new URLSearchParams(location.search).get('invulblad');
  if(id==='alle')return renderTeamPack();
  const bingoCard = quiz.rounds.find(round=>round.id===5).printables?.find(card=>card.id===id);
  if(bingoCard){
    document.title=bingoCard.title+' · Pubquiz';
    document.body.innerHTML=`<main class="print-page bingo-print"><div class="print-toolbar"><a href="organisator.html?tab=bingo">← Terug naar muziekbingo</a><button class="button primary" id="do-print">Print ${safe(bingoCard.title)}</button></div><h1>${safe(bingoCard.title)}</h1><div class="print-meta">Teamnaam: __________________________________________________</div><img src="${safe(bingoCard.src)}" alt="${safe(bingoCard.title)} met 36 muziekfragmenten"></main>`;
    byId('do-print').addEventListener('click',()=>window.print());return;
  }
  const round = id === 'bonus' ? {title:'Bonusronde', id:'Bonus', answerCount:30} : quiz.rounds.find(item => String(item.id) === id);
  if (!round) throw new Error('Ronde bestaat niet');
  document.title = `Invulblad · ${round.title}`;
  const activity = round.id === 7;
  const bingo = round.id === 5;
  const rows = activity ? ['Hoogste toren (hoogte / punten)','Beerpong (aantal treffers / punten)'] : bingo ? ['Kaartnummer','Eerste bingo','Tweede bingo','Volle kaart'] : Array.from({length:round.answerCount},(_,i) => String(i+1));
  document.body.innerHTML = `<main class="print-page"><div class="print-toolbar"><a href="./">← Terug naar de quiz</a><button class="button primary" id="do-print">Print invulblad</button></div><p class="eyebrow dark">APRÈS-SKI PUBQUIZ · T.V. HEYNKENSORT</p><h1>${safe(round.id === 'Bonus' ? '' : `Ronde ${round.id} · `)}${safe(round.title)}</h1><div class="print-meta">Teamnaam: __________________________________________________<br>Teamnummer: _____________________ &nbsp; Totaal punten: ______________</div>${round.id === 3 ? '<p>Noteer per fragment de titel en de artiest. De definitieve fragmenten volgen nog.</p>' : ''}${bingo ? '<p>Gebruik voor het spelen de originele bingokaart die bij de quiz wordt uitgedeeld. Dit blad is alleen om de bingo’s te registreren.</p>' : ''}<div class="answer-grid">${rows.map(row => `<div class="answer-row"><b>${safe(row)}</b>${round.id === 3 ? '<span>Titel / artiest:</span>' : ''}</div>`).join('')}</div></main>`;
  byId('do-print').addEventListener('click', () => window.print());
}
init();

let scoreState;
let scoreBusy=false;
function drawScoreboard(){
  if(!scoreState)return;
  document.querySelectorAll('[data-round-podium]').forEach(node=>{node.innerHTML=roundPodium(scoreState,node.dataset.roundPodium);});
  document.querySelectorAll('[data-round-leader]').forEach(node=>{
    const result=summarizeRound(scoreState,node.dataset.roundLeader);
    const leaders=result.entries.filter(entry=>entry.reviewed>0);
    const best=leaders[0];
    const ties=leaders.filter(entry=>entry.total===best?.total).length;
    node.innerHTML=best?`${trophy(1)}<span>${safe(best.name)}${ties>1?` + ${ties-1}`:''}</span><strong>${formatPoints(best.total)} pt</strong>`:'<span>Nog geen punten</span>';
  });
  const through=byId('public-through').value;
  const result=summarize(scoreState,through,byId('public-bonus').checked);
  byId('public-podium').innerHTML=podium(result,'Het erepodium · totaal');
  const oldTable=byId('public-standings').querySelector('.scoreboard-scroll');
  const horizontal=oldTable?.scrollLeft || 0;
  const focused=oldTable===document.activeElement;
  byId('public-standings').innerHTML=standingsTable(result);
  const newTable=byId('public-standings').querySelector('.scoreboard-scroll');
  newTable.scrollLeft=horizontal;
  if(focused)newTable.focus({preventScroll:true});
  byId('public-score-note').textContent=result.provisional?'Voorlopige stand · Alleen toegekende punten tellen mee. — Nog niet beoordeeld. * Nog niet volledig nagekeken.':'Alle geselecteerde rondes zijn afgesloten. Gelijke scores delen dezelfde plaats.';
}
async function loadScoreboard(){
  if(scoreBusy || document.hidden)return;
  scoreBusy=true;
  try{
    const response=await fetch('https://vps.opticore-insights.nl/pubquiz-api/v1/standings');
    if(!response.ok)throw new Error('Geen stand');
    const next=await response.json();
    const changed=JSON.stringify(next)!==JSON.stringify(scoreState);
    scoreState=next;
    if(changed)drawScoreboard();
    byId('public-score-sync').textContent='Live bijgewerkt · '+new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
  }catch{
    byId('public-score-sync').textContent=scoreState?'Verbinding onderbroken · laatst opgehaalde stand':'De tussenstand is even niet bereikbaar. We proberen opnieuw.';
    if(!scoreState)byId('public-standings').innerHTML='<p class="scoreboard-note">De scores verschijnen hier zodra de verbinding terug is.</p>';
    if(!scoreState)document.querySelectorAll('[data-round-leader]').forEach(node=>{node.textContent='Stand tijdelijk niet bereikbaar';});
    if(!scoreState)document.querySelectorAll('[data-round-podium]').forEach(node=>{node.innerHTML='<p class="score-loading">De top 3 volgt zodra de verbinding terug is.</p>';});
  }finally{scoreBusy=false;}
}
function initScoreboard(){
  byId('public-through').innerHTML=quiz.rounds.map(round=>`<option value="${round.id}" ${round.id===9?'selected':''}>Ronde ${round.id} · ${safe(round.title)}</option>`).join('');
  byId('public-through').addEventListener('change',drawScoreboard);
  byId('public-bonus').addEventListener('change',drawScoreboard);
  loadScoreboard();
  setInterval(loadScoreboard,5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadScoreboard();});
}
