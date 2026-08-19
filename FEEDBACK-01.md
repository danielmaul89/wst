# Kundefeedback — Rettelser_01

Checkliste bygget på `Rettelser_01.pdf` (18. aug. 2026). Hvert punkt har kundens egen
formulering med, så du kan se præcis hvad der er sagt uden at slå op i PDF'en.

Numrene følger PDF'en: **FS** = Frontsiden · **SO** = Solutions · **PR** = Products · **AB** = About
Størrelse: **[S]** lille · **[M]** middel · **[L]** ny tilgang / reelt redesign

---

## Hurtige rettelser

- [x] **FS3 · Exploded view — pinout i stedet for tekstbokse** [S]
  > *"Kan vi undlade tekstboksene i sektionen med batteriet i exploded view og i stedet lave en slags pinout? Se vedhæftede billede 01_Pinouts"*
  Bygget som pinout, derefter rullet tilbage til pills/tags efter din besked. **Se `rebuild-test.html` — begge versioner ligger side om side til godkendelse.**

- [x] **FS5 · Flere lokationer på globussen** [S]
  > *"Der skal gerne flere lokationer på planeten. Se vedhæftede billede 02_Locations for en liste over de lande, hvor vi har aktive kunder."*
  Alle 26 lande fra listen er lagt ind. UK/GB slået sammen, US har to punkter (øst/vest).

- [x] **FS4 · Supplier logos i farver** [M] — *7 af 10 opdateret; 3 mangler stadig farvefiler*
  > *"Supplier logos må meget gerne være i farver."*
  **Rettet vurdering:** de 10 logofiler, siden bruger i dag, er alle fladet ud til én
  farve — `#06081a`, altså sitets eget `--ink`. Farven ligger ikke i filerne, så det
  hjælper ikke at fjerne `saturate(.72)`/`opacity:.78` fra CSS'en; filtret er nærmest
  virkningsløst på grafik, der allerede er monokrom. Der skal skaffes nye filer.

  Delvise farveoriginaler findes dog allerede i repoet:
  - `assets/partners/technology-partners-strip.png` — alle 10 i én stribe, 7 af dem i
    farve. Men kun 110 px høj, så hvert logo er ~77–141 px bredt; feltet er 190×58,
    så den rækker ikke til skarpe logoer på skærme med høj pixeltæthed.
  - `eve.png`, `highstar.png`, `rept.png`, `spe.png` — 220×110, på hvid baggrund
    (ikke gennemsigtig).

  | Leverandør | Farve i stribe | Kilde i repoet |
  |---|---|---|
  | REPT Battero | blå | `rept.png` + stribe |
  | Gotion | orange | kun stribe |
  | Haidi | rød | kun stribe |
  | Highstar | rød | `highstar.png` + stribe |
  | Lester Electrical | grøn | kun stribe |
  | Lithium Balance | gulgrøn | kun stribe |
  | SPE | rød + blå | `spe.png` + stribe |
  | Super Power, DMEGC, EVE | — | monokrom også i striben |

  **Handling:** bed de 7 leverandører om logo i farve, helst SVG. For Super Power,
  DMEGC og EVE skal det afklares, om deres logo overhovedet *er* i farve.

- [x] **AB1 · Overskrift øverst på About** [S]
  > *"Jeg mangler en overskrift a la 'About us' til at stå øverst på siden."*

- [x] **FS1 · Fjern nederste sektion på forsiden** [S] — *skjult med `hidden` (genvindbar til Development)*
  > *"Er for stor. Jeg gad godt udlade den nederste sektion, 'From technical brief to controlled series production'. Sektionen går også igen på Solutions-siden. Men hører reelt hjemme under Development?"*

- [x] **SO2 · Fjern "The battery follows the application…"** [S] — *skjult med `hidden` (bevaret til mulig brug på Development)*
  > *"Jeg forstår ikke helt sektionen med 'The battery follows the application, never the other way around'. Jeg tolker sektionen som en udviklingsproces, og udviklingsproces hører vel til under Development: Derudover er punkterne ikke korrekte ift. de punkter, som allerede er defineret som vores Development Proces. Se gerne under Development-siden inde i Figma."*

- [x] **PR2 · Fjern "Designed to perform. Proven to scale"** [S] — *skjult med `hidden`*
  > *"På samme måde som med frontsiden, synes jeg, at produktsiden er for stor. Og der sker lidt meget, som ikke har at gøre med sidens formål. Sektionen med 'Designed to perform. Proven to scale' er i min optik mere relevant for development end for Solutions. Og egentlig synes jeg, at sektionen er lidt irrelevant for hele sitet."*

> **Fælles for FS1 / SO2 / PR2:** det er samme observation tre gange — siderne er for lange,
> og procesindhold ligger på de forkerte sider. Kunden mener procesindholdet hører hjemme
> under **Development**. FS1-sektionen går igen på Solutions, så den fjernes ét sted og
> genbruges (evt. omskrevet) på Development.

---

## Venter på input

- [ ] **AB2 · Udskift Louis' tekst** [S] — *mangler: teksten i Figma under **Tekst***
  > *"Louis' tekst er forkert. Jeg har indsat en tekst inde i Figma under Tekst. Det er den, der skal bruges. Teksten er vigtig, fordi den fremhæver de blødere kerneværdier. Strong partnerships, shared knowledge, collaboration, making electrification accessible osv. Jeg er med på, at teksten er lang. Det var derfor, jeg forslog at bryde den op i sektioner, som kan fordele sig ned gennem siden fx med billeder fra kontoret."*

- [ ] **SO2b · Ret punkterne til den rigtige udviklingsproces** [M] — *mangler: punkterne i Figma under **Development***

- [ ] **SO1a · Oplæg til ny Solutions-opbygning** [L] — *mangler: vedhæftning **03_Solutions***

- [ ] **FS2b · Bredformats-billeder til slideren** [M] — *mangler: de ai-genererede applikationsbilleder i bredformat*

---

## Ny tilgang — dem der ændrer konceptet

### FS2 + SO1 · Væk fra de 6 faste kategorier [L]

Det største punkt, og det rammer to sider på én gang.

- [ ] Erstat højformats-griddet med et **bredformats loop/slider**
- [ ] Omskriv overskriften, så de 6 ikke længere læses som en udtømmende liste
- [ ] Behold applikationsnavnet på hvert billede (drones, robotics, material handling osv.)
- [ ] Klik på et billede fører ind på Solutions
- [ ] Fjern den øverste kategorisektion på Solutions
- [ ] **Beslut (a) eller (b) for Solutions** ⬅️ *blokerer resten*

> *"Højformats-gridded er problematisk af flere årsager."*
>
> *"Applikationerne fungerer bedre i bredformat, og et grid bliver meget statisk. Kan vi få noget dynamik ind på siden ved at erstatte højformats-gridded med en bredformats 'slider', hvor billederne kører i et loop el.lign.?"*
>
> *"Det ville også løse den næste udfordring: De 6 applikationskategorier bliver kommunikeret for bogstaveligt. Som det står nu, signalerer vi, at WST kun kan lave batterier til maskiner, som falder ind under én af de 6 kategorier, hvilket er en ærgerlig begrænsning at lægge på os selv. Kategorierne skal i stedet forstås som eksempler på overordnede applikationstyper, som vi arbejder med. Det er selvfølgelig ikke din fejl — Louis og jeg har ikke været opmærksomme på, hvordan det kan tolkes, når vi kategoriserer på denne her måde."*
>
> *"En løsning kan være ovennævnte bredformats-loop. Så vil applikationstyperne ikke stå som 6 fastlåste kategorier. Vi kan stadig holde fast i, at der på hvert billede står drones, robotics, material handling osv. Og et klik på et billede kan føre ind på Solutions-siden."*

**Solutions — to retninger, kunden har ikke valgt endnu:**

- [ ] **(a)** Applikationer parret med batterier, i retning af kundens eget oprindelige udgangspunkt
  > *"Jeg foreslår, at vi fjerner den øverste sektion med kategorier, og så kan vi enten bygge siden op i retning af det udgangspunkt, jeg lavede i sin tid, hvor vi parrer applikationer med batterier. Se vedhæftede billede 03_Solutions."*
- [ ] **(b)** Ren applikationsside med alle ai-genererede applikationer ned langs siden, uden grid
  > *"…eller vi kan have en ren applikations-side, hvor vi showcaser alle de ai-genererede applikationer ned langs siden. Her vil jeg så gerne undgå et grid, men i stedet udnytte langt mere af skærmen, så billederne bliver blæst op."*

### PR1 · Products skal handle om batterier, ikke applikationer [L]

- [ ] Flyt fokus fra applikationer til selve batterierne
- [ ] Brug de 3d-renderede billeder her
- [ ] Byg exploded views / animationer ud som sidens omdrejningspunkt

> *"Denne side bør i højere grad fokusere på selve batterierne og ikke applikationer. Det er her, vi skal bruge de 3d-renderede billeder, og det er her, vi kan lave en masse lir med exploded views, animeringer osv."*

### AB3 · "Engineering is a team discipline" [M]

- [ ] Gør tydeligt at sektionen beskriver **vores ingeniørkundskaber**, ikke development
- [ ] Kobl den sammen med **career**-siden som overgang
- [ ] Gør career-delen mere synlig i den forbindelse

> *"Sektionen med 'Engineering is a team disciplne' forvirrer mig. Den medfølgende tekst skubber det i retning af noget, der har med development at gøre og beskriver ikke noget om WST som virksomhed. Vi kan fint bruge sektionen som en måde at beskrive vores ingeniørkundskaber, men så skal det gøres tydeligere. Sektionen kan også fungere som en segway til vores career-side, men så skal de to kobles mere sammen. Det ville også gøre career delen mere synlig, som lige nu er ret anonym."*

---

## Rækkefølge

1. **Hurtige rettelser** — ingen afhængigheder, kan lukkes på én omgang
2. **Godkend `rebuild-test.html`** — slider, exploded view, logo-farver
3. **Beslut (a) eller (b) for Solutions** + få bredformats-billederne → låser FS2/SO1 op
4. **FS2/SO1** bygges som delt sektion i `wst-components.css`, så forside og Solutions deler den
5. **Venter-på-input** efterhånden som teksterne kommer fra Figma
6. **PR1** og **AB3** til sidst
