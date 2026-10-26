export function trophy(rank){
  const name=rank===1?'gouden':rank===2?'zilveren':'bronzen';
  return `<svg class="trophy-cup trophy-${rank}" viewBox="0 0 48 54" role="img" aria-label="Plaats ${rank} · ${name} beker"><path class="cup-handles" d="M12 9H4v8c0 7 5 12 12 12M36 9h8v8c0 7-5 12-12 12" fill="none" stroke="currentColor" stroke-width="4"/><path d="M12 5h24v12c0 10-5 16-12 16s-12-6-12-16Z" fill="currentColor"/><path d="M17 7h4v13c0 3 1 6 2 8-4-2-6-6-6-11Z" fill="#fff" opacity=".4"/><path d="M21 32h6v10h7v5H14v-5h7Z" fill="currentColor"/><rect x="10" y="47" width="28" height="5" rx="2" fill="#5a3a24"/><text x="24" y="23" text-anchor="middle" font-size="13" font-weight="700" fill="#493720">${rank}</text></svg>`;
}
import {formatPoints,summarizeRound} from './scoring.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function podium(result, title='Top 3', compact=false) {
  const entries=result.entries.filter(entry=>entry.reviewed>0);
  // Unreviewed teams have zero points but do not take a podium position.
  let previous;let rank=0;
  const leaders=entries.map((entry,index)=>{if(entry.total!==previous)rank=index+1;previous=entry.total;return {...entry,rank};}).filter(entry=>entry.rank<=3);
  return `<section class="quiz-podium ${compact?'compact':''}" aria-label="${esc(title)}"><div class="podium-heading"><strong>${esc(title)}</strong><span>${leaders.length?(result.provisional?'Voorlopig':'Definitief'):'Nog geen punten'}</span></div>${leaders.length?`<ol class="podium-list">${leaders.map(entry=>`<li class="podium-place place-${entry.rank}">${trophy(entry.rank)}<span class="podium-team">${esc(entry.name)}</span><strong>${formatPoints(entry.total)} <small>pt</small></strong></li>`).join('')}</ol>`:'<p class="podium-empty">De eerste scores komen eraan. Wie pakt de koppositie?</p>'}</section>`;
}
export function roundPodium(state,id,compact=true){return podium(summarizeRound(state,id),'Top 3 · deze ronde',compact);}
export function standingsTable(result){
  return `<div class="scoreboard-scroll" tabindex="0" role="region" aria-label="Alle teams en hun punten per ronde"><table class="quiz-scoreboard"><thead><tr><th scope="col">Pos.</th><th scope="col">Team</th>${result.rounds.map(r=>`<th scope="col" title="${esc(r.title)}">${r.id==='bonus'?'Bonus':`R${esc(r.id)}`}</th>`).join('')}<th scope="col">Totaal</th></tr></thead><tbody>${result.entries.map(entry=>`<tr><td class="score-rank">${entry.rank}</td><th scope="row">${esc(entry.name)}</th>${result.rounds.map(r=>{const s=entry.scores[r.id];return `<td title="${s.reviewed} van ${s.total} beoordeeld">${s.reviewed?formatPoints(s.points):'—'}${s.reviewed>0 && s.reviewed<s.total?'<sup>*</sup>':''}</td>`;}).join('')}<td class="score-total">${formatPoints(entry.total)}</td></tr>`).join('') || `<tr><td colspan="${result.rounds.length+3}" class="score-empty">De teams verschijnen hier zodra de organisatie ze toevoegt.</td></tr>`}</tbody></table></div>`;
}
