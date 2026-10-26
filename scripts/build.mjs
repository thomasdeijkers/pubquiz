import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,copyFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const quiz = JSON.parse(await readFile('data/quiz.json','utf8'));
assert.equal(quiz.rounds.length,9,'De quiz heeft negen rondes');
assert.deepEqual(quiz.rounds.map(r=>r.id),[1,2,3,4,5,6,7,8,9]);
const files = new Set([quiz.bonus.image,'assets/clublogo-render.png','assets/apres-ski-flyer.png','assets/alpen-achtergrond.svg','assets/hout-sneeuw.svg']);
for (const round of quiz.rounds) {
  assert(round.title && round.cards.length && round.answerCount > 0);
  for (const card of round.cards) {
    assert(card.src.startsWith('assets/') && !card.src.includes('..'));
    assert(!/antwoord|controle|dj-/i.test(card.src),'Geen antwoorden in publieke kaarten');
    files.add(card.src);
  }
  for (const card of round.printables || []) {
    assert(/^assets\/bingo-kaart-[123]\.png$/.test(card.src));
    files.add(card.src);
  }
}
for (const file of files) assert((await stat(file)).size > 0,`Ontbrekend bestand: ${file}`);
const output = path.join(root,'_site');
assert.equal(path.dirname(output),root);
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for (const file of ['index.html','style.css','apres-ski.css','app.js','favicon.svg','robots.txt','organisator.html','organisator.css','organisator.js','scoring.mjs','scoreboard.mjs','navigation.mjs']) await copyFile(file,path.join(output,file));
// Version module dependencies too, so shared podium changes reach existing browsers.
for (const file of ['navigation.mjs','scoreboard.mjs','app.js','organisator.js']) {
  let source=await readFile(path.join(output,file),'utf8');
  for (const dependency of ['scoring.mjs','scoreboard.mjs','navigation.mjs']) {
    const hash=createHash('sha256').update(await readFile(path.join(output,dependency))).digest('hex').slice(0,12);
    source=source.replaceAll(`'./${dependency}'`,`'./${dependency}?v=${hash}'`);
  }
  await writeFile(path.join(output,file),source);
}
// Give changed browser assets a fresh URL after every publication.
for (const page of ['index.html','organisator.html']) {
  let html=await readFile(path.join(output,page),'utf8');
  for (const asset of ['app.js','style.css','organisator.js','organisator.css','apres-ski.css']) {
    const digest=createHash('sha256').update(await readFile(path.join(output,asset))).digest('hex').slice(0,12);
    html=html.replaceAll(`"${asset}"`,`"${asset}?v=${digest}"`);
  }
  await writeFile(path.join(output,page),html);
}
await mkdir(path.join(output,'data'));
await copyFile('data/quiz.json',path.join(output,'data/quiz.json'));
for (const file of files) {
  await mkdir(path.dirname(path.join(output,file)),{recursive:true});
  await copyFile(file,path.join(output,file));
}
await writeFile(path.join(output,'.nojekyll'),'');
console.log(`Website gecontroleerd: 9 rondes, ${files.size} vraagkaarten. Alleen publieke bestanden in _site.`);
