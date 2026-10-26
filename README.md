# Après-ski Pubquiz

Website voor T.V. Heynkensort op https://pubquiz.opticore-insights.nl.

## Wijzigingen publiceren

Elke push naar `main` start `.github/workflows/publish.yml`. De workflow controleert de inhoud, maakt `_site` en publiceert die via GitHub Pages. Bekijk de voortgang bij **Actions → Publiceer pubquiz**.

- `data/quiz.json`: volgorde, titels, omschrijvingen, aantallen en vraagkaarten per ronde.
- `assets/`: geselecteerde originele vraagkaarten. De bestandsnamen volgen de echte ronde.
- `index.html`, `style.css`, `app.js`: pagina, vormgeving en presentatie/printfunctionaliteit.
- `scripts/build.mjs`: validatie en expliciete selectie van gepubliceerde bestanden.

Geen installatie of framework nodig. Controleer met `node scripts/build.mjs`. Start lokaal bijvoorbeeld `python -m http.server 4173` en open http://localhost:4173. Node 22 of hoger wordt gebruikt door GitHub Actions.

## DNS en HTTPS

GitHub Pages custom domain: `pubquiz.opticore-insights.nl`.
TransIP: record `pubquiz`, type `CNAME`, doel `thomasdeijkers.github.io.`. Dit geldt alleen voor het subdomein; de bestaande records blijven intact. **Enforce HTTPS** staat aan; HTTP verwijst automatisch naar HTTPS.

## Inhoudelijke aandachtspunten

- Ronde 1 heeft tien vragen. De oorspronkelijke kaart `R1 vraag 11-16.png` hoort inhoudelijk bij ronde 2 en is niet als ronde 1 opgenomen.
- De kaarten uit de oorspronkelijke map van ronde 6 heetten R5; hier zijn ze opgenomen onder ronde 6.
- Muziekronde: voorlopige indeling van tien fragmenten; nummers, media en antwoorden ontbreken. De site toont de instructiekaart.
- Muziekbingo: alleen de instructiekaart is publiek. DJ-kaarten en geplande winmomenten zijn niet gepubliceerd.
- Jodelen staat op de originele activiteitenkaart als suggestie en is nog geen vast scoreonderdeel.
- De getoonde vragen en antwoordopties zijn overgenomen; de feitelijke juistheid van alle vragen is nog niet gecontroleerd.
- Het aantal tennisballen en lokale clubgegevens moeten door de organisatie bevestigd worden.

## Gedeeld quizbeheer

`organisator.html` biedt teambeheer, antwoorden en punten per vraag, een tussenstand na iedere ronde, een projectiescherm en exports naar JSON/CSV. Het beheer opent direct zonder account, naamopgave of toegangssleutel. Iedereen met de gewone beheerlink kan teams, antwoorden, antwoordmodellen en punten bekijken en aanpassen. Een naam invullen is optioneel via Naam wijzigen, om wijzigingen herkenbaar te maken.

De API draait als afzonderlijke gebruiker `pubquiz` op de bestaande VPS, via `https://vps.opticore-insights.nl/pubquiz-api/v1`. De gegevens staan in een aparte PostgreSQL-database `pubquiz`. Databaseverbindingen gebruiken een lokale Unix-socket en peer-authenticatie. Er staat geen databasewachtwoord in GitHub. De juiste antwoorden zijn rechtstreeks uit het lokale controleblad geïmporteerd; bronbestanden en antwoordmodellen blijven buiten deze openbare repository en de Pages-deployment.

Elke beoordeling heeft een wijzigingsversie. Bij gelijktijdige wijzigingen krijgt de organisator een conflictmelding in plaats van stilzwijgend andermans werk te vervangen. Aanpassingen aan een teamantwoord wissen de oude beoordeling, tenzij je opnieuw punten meegeeft. Een ronde kan pas worden afgesloten als alle actieve teams volledig zijn beoordeeld. Afgesloten rondes zijn voor iedereen vergrendeld totdat ze worden heropend.

Het model en de maximale punten kunnen in het beheer worden aangepast. De standaard is één punt per gewone vraag, twee punten per muziekfragment, maximaal tien punten voor de kaartentoren en zes voor beerpong. Bingopunten staan op nul totdat de organisatie deze heeft vastgesteld. Gelijke antwoorden kunnen automatisch worden herkend; afwijkende antwoorden blijven ter beoordeling staan. Eerdere beoordelingen worden bij een modelwijziging niet automatisch herberekend.

## Backend publiceren en testen

`.github/workflows/backend.yml` test de API tegen een geïsoleerde PostgreSQL-testdatabase en publiceert daarna alleen `backend/app.py`. GitHub gebruikt een afzonderlijke SSH-sleutel die alleen het vaste deployscript mag starten; er is daarmee geen vrije shelltoegang. De host key is vastgelegd in een GitHub-secret. De database wordt niet door deployments vervangen. Iedere backend-deployment maakt eerst een PostgreSQL-reservekopie in `/var/backups/pubquiz` en zet de vorige codeversie terug als de gezondheidscontrole faalt.

- Frontend en puntentelling: `node --test tests/scoring.test.mjs` en `node scripts/build.mjs`.
- API: stel `PUBQUIZ_DSN` in op een afzonderlijke database genaamd `pubquiz_test` en voer `python -m unittest discover -s tests -p test_backend.py -v` uit. Gebruik nooit de productiedatabase voor tests.
- Eerste serverinrichting: `deploy/bootstrap.sh`; deze gebruikt het lokale, niet-gepubliceerde seedbestand en importeert de quizgegevens.
- Een reservekopie van teams, antwoorden, model en scores kan ook vanuit het beheer worden gedownload. CSV bevat de geselecteerde tussenstand.

`private/` en `qa/` zijn uitgesloten van Git. Daar staan lokaal de beheerlink, de beperkte deploysleutel, de antwoordimport en interne controlebestanden. Maak deze bestanden niet openbaar.

`noindex` en `robots.txt` vragen zoekmachines om de tijdelijke quiz niet te indexeren; het beheer is op verzoek rechtstreeks toegankelijk zonder toegangssleutel.

## Muziekbingo

De playlist is gekoppeld aan ronde 5: https://open.spotify.com/playlist/09oEyjF5tRPIymghW0tD8x. De drie originele kaarten zijn beschikbaar als printblad. De originele DJ-kaarten en de broninstructie worden via de open beheer-API aangeboden; deze afbeeldingen staan niet in GitHub Pages of de repository.

De Spotify-volgorde met zestig nummers is op 26 oktober 2026 uit de playlist overgenomen en met de 36 vakjes per kaart vergeleken. De nieuwe DJ-kaart wijkt vanaf nummer 21 af van Spotify. De geplande winmomenten uit de bron zijn daarom geen geldige voorspelling voor deze playlistvolgorde. In het beheer staat een tabel met de berekende momenten; K1 en K3 hebben bij deze volgorde allebei een volle kaart na nummer 57. De berekening is een momentopname en moet na veranderingen aan de playlist of kaarten opnieuw worden uitgevoerd. De site speelt of knipt geen Spotify-audio automatisch.

## Instellingen voor puntentelling

Bij **Instellingen → Puntentelling** kan iedere organisator een maximum per vraag instellen, of met één handeling hetzelfde maximum invullen voor alle onderdelen van een ronde. Iedere ronde wordt afzonderlijk opgeslagen. Je kunt twee decimalen gebruiken.

Bij bestaande beoordelingen kies je tussen **Bestaande punten behouden** en **Punten naar verhouding herberekenen**. Herberekenen vereist een bevestiging, geldt voor alle reeds beoordeelde antwoorden op gewijzigde vragen (ook bij uitgesloten teams), en rondt af op twee decimalen. Openstaande antwoorden blijven open. Bij behoud mag geen bestaande beoordeling boven het nieuwe maximum komen. Beoordelingen van een vraag die eerder op nul punten stond kunnen niet evenredig worden herberekend; behoud die punten of wis de beoordelingen en kijk opnieuw na. Afgesloten rondes moeten eerst worden heropend. Het volledige verzoek voor een ronde wordt als één transactie verwerkt, met versiecontrole voor iedere vraag.

## Live scorebord en nakijken

Modelantwoorden zijn direct zichtbaar bij iedere vraag in Antwoorden & punten. Iedere rondekaart op de hoofdpagina toont de drie best gerangschikte teams voor alleen die ronde. Bij een gedeelde derde plaats staan alle betrokken teams op het podium. Nog niet nagekeken teams verschijnen pas op het podium zodra er een beoordeling is opgeslagen; ook nul punten is een beoordeling.

Het openbare scorebord toont alle actieve teams met rondepunten en totaal, een keuze voor de laatste meegetelde ronde en een optionele bonus. Het wordt elke vijf seconden vernieuwd via `/standings`, dat uitsluitend rondes, teams en scores teruggeeft. Modelantwoorden, ingeleverde antwoorden en auditgegevens worden voor dit scorebord niet opgehaald. De top 3 in het beheer en op het projectiescherm gebruikt dezelfde telling. Openstaande beoordelingen en gelijke standen blijven herkenbaar.

Op iedere rondekaart staat **Open controle**. Deze link opent rechtstreeks `organisator.html?tab=nakijken&ronde=…`, met de juiste ronde geselecteerd. Kies daar een team en vul de antwoorden direct onder de vragen in. Ook de homepage, bonusronde en presentatie verwijzen rechtstreeks naar de controle.

Bij Antwoorden & punten staan nu alle actieve teams onder iedere vraag, elk met een eigen antwoordveld en Goed/Fout-knoppen rechts. Goed/Fout slaat zowel het antwoord als de beoordeling voor die teamregel op. Andere punten en het wissen van een beoordeling blijven beschikbaar onder Andere punten. Concepten van andere teams blijven bij opslaan bewaard.

## Après-ski huisstijl

`apres-ski.css` verzorgt één gedeelde schermstijl voor homepage, rondes, scorebord, beheer, projectie en printvoorbeelden. De oorspronkelijke flyer is als openbaar beeld opgenomen. Houten borden met sneeuwranden, een Alpenachtergrond, blauwe kaders en rode vraagnummers sluiten aan op de vraagkaarten. Het verenigingslogo is als transparante 3D-badge uitgewerkt in de oorspronkelijke groen/zalmtinten. De printuitvoer blijft sober en goed leesbaar.
