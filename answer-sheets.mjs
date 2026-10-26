const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const sheetCheers={
  1:'Service, sneeuw en slimme koppen!',
  2:'Een berg vragen? Daar skiën wij zo doorheen.',
  3:'Volume omhoog, antwoorden paraat!',
  4:'Game, set en après-ski!',
  5:'Bingo! Deze piste is helemaal afgestreept.',
  6:'Van de Hoeksche Waard naar de hoogste score!',
  7:'Handen uit de wanten, punten pakken!',
  8:'Proost op de kennis, niet op de gok!',
  9:'Nog één afdaling naar de overwinning!',
  bonus:'Wie goed kijkt, pakt de bonus op de piste.',
  tafelkaart:'Ons team? Altijd op de top van de gezelligheid!'
};

export function tableCardSheet(teamName=''){
  const face=`<div class="tent-face"><img src="assets/clublogo-render.png" alt="T.V. Heynkensort"><p>APRÈS-SKI PUBQUIZ</p><div class="tent-nameboard"><strong data-sheet-team class="tent-team ${teamName.length>50?'tent-name-long':teamName.length>30?'tent-name-medium':''}">${escape(teamName)||'Jullie teamnaam'}</strong></div><span>T.V. HEYNKENSORT</span><span class="tent-cheer" data-sheet-cheer>${escape(sheetCheers.tafelkaart)}</span></div>`;
  return `<section class="team-sheet table-card-sheet" data-table-card><p class="table-card-instructions">Tafelkaart · A5 (148 × 210 mm) · Knip langs de buitenlijn en vouw op de stippellijn.</p><div class="table-tent" aria-label="Dubbelzijdige vouwkaart met teamnaam">${face}<span class="tent-fold-line">Vouw hier</span>${face}</div><p class="table-card-instructions">Vouw met de bedrukte zijden naar buiten en zet de kaart als een tentje op tafel.</p></section>`;
}

export function answerSheetPack(quiz, teamName='', bingoCard=1){
  const card=[1,2,3].includes(Number(bingoCard))?Number(bingoCard):1;
  const rounds=[...quiz.rounds,{id:'bonus',title:'Bonusronde',answerCount:quiz.bonus.answerCount}];
  return rounds.map((round,index)=>{
    const music=round.id===3,bingo=round.id===5,activity=round.id===7;
    const count=activity?2:round.answerCount;
    const title=round.id==='bonus'?'Bonusronde':`Ronde ${round.id} · ${round.title}`;
    const note=music?'Noteer per fragment de titel én de artiest.':bingo?'Streep de herkende nummers af. Bewaar deze kaart voor alle drie de bingo’s.':activity?'Laat de organisatie het resultaat van de activiteiten invullen.':'Vul het antwoord bij het juiste vraagnummer in.';
    const rows=Array.from({length:count},(_,i)=>`<div class="sheet-answer-row"><strong>${activity?['Hoogste toren','Beerpong'][i]:i+1}</strong>${music?'<span class="sheet-music-fields"><span>Titel:</span><span>Artiest:</span></span>':`<span class="sheet-write-line">${activity?'Resultaat / punten:':''}</span>`}</div>`).join('');
    return `<section class="team-sheet ${bingo?'team-sheet-bingo':''}" data-sheet-round="${round.id}"><header class="team-sheet-header"><img src="assets/clublogo-render.png" alt="T.V. Heynkensort"><div><p>APRÈS-SKI PUBQUIZ · T.V. HEYNKENSORT</p><h1>${escape(title)}</h1></div><span class="sheet-round-badge">${round.id==='bonus'?'B':String(round.id).padStart(2,'0')}</span></header><div class="sheet-team"><span>Teamnaam</span><strong data-sheet-team>${escape(teamName)||'________________________________________________'}</strong></div><p class="sheet-note">${note}</p>${bingo?`<img class="sheet-bingo-card" src="assets/bingo-kaart-${card}.png" alt="Bingokaart K${card}" data-pack-bingo>`:`<div style="--sheet-rows:${Math.ceil(count/2)}" class="sheet-answer-grid ${count>18?'sheet-two-columns':''} ${music?'sheet-music':''} ${activity?'sheet-activities':''}">${rows}</div>`}<footer class="team-sheet-footer"><span data-sheet-cheer>${escape(sheetCheers[round.id])}</span><span>${bingo?`<span data-pack-card-label>Kaart K${card}</span>`:'Punten: __________'}</span><span>Blad ${index+1} / ${rounds.length}</span></footer></section>`;
  }).join('')+tableCardSheet(teamName);
}
