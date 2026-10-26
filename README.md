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
TransIP: record `pubquiz`, type `CNAME`, doel `thomasdeijkers.github.io.`. Dit geldt alleen voor het subdomein; de bestaande records blijven intact. Zet **Enforce HTTPS** aan zodra GitHub het certificaat heeft uitgegeven.

## Inhoudelijke aandachtspunten

- Ronde 1 heeft tien vragen. De oorspronkelijke kaart `R1 vraag 11-16.png` hoort inhoudelijk bij ronde 2 en is niet als ronde 1 opgenomen.
- De kaarten uit de oorspronkelijke map van ronde 6 heetten R5; hier zijn ze opgenomen onder ronde 6.
- Muziekronde: voorlopige indeling van tien fragmenten; nummers, media en antwoorden ontbreken. De site toont de instructiekaart.
- Muziekbingo: alleen de instructiekaart is publiek. DJ-kaarten en geplande winmomenten zijn niet gepubliceerd.
- Jodelen staat op de originele activiteitenkaart als suggestie en is nog geen vast scoreonderdeel.
- De getoonde vragen en antwoordopties zijn overgenomen; de feitelijke juistheid van alle vragen is nog niet gecontroleerd.
- Het aantal tennisballen en lokale clubgegevens moeten door de organisatie bevestigd worden.

## Antwoorden en controleblad

Het controleblad en de Word-bronbestanden staan bewust buiten deze repository en buiten de deployment. Publiceer hier geen antwoorden, DJ-kaarten of geheime gegevens. GitHub Pages is statische openbare hosting: een verborgen URL of wachtwoord in JavaScript biedt geen echte afscherming. Voor een later online controleblad is aparte toegangsbeveiliging nodig, of gebruik een lokaal printbaar bestand.

Er worden geen deelnemersantwoorden opgeslagen. De invulbladen zijn bedoeld om te printen. `noindex` en `robots.txt` vragen zoekmachines om de tijdelijke quiz niet te indexeren; dit is geen toegangsbeveiliging.
