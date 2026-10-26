import {summarize,summarizeRound,formatPoints} from './scoring.mjs';
import {podium,roundPodium,standingsTable,trophy} from './scoreboard.mjs';
'use strict';
const byId = id => document.getElementById(id);
let quiz;
let slides = [];
let slideIndex = 0;
const viewer = byId('viewer');
const safe = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function init() {
  try {
    const response = await fetch('data/quiz.json');
    if (!response.ok) throw new Error('Inhoud niet beschikbaar');
    quiz = await response.json();
    if (new URLSearchParams(location.search).has('invulblad')) return renderSheet();
    byId('round-grid').innerHTML = quiz.rounds.map(round => `<article class="round-tile round-overview-tile"><details class="round-overview" data-overview="${round.id}"><summary class="round-overview-summary"><span class="round-number">${String(round.id).padStart(2,'0')}</span><span class="round-overview-title"><strong>${safe(round.title)}</strong><small>${safe(round.summary)}</small></span><span class="round-leader" data-round-leader="${round.id}">Stand laden…</span><span class="round-overview-arrow" aria-hidden="true">⌄</span></summary><div class="round-overview-body"><div class="round-overview-actions"><p>${safe(round.description)}</p><button class="button outline" data-round="${round.id}">Open ronde · vraagkaarten ↗</button></div><div data-round-podium="${round.id}"><p class="score-loading">De top 3 wordt geladen…</p></div></div></details><a class="round-control-link" href="organisator.html?tab=nakijken&amp;ronde=${round.id}" aria-label="Open controle ronde ${round.id} · ${safe(round.title)}">Open controle <span aria-hidden="true">→</span></a></article>`).join('');
    byId('collapse-rounds').addEventListener('click',()=>document.querySelectorAll('.round-overview[open]').forEach(round=>{round.open=false;}));
    document.querySelectorAll('[data-round]').forEach(button => button.addEventListener('click', () => openRound(Number(button.dataset.round))));
    byId('sheet-round').innerHTML = quiz.rounds.map(round => `<option value="${round.id}">${round.id}. ${safe(round.title)}</option>`).join('') + '<option value="bonus">Bonusronde · 30 afbeeldingen</option>';
    const bingo = quiz.rounds.find(round => round.id === 5);
    byId('bingo-printables').innerHTML = (bingo.printables || []).map(card => `<a class="button outline" href="?invulblad=${safe(card.id)}" target="_blank" rel="noopener">${safe(card.title)} printen ↗</a>`).join('');
    byId('sheet-round').innerHTML += (bingo.printables || []).map(card => `<option value="${safe(card.id)}">${safe(card.title)}</option>`).join('');
    byId('viewer-resource').addEventListener('click',async event=>{event.preventDefault();await closeViewer();location.hash='muziekbingo';});
    byId('print-sheet').addEventListener('click', () => { window.open(`?invulblad=${byId('sheet-round').value}`, '_blank', 'noopener'); });
    byId('open-bonus').addEventListener('click', openBonus);
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
function renderSheet() {
  const id = new URLSearchParams(location.search).get('invulblad');
  const bingoCard = quiz.rounds.find(round=>round.id===5).printables?.find(card=>card.id===id);
  if(bingoCard){
    document.title=bingoCard.title+' · Pubquiz';
    document.body.innerHTML=`<main class="print-page bingo-print"><div class="print-toolbar"><a href="./#muziekbingo">← Terug naar muziekbingo</a><button class="button primary" id="do-print">Print ${safe(bingoCard.title)}</button></div><h1>${safe(bingoCard.title)}</h1><div class="print-meta">Teamnaam: __________________________________________________</div><img src="${safe(bingoCard.src)}" alt="${safe(bingoCard.title)} met 36 muziekfragmenten"></main>`;
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
