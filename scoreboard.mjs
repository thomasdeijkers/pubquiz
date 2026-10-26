import {formatPoints,summarizeRound} from './scoring.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function podium(result, title='Top 3', compact=false) {
  const entries=result.entries.filter(entry=>entry.reviewed>0);
  // Unreviewed teams have zero points but do not take a podium position.
  let previous;let rank=0;
  const leaders=entries.map((entry,index)=>{if(entry.total!==previous)rank=index+1;previous=entry.total;return {...entry,rank};}).filter(entry=>entry.rank<=3);
  return `<section class="quiz-podium ${compact?'compact':''}" aria-label="${esc(title)}"><div class="podium-heading"><strong>${esc(title)}</strong><span>${leaders.length?(result.provisional?'Voorlopig':'Definitief'):'Nog geen punten'}</span></div>${leaders.length?`<ol class="podium-list">${leaders.map(entry=>`<li class="podium-place place-${entry.rank}"><span class="medal" aria-label="Plaats ${entry.rank}">${entry.rank}</span><span class="podium-team">${esc(entry.name)}</span><strong>${formatPoints(entry.total)} <small>pt</small></strong></li>`).join('')}</ol>`:'<p class="podium-empty">De eerste scores komen eraan. Wie pakt de koppositie?</p>'}</section>`;
}
export function roundPodium(state,id,compact=true){return podium(summarizeRound(state,id),'Top 3 · deze ronde',compact);}
export function standingsTable(result){
  return `<div class="scoreboard-scroll" tabindex="0" role="region" aria-label="Alle teams en hun punten per ronde"><table class="quiz-scoreboard"><thead><tr><th scope="col">Pos.</th><th scope="col">Team</th>${result.rounds.map(r=>`<th scope="col" title="${esc(r.title)}">${r.id==='bonus'?'Bonus':`R${esc(r.id)}`}</th>`).join('')}<th scope="col">Totaal</th></tr></thead><tbody>${result.entries.map(entry=>`<tr><td class="score-rank">${entry.rank}</td><th scope="row">${esc(entry.name)}</th>${result.rounds.map(r=>{const s=entry.scores[r.id];return `<td title="${s.reviewed} van ${s.total} beoordeeld">${s.reviewed?formatPoints(s.points):'—'}${s.reviewed>0 && s.reviewed<s.total?'<sup>*</sup>':''}</td>`;}).join('')}<td class="score-total">${formatPoints(entry.total)}</td></tr>`).join('') || `<tr><td colspan="${result.rounds.length+3}" class="score-empty">De teams verschijnen hier zodra de organisatie ze toevoegt.</td></tr>`}</tbody></table></div>`;
}
