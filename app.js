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
    byId('round-grid').innerHTML = quiz.rounds.map(round => `<button class="round-card" data-round="${round.id}"><div class="card-top"><span class="round-number">${String(round.id).padStart(2,'0')}</span><span class="tag ${round.pending ? 'pending' : ''}">${safe(round.type)}</span></div><h3>${safe(round.title)}</h3><p class="card-description">${safe(round.description)}</p><div class="card-bottom"><span>${safe(round.summary)}</span><span aria-hidden="true">Open ronde ↗</span></div></button>`).join('');
    document.querySelectorAll('[data-round]').forEach(button => button.addEventListener('click', () => openRound(Number(button.dataset.round))));
    byId('sheet-round').innerHTML = quiz.rounds.map(round => `<option value="${round.id}">${round.id}. ${safe(round.title)}</option>`).join('') + '<option value="bonus">Bonusronde · 30 afbeeldingen</option>';
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
