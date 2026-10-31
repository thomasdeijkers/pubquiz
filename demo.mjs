// Fictieve beoordelingen worden uitsluitend in het browsergeheugen gemaakt.
export function makeDemoState(original){
  const state=structuredClone(original);
  const teams=state.teams.filter(t=>t.active).sort((a,b)=>a.name.localeCompare(b.name,'nl'));
  const random=seed=>{let n=2166136261;for(const c of seed){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return (n>>>0)/4294967296;};
  state.rounds.forEach(r=>{r.closed=true;});
  state.questions.forEach(q=>{if(!q.max_cents)q.max_cents=q.round_id==='5'?({'1':1000,'2':500,'3':300}[q.id] || 100):100;});
  state.answers=teams.flatMap((team,index)=>state.questions.map(q=>{
    const chance=.55+(index%5)*.055+random(`${team.id}/${q.round_id}`)*.18;
    const correct=q.round_id==='5'?index===Number(q.id)%teams.length:random(`${q.round_id}/${q.id}/${team.id}`)<chance;
    return {team_id:team.id,round_id:q.round_id,question_id:q.id,answer:correct?(q.correct || 'Fictief goed antwoord'):'Fictief fout antwoord',points_cents:correct?q.max_cents:0,updated_by:'Demo',updated_at:'2026-10-31T21:00:00Z',version:1};
  }));
  state.revision=`demo-${original.revision || 1}`;
  return state;
}

export function installDemo(){
  if(document.querySelector('.demo-banner'))return;
  document.body.classList.add('demo-mode');
  document.querySelectorAll('a[href="narrowcast.html"]').forEach(link=>{link.href='narrowcast.html?demo=1';});
  const original=new URL(location.href);original.searchParams.delete('demo');
  const banner=document.createElement('aside');banner.className='demo-banner';
  banner.innerHTML='<div><strong>DEMO · fictieve resultaten</strong><span>Alle rondes ingevuld · echte quiz blijft bewaard</span></div>';
  const exit=document.createElement('a');exit.href=original.href;exit.dataset.exitDemo='true';exit.textContent='Terug naar echte quiz';banner.append(exit);
  document.body.append(banner);
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');if(!link || link.dataset.exitDemo)return;
    const target=new URL(link.href,location.href);
    if(target.origin===location.origin && /\/(?:index\.html|organisator\.html|narrowcast\.html)?$/.test(target.pathname) && !target.searchParams.has('invulblad')){
      target.searchParams.set('demo','1');link.href=target.href;
    }
  },true);
}
