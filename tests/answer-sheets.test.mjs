import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {answerSheetPack} from '../answer-sheets.mjs';
const quiz=JSON.parse(readFileSync(new URL('../data/quiz.json',import.meta.url),'utf8'));

test('Een complete set bevat negen rondes en bonus in de bronvolgorde met de juiste aantallen',()=>{
  const html=answerSheetPack(quiz,'Berggeiten',2);
  const pages=html.split('<section ').slice(1);
  assert.equal(pages.length,10);
  assert.equal((html.match(/data-sheet-team>Berggeiten/g)||[]).length,10);
  for(const [index,round] of [...quiz.rounds,{id:'bonus',answerCount:30}].entries()){
    assert.match(pages[index],new RegExp('data-sheet-round="'+round.id+'"'));
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
