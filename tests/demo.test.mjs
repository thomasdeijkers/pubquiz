import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeDemoState} from '../demo.mjs';
const fixture=()=>({revision:7,rounds:[{id:'1',closed:false},{id:'5',closed:false}],teams:[{id:'a',name:'Alpen',active:true},{id:'b',name:'Bergen',active:true},{id:'c',name:'Uitgesloten',active:false}],questions:[{round_id:'1',id:'1',correct:'Model',max_cents:100},{round_id:'1',id:'2',correct:'Ander',max_cents:200},{round_id:'5',id:'1',correct:'Bingo',max_cents:0}],answers:[{team_id:'a',round_id:'1',question_id:'1',answer:'Bestaande invoer',points_cents:0}]});
test('Demo vult iedere vraag voor ieder actief team, met geldige punten en zonder brongegevens te wijzigen',()=>{
  const original=fixture(),before=JSON.stringify(original),demo=makeDemoState(original);
  assert.equal(JSON.stringify(original),before);assert.equal(demo.answers.length,6);
  assert.ok(demo.rounds.every(r=>r.closed));
  for(const answer of demo.answers){const q=demo.questions.find(q=>q.id===answer.question_id && q.round_id===answer.round_id);assert.ok([0,q.max_cents].includes(answer.points_cents));assert.ok(answer.answer);assert.notEqual(answer.team_id,'c');}
  assert.deepEqual(makeDemoState(original),demo);
});
test('Demoweergave kan geen schrijfverzoek of reset naar de database versturen',async()=>{
  const source=readFileSync(new URL('../organisator.js',import.meta.url),'utf8');
  const api=source.slice(source.indexOf('async function api('),source.indexOf('function activeTeams'));
  let fetches=0;
  const context={demoMode:true,state:{revision:'demo-7'},fetch:()=>{fetches++;throw new Error('Geen netwerk toegestaan');}};
  vm.runInNewContext(api+'\nthis.callApi=api;',context);
  for(const path of ['/answers/save','/answers/reset','/teams/delete','/settings/scoring'])await assert.rejects(context.callApi(path,{password:'pubquiz'}),/demoversie/);
  const revision=await context.callApi('/revision');assert.equal(revision.revision,'demo-7');assert.equal(fetches,0);
});
