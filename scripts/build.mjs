import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,copyFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
const quiz = JSON.parse(await readFile('data/quiz.json','utf8'));
assert.equal(quiz.rounds.length,9,'De quiz heeft negen rondes');
assert.deepEqual(quiz.rounds.map(r=>r.id),[1,2,3,4,5,6,7,8,9]);
const files = new Set([quiz.bonus.image,'assets/clublogo-heynkensort-blauw.png','assets/favicon-heynkensort-blauw.png','assets/apple-touch-icon-heynkensort-blauw.png','assets/apres-ski-flyer.png','assets/alpen-achtergrond.svg','assets/apres-ski-sfeer.webp','assets/apres-ski-sfeer-print.jpg','assets/Anton-Regular.ttf','assets/Anton-OFL.txt','assets/clublogo-heynkensort-blauw-print.png','vendor/pdfjs.mjs','vendor/pdf.worker.min.mjs','vendor/pdfjs-LICENSE.txt','vendor/pdf-lib.mjs','vendor/fontkit.mjs','vendor/pdf-lib-LICENSE.md','vendor/fontkit-NOTICE.txt','assets/hout-sneeuw.svg']);
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
for (const file of ['index.html','style.css','apres-ski.css','app.js','favicon.svg','robots.txt','organisator.html','organisator.css','organisator.js','scoring.mjs','scoreboard.mjs','navigation.mjs','updates.mjs','answer-sheets.mjs','answer-sheets.css','table-card-pdf.mjs','answer-sheets-pdf.mjs']) await copyFile(file,path.join(output,file));
// Version module dependencies too, so shared podium changes reach existing browsers.
for (const file of ['updates.mjs','navigation.mjs','scoreboard.mjs','table-card-pdf.mjs','answer-sheets-pdf.mjs','app.js','organisator.js']) {
  let source=await readFile(path.join(output,file),'utf8');
  const quizHash=createHash('sha256').update(await readFile('data/quiz.json')).digest('hex').slice(0,12);
  source=source.replaceAll("'data/quiz.json'",`'data/quiz.json?v=${quizHash}'`);
  for (const dependency of ['scoring.mjs','scoreboard.mjs','navigation.mjs','updates.mjs','answer-sheets.mjs','table-card-pdf.mjs','answer-sheets-pdf.mjs']) {
    const hash=createHash('sha256').update(await readFile(path.join(output,dependency))).digest('hex').slice(0,12);
    source=source.replaceAll(`'./${dependency}'`,`'./${dependency}?v=${hash}'`);
  }
  await writeFile(path.join(output,file),source);
}
const version=createHash('sha256').update(await Promise.all(['index.html','organisator.html','app.js','organisator.js','style.css','organisator.css','apres-ski.css','navigation.mjs','scoring.mjs','scoreboard.mjs','updates.mjs'].map(file=>readFile(path.join(output,file)))).then(parts=>Buffer.concat(parts))).digest('hex').slice(0,12);
await writeFile(path.join(output,'version.json'),JSON.stringify({version}));
// Use the same event and flyer preview for shared organizer links.
const shareMeta=(await readFile('index.html','utf8')).split('\n').filter(line=>/<meta (property="og:|name="twitter:)/.test(line)).join('\n');
// Give changed browser assets a fresh URL after every publication.
for (const page of ['index.html','organisator.html']) {
  let html=await readFile(path.join(output,page),'utf8');
  html=html.replace('</head>',`<meta name="pubquiz-version" content="${version}"><meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"></head>`);
  if(page==='organisator.html')html=html.replace('</head>',shareMeta+'\n</head>');
  for (const asset of ['app.js','style.css','organisator.js','organisator.css','apres-ski.css','answer-sheets.css']) {
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
