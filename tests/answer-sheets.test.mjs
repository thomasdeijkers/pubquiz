import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {answerSheetPack,tableCardSheet} from '../answer-sheets.mjs';
const quiz=JSON.parse(readFileSync(new URL('../data/quiz.json',import.meta.url),'utf8'));

test('Een complete set bevat negen rondes en bonus in de bronvolgorde met de juiste aantallen',()=>{
  const html=answerSheetPack(quiz,'Berggeiten',2);
  const pages=html.split('<section ').slice(1);
  assert.equal(pages.length,12);
  assert.match(pages[11],/data-table-card/);
  assert.equal((html.match(/data-sheet-team>Berggeiten/g)||[]).length,11);
  for(const [index,round] of [...quiz.rounds,{id:'bonus-vragen',answerCount:0},{id:'bonus',answerCount:30}].entries()){
    assert.match(pages[index],new RegExp('data-sheet-round="'+round.id+'"'));
    if(round.id==='bonus-vragen'){assert.match(pages[index],/assets\/bonus.png/);continue;}
    if(round.id===5){assert.match(pages[index],/assets\/bingo-kaart-2.png/);continue;}
    assert.equal((pages[index].match(/class="sheet-answer-row"/g)||[]).length,round.id===7?2:round.answerCount);
  }
  assert.equal((pages[2].match(/Titel:/g)||[]).length,10);
  assert.equal((pages[2].match(/Artiest:/g)||[]).length,10);
  assert.match(pages[7],/--sheet-rows:11/);
});

test('Teamnamen zijn veilig weergegeven en een ongeldige bingokaart valt terug op K1',()=>{
  const html=answerSheetPack(quiz,'<script> & "Alpen"',99);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt; &amp; &quot;Alpen&quot;/);
  assert.match(html,/bingo-kaart-1.png/);
  assert.doesNotMatch(html,/bingo-kaart-99/);
});

test('De tafelkaart toont de teamnaam op twee vouwvlakken en ontsnapt HTML',()=>{
  const html=tableCardSheet('Alpen & <Ski>');
  assert.equal((html.match(/class="tent-face"/g)||[]).length,2);
  assert.equal((html.match(/Alpen &amp; &lt;Ski&gt;/g)||[]).length,2);
  assert.match(html,/tent-fold-line/);assert.doesNotMatch(html,/vouw hier/i);
  assert.match(tableCardSheet('A'.repeat(80)),/tent-name-long/);
});

test('Gewone antwoordbladen adviseren de vraag over te schrijven zonder de quizvragen af te drukken',()=>{
  const pages=answerSheetPack(quiz,'Berggeiten').split('<section ').slice(1);
  for(const index of [0,1,3,5,7,8]){
    assert.match(pages[index],/Schrijf de vraag kort over bij het vraagnummer/);
    assert.match(pages[index],/je antwoord later nog kunt aanpassen/);
    assert.match(pages[index],/bewust niet bij: een beetje quizchaos hoort erbij/);
  }
  assert.match(pages[10],/juiste afbeeldingsnummer/);
  assert.doesNotMatch(pages[4],/Schrijf de vraag/);
});
