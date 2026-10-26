import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,summarizeRound,formatPoints} from '../scoring.mjs';
const base=()=>({rounds:[{id:'1',sort_order:0,closed:true},{id:'2',sort_order:1,closed:false},{id:'bonus',sort_order:9,closed:false}],questions:[{round_id:'1',id:'1'},{round_id:'2',id:'1'},{round_id:'bonus',id:'1'}],teams:[{id:'a',name:'Alpen',active:true},{id:'b',name:'Ballen',active:true},{id:'c',name:'Uitgesloten',active:false}],answers:[{team_id:'a',round_id:'1',question_id:'1',points_cents:50},{team_id:'b',round_id:'1',question_id:'1',points_cents:50},{team_id:'a',round_id:'2',question_id:'1',points_cents:100},{team_id:'a',round_id:'bonus',question_id:'1',points_cents:200}]});
test('Stand na ronde 1 telt latere rondes en bonus niet mee; gelijke punten delen een positie',()=>{const result=summarize(base(),'1');assert.deepEqual(result.entries.map(e=>[e.name,e.total,e.rank]),[['Alpen',50,1],['Ballen',50,1]]);assert.equal(result.provisional,false);});
test('Een gedeeltelijk nagekeken ronde blijft voorlopig en nul punten is wel beoordeeld',()=>{const data=base();data.answers.push({team_id:'b',round_id:'2',question_id:'1',points_cents:0});const result=summarize(data,'2');assert.equal(result.entries[1].reviewed,2);assert.equal(result.entries[0].total,150);assert.equal(result.provisional,true);});
test('Bonus telt alleen mee als deze is geselecteerd en tellen gebeurt in gehele honderdsten',()=>{const data=base();const result=summarize(data,'2',true);assert.equal(result.entries[0].total,350);assert.equal(formatPoints(25),'0,25');assert.equal(result.rounds.length,3);});
test('Een ontbrekende beoordeling blijft zichtbaar, ook bij een afgesloten ronde',()=>{const data=base();data.answers=data.answers.filter(a=>a.team_id!=='b');assert.equal(summarize(data,'1').provisional,true);});

test('Rondepodium telt alleen deze ronde en toont geen ongeprijsde plek voor niet nagekeken teams',async()=>{
  const {podium}=await import('../scoreboard.mjs');
  const data=base();
  const result=summarizeRound(data,'2');
  assert.equal(result.entries.find(e=>e.id==='a').total,100);
  assert.equal(result.entries.find(e=>e.id==='b').reviewed,0);
  const html=podium(result);
  assert.match(html,/Alpen/);
  assert.doesNotMatch(html,/Ballen/);
  assert.equal(summarizeRound(data,'bonus').entries.find(e=>e.id==='a').total,200);
});
test('Podium behoudt gedeelde plaatsen en toont alle teams op een gedeelde derde plaats',async()=>{
  const {podium}=await import('../scoreboard.mjs');
  const result={provisional:true,entries:[{name:'A',total:300,reviewed:1},{name:'B',total:200,reviewed:1},{name:'C',total:100,reviewed:1},{name:'D',total:100,reviewed:1},{name:'E',total:0,reviewed:1}]};
  const html=podium(result);
  assert.equal((html.match(/podium-place /g)||[]).length,4);
  assert.equal((html.match(/Plaats 3/g)||[]).length,2);
  assert.match(html,/Voorlopig/);
});
