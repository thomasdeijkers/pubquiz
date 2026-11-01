import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function screen(search=''){
  const source=(await readFile(new URL('../narrowcast.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
  const elements=new Map(),timers=new Map();let nextTimer=0,requests=0;
  const element=id=>{
    if(!elements.has(id))elements.set(id,{clientHeight:700,textContent:'',dataset:{},listeners:{},classList:{toggle(){},add(){},remove(){}},setAttribute(key,value){this[key]=value;},replaceChildren(){},addEventListener(event,fn){this.listeners[event]=fn;}});
    return elements.get(id);
  };
  const entries=[{id:'a',reviewed:1,questionCount:1}];
  const result={entries,rounds:[]};
  const location={search,href:`https://example.test/narrowcast.html${search}`};
  const context={URL,URLSearchParams,Date,innerHeight:900,location,
    history:{replaceState(a,b,url){location.href=String(url);}},
    document:{getElementById:element,querySelector:element,body:element('body'),addEventListener(){}},
    addEventListener(){},Option:function(label,value){this.label=label;this.value=value;},
    setInterval(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearInterval(id){timers.delete(id);},
    fetch:async()=>{requests++;return {ok:true,json:async()=>({rounds:[],current_round:''})};},
    summarize:()=>result,summarizeRound:()=>result,standingsTable:()=>'<table>',podium:()=>'<podium>',watchForUpdates(){},makeDemoState:s=>s};
  vm.runInNewContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {element,timers,location,requests:()=>requests};
}
test('Vast scherm blijft geselecteerd tijdens live verversen; automatisch wisselen kan aan en uit',async()=>{
  const app=await screen('?scherm=table-0&demo=1');
  assert.equal(app.element('screen-picker').value,'table-0');
  assert.equal(app.element('automatic')['aria-pressed'],'false');
  assert.equal(app.timers.size,1,'alleen de live scoretimer draait');
  await [...app.timers.values()][0].fn();
  assert.equal(app.requests(),2);
  assert.equal(app.element('screen-picker').value,'table-0');
  app.element('automatic').listeners.click();
  assert.equal(app.timers.size,2);
  assert.equal(app.element('automatic')['aria-pressed'],'true');
  [...app.timers.values()][1].fn();
  assert.equal(app.element('screen-picker').value,'podium');
  assert.ok(app.location.href.includes('demo=1'));
  app.element('screen-picker').listeners.change({target:{value:'table-0'}});
  assert.equal(app.element('automatic')['aria-pressed'],'false');
  assert.equal(app.timers.size,1);
  assert.ok(app.location.href.includes('scherm=table-0'));
});
test('Een expliciet gekozen automatische stand blijft na herladen behouden',async()=>{
  const app=await screen('?scherm=table-0&automatisch=1');
  assert.equal(app.element('screen-picker').value,'table-0');
  assert.equal(app.element('automatic')['aria-pressed'],'true');
  assert.equal(app.timers.size,2);
});
