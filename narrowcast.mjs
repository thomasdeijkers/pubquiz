import {summarize,summarizeRound} from './scoring.mjs';
import {standingsTable,podium} from './scoreboard.mjs';
import {makeDemoState} from './demo.mjs';
import {watchForUpdates} from './updates.mjs';

const demo=new URLSearchParams(location.search).get('demo')==='1';
let state,busy=false,page=0;
const root=document.getElementById('scores');
function draw(){
  if(!state)return;
  const result=summarize(state,'9',true);
  // Keep every row readable on televisions; additional teams rotate automatically.
  const rows=Math.max(4,Math.floor((root.clientHeight-50)/Math.max(42,innerHeight*.055)));
  const tablePages=Math.max(1,Math.ceil(result.entries.length/rows));
  const rounds=state.rounds.map(round=>({round,result:summarizeRound(state,round.id)})).filter(item=>item.result.entries.some(entry=>entry.reviewed>0));
  const screens=[{id:'podium',label:'Erepodium · totaal',result},...Array.from({length:tablePages},(_,index)=>({id:`table-${index}`,label:tablePages>1?`Totaalstand · pagina ${index+1}`:'Totaalstand',index})),...rounds.map(item=>({id:`round-${item.round.id}`,label:item.round.id==='bonus'?'Bonusronde':`Ronde ${item.round.id} · ${item.round.title}`,...item}))];
  const count=screens.length;
  page%=count;
  const current=screens[page];
  const picker=document.getElementById('screen-picker');
  if(picker.dataset.options!==screens.map(item=>item.id+item.label).join('|')){
    picker.replaceChildren(...screens.map(item=>new Option(item.label,item.id)));
    picker.dataset.options=screens.map(item=>item.id+item.label).join('|');
  }
  picker.value=current.id;
  document.body.classList.toggle('round-podium-screen',!!current.result);
  if(current.result){
    const roundResult=current.result;
    roundResult.provisional=!roundResult.entries.length || roundResult.entries.some(entry=>entry.reviewed<entry.questionCount);
    document.querySelector('h1').textContent=current.label;
    root.innerHTML=podium(roundResult,current.round?'De beste teams van deze ronde':'De beste teams van de pubquiz');
  }else{
    document.querySelector('h1').textContent='De tussenstand';
    root.innerHTML=standingsTable({...result,entries:result.entries.slice(current.index*rows,(current.index+1)*rows)});
  }
  document.getElementById('pages').textContent=count>1?`Scherm ${page+1} / ${count} · wisselt elke 10 seconden`:`${result.entries.length} teams · alle rondes + bonus`;

}
async function refresh(){
  if(busy)return;
  busy=true;
  try{
    const response=await fetch(`https://vps.opticore-insights.nl/pubquiz-api/v1/${demo?'state':'standings'}`,{cache:'no-store'});
    if(!response.ok)throw new Error('Geen verbinding');
    const next=await response.json();state=demo?makeDemoState(next):next;
    draw();document.body.classList.remove('offline');
    document.getElementById('sync').textContent=`${demo?'DEMO · fictieve scores':'● Live'} · bijgewerkt ${new Date().toLocaleTimeString('nl-NL')}`;
  }catch{
    document.body.classList.add('offline');
    document.getElementById('sync').textContent=state?'Verbinding verbroken · laatste stand blijft staan · opnieuw verbinden…':'Scores nog niet bereikbaar · opnieuw verbinden…';
  }finally{busy=false;}
}
document.getElementById('screen-picker').addEventListener('change',event=>{page=event.target.selectedIndex;draw();});
document.getElementById('fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{document.getElementById('fullscreen').textContent='Gebruik volledig scherm van je browser';}
});
document.addEventListener('fullscreenchange',()=>{
  document.body.classList.toggle('is-fullscreen',!!document.fullscreenElement);
  document.getElementById('fullscreen').textContent=document.fullscreenElement?'Volledig scherm sluiten':'Volledig scherm ⛶';
});
addEventListener('resize',draw);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(refresh,10000);
setInterval(()=>{page++;draw();},10000);
watchForUpdates();refresh();
