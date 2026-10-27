import test from 'node:test';
import assert from 'node:assert/strict';
import {findQuestions,questionLink} from '../navigation.mjs';
const state={rounds:[{id:'1',title:'Clubkennis'},{id:'2',title:'Drankjes'},{id:'bonus',title:'Bonusronde'}],questions:[{round_id:'1',id:'1',prompt:'Wanneer is de club opgericht?'},{round_id:'2',id:'3',prompt:'Uit welk land komt de café cocktail?'},{round_id:'bonus',id:'4',prompt:'Herken de foto'}]};
test('Zoek vragen op losse woorden, ronde en accenten, zonder antwoorden te doorzoeken',()=>{
  assert.deepEqual(findQuestions(state,'CAFE land'),[state.questions[1]]);
  assert.deepEqual(findQuestions(state,'clubkennis'),[state.questions[0]]);
  assert.deepEqual(findQuestions(state,'bonus vraag 4'),[state.questions[2]]);
  assert.deepEqual(findQuestions(state,'   '),[]);
  assert.deepEqual(findQuestions(state,'onvindbaar'),[]);
});
test('Vraaglinks selecteren de juiste ronde en vraag en behouden de demoversie',()=>{
  const url=new URL(questionLink(state.questions[1]),'https://example.test/');
  assert.equal(url.searchParams.get('tab'),'nakijken');
  assert.equal(url.searchParams.get('ronde'),'2');
  assert.equal(url.searchParams.get('vraag'),'3');
  assert.equal(new URL(questionLink(state.questions[2],true),'https://example.test/').searchParams.get('demo'),'1');
});
