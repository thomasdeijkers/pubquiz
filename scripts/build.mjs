import {readFile,writeFile,mkdir,copyFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const quiz = JSON.parse(await readFile('data/quiz.json','utf8'));
assert.equal(quiz.rounds.length,9,'De quiz heeft negen rondes');
assert.deepEqual(quiz.rounds.map(r=>r.id),[1,2,3,4,5,6,7,8,9]);
const files = new Set([quiz.bonus.image]);
for (const round of quiz.rounds) {
  assert(round.title && round.cards.length && round.answerCount > 0);
  for (const card of round.cards) {
    assert(card.src.startsWith('assets/') && !card.src.includes('..'));
    assert(!/antwoord|controle|dj-/i.test(card.src),'Geen antwoorden in publieke kaarten');
    files.add(card.src);
  }
}
for (const file of files) assert((await stat(file)).size > 0,`Ontbrekend bestand: ${file}`);
const output = path.join(root,'_site');
assert.equal(path.dirname(output),root);
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for (const file of ['index.html','style.css','app.js','favicon.svg','robots.txt']) await copyFile(file,path.join(output,file));
await mkdir(path.join(output,'data'));
await copyFile('data/quiz.json',path.join(output,'data/quiz.json'));
for (const file of files) {
  await mkdir(path.dirname(path.join(output,file)),{recursive:true});
  await copyFile(file,path.join(output,file));
}
await writeFile(path.join(output,'.nojekyll'),'');
console.log(`Website gecontroleerd: 9 rondes, ${files.size} vraagkaarten. Alleen publieke bestanden in _site.`);
