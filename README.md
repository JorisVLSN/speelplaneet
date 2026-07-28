# Speelplaneet

Een kindvriendelijk spelletjesplatform met profielen, levels, sterren en vier speelbare spellen.

## Lokaal bekijken

Open `index.html` rechtstreeks in een browser of start een eenvoudige lokale webserver in deze map.

## Publiceren op Vercel

1. Zet de map in een GitHub-repository.
2. Importeer die repository in Vercel.
3. Kies **Other** als framework en laat de build-instellingen leeg.
4. Publiceer de site.

## Supabase en online multiplayer

1. Open de SQL-editor in Supabase en voer `supabase/schema.sql` uit.
2. Voeg in Vercel `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY` toe.
3. Publiceer de site opnieuw.

Zeeslag, Galgje, Vier op een rij en Boter-kaas-en-eieren ondersteunen daarna beveiligde online kamers met joincodes. Zeeslag gebruikt een klassiek 10×10-bord, een vloot van vijf schepen, een plaatsingsfase en beurtelings schieten. Profielen en puzzelvoortgang synchroniseren via beveiligde Vercel-serverfuncties; zonder verbinding blijft de lokale voortgang beschikbaar.

De service-role-key wordt uitsluitend door Vercel-serverfuncties gebruikt en mag nooit als `NEXT_PUBLIC_`-variabele worden ingesteld. Spelerpincodes worden met `scrypt` en een unieke salt gehasht. Sessietokens worden uitsluitend gehasht in Supabase opgeslagen.

Na het aanmelden kan via **Ouderherstel** een zescijferige oudercode worden ingesteld. Daarmee kan op het aanmeldscherm een vergeten spelerspincode worden vervangen. Ook oudercodes worden gehasht en na vijf foutieve pogingen tijdelijk geblokkeerd.

Via **Ouderomgeving** kan een ouder na controle van diezelfde zescijferige code de speeltijd, voortgang, favoriete spellen en succespercentages bekijken. Daar kunnen ook het woordniveau, de rekencategorie en online multiplayer worden ingesteld. Een multiplayerblokkade wordt door de server afgedwongen en kan niet worden omzeild met een rechtstreekse kamerlink.

Een ouder kan een profiel ook tijdelijk pauzeren, een privacyvriendelijk JSON-bestand met alle spelgegevens downloaden of het profiel volledig verwijderen. De export bevat geen pincodes, sessietokens of beveiligingshashes. Voor definitief verwijderen vraagt de interface tweemaal om bevestiging.

Online zeeslag gebruikt een afzonderlijke servergestuurde kamertabel. De server valideert vloten en schoten, houdt de tegenvloot geheim, voorkomt conflicterende zetten met revisienummers en ondersteunt herverbinden en revanche. Kamers verlopen automatisch na 24 uur.

Ook Galgje, Vier op een rij en Boter-kaas-en-eieren worden servermatig gecontroleerd. Bij Galgje blijft het geheime woord op de server; bij de bordspellen controleert de server iedere beurt, zet en winnaar. De kamers ondersteunen herverbinden, revisienummers, veilig opgeven en een revanche die pas start wanneer beide spelers akkoord gaan.

Bij iedere online kamer staat een WhatsApp-deelknop. Uitnodigingslinks gebruiken de vorm `https://speelplaneet.vercel.app/?game=zeeslag&code=ABC-123` en openen na het aanmelden automatisch het juiste spel en de juiste kamer.

## Spellen

- Zeeslag, Galgje, Vier op een rij en Boter-kaas-en-eieren: solo en online met joincode
- Mini Sudoku, Woordzoeker, Memory, Kleurcode, Rekensprint en Sterrenreeks: solo met sterren en levels
- Ruimterunner: kies Ellie, Mila of Mats, spring over robots en buk voor ufo's; speelbaar zonder internet
- Sterrendoolhof: breng de raket met tikknoppen of pijltjestoetsen naar de planeet

Ieder spel heeft 100 unieke, oplopende niveaus. Elk spel/level-paar heeft een vaste missiecode en een deterministische puzzelconfiguratie. Daardoor blijft bijvoorbeeld niveau 37 bij een volgend bezoek dezelfde uitdaging, maar gebruikt geen ander niveau exact dezelfde configuratie. Na het voltooien van een niveau wordt automatisch het volgende niveau vrijgespeeld. De moeilijkheid groeit via langere woorden en reeksen, minder hints, unieke bordindelingen en codes, moeilijkere sommen, grotere doolhoven en sterkere computertegenstanders.

De levelvalidator controleert automatisch alle 1200 niveaus van de twaalf spellen. Hij controleert onder meer oplosbaarheid, unieke configuraties, geldige antwoorden, vlootopstellingen, iedere stap van de doolhofoplossing, computersterkte en een veilige snelheidscurve voor Ruimterunner. Rekensprint groeit van optellen tot 20 via aftrekken en tafels naar gemengde bewerkingen. Voor intern testen opent `?testlevels=1&game=sudoku&level=37` rechtstreeks een gekozen niveau en maakt de volledige levelkiezer beschikbaar.

Per spel worden pogingen, voltooide rondes, succespercentage en totale speeltijd bijgehouden. Levels 10, 25, 50, 75 en 100 zijn herkenbare ruimtemissies — van Maanproef tot Kosmische finale — en leveren bij de eerste voltooiing twee bonussterren op.

Dagelijkse en wekelijkse missies geven bonussterren, maar leveren nooit verlies of straf op wanneer ze niet worden gehaald. Verzamelde sterren ontgrendelen ruimtehelmen, planeten, medailles, ruimtepakken en trofeeën. Favorieten en het laatst gespeelde spel synchroniseren mee, zodat **Verder spelen** ook op een ander apparaat werkt.

Ellie, Mila en Mats hebben daarnaast een gezamenlijke weekmissie. Iedere voltooide ronde op hetzelfde toestel voegt één ster toe aan de gedeelde sterrenmotor. Bij 5, 12 en 20 sterren ontdekt het gezin samen een nieuwe beloning. De bijdragen worden alleen als gezamenlijke hulp getoond: er is geen winnaar, ranglijst of onderlinge vergelijking. Iedere maandag begint een nieuwe ruimtemissie.

Via **Gezinstoernooi** kunnen twee of drie kinderen op hetzelfde toestel 3, 6 of 9 korte rondes spelen. Speelplaneet kiest afwisselend Mini Sudoku, Memory, Kleurcode, Rekensprint, Sterrenreeks en Woordzoeker. Voor iedere ronde staat duidelijk wie aan de beurt is en wanneer het toestel moet worden doorgegeven. Een geslaagde ronde levert een kometenpunt op het tijdelijke toernooibord en één ster voor de gezamenlijke weekmissie op, maar verandert geen persoonlijke levels of sterren. Het toernooi gebruikt geen internet, vrije tekst of communicatie met onbekenden.

Speelplaneet wisselt automatisch tussen vier seizoenswerelden: Bloesemnevel in de lente, Zomerse sterrenbaai in de zomer, Kometenbos in de herfst en IJsplaneet Aurora in de winter. Iedere wereld heeft eigen kleuren, uitleg en drie verzamelbare beloningen. Die worden ontdekt na 3, 6 en 10 verschillende spellen; steeds hetzelfde spel herhalen telt niet extra. Iedere nieuwe beloning geeft één bonusster. Ontdekte seizoensvoorwerpen blijven na de seizoenswissel in het persoonlijke archief bewaard en synchroniseren mee met de overige voortgang.

Adaptieve hulp merkt op wanneer een speler rondes afbreekt of meerdere keren vastloopt. Na twee signalen verschijnt een vrijwillige, spelspecifieke hint; na vier signalen wordt die uitleg automatisch zichtbaar. De ondersteuning verandert het gekozen of vrijgespeelde niveau niet en trekt nooit sterren af. Na een geslaagde ronde verdwijnt de extra hulp weer. De vastloopstatus synchroniseert veilig mee, zodat hulp op een tweede apparaat niet plots verloren gaat.

De Ouderomgeving bevat een positieve terugblik met drie kindgerichte hoogtepunten en één rustige suggestie. Het rapport gebruikt speelvariatie, afgeronde rondes, voortgang, voorkeuren en eventuele hulpbehoefte, maar toont nooit een ranglijst en vergelijkt kinderen niet met elkaar. Ouders kunnen de leesbare samenvatting naar het klembord kopiëren. Bij weinig gegevens blijft de formulering uitnodigend en worden geen negatieve conclusies getrokken.

## Installeren als app

Speelplaneet bevat een webappmanifest en kan vanuit een ondersteunende browser als zelfstandige app worden geïnstalleerd. Wanneer installatie beschikbaar is, verschijnt **Installeer Speelplaneet**. De geïnstalleerde app gebruikt een eigen planeeticoon en opent zonder gewone browserbalken.

Bij een wegvallende verbinding verschijnt een rustige melding dat de voortgang veilig op het toestel blijft staan. Zodra internet terugkomt, probeert Speelplaneet de cloudvoortgang opnieuw op te halen. Een nieuwe offline-versie wordt niet onverwacht midden in een spel geladen: er verschijnt een balk met **Nu vernieuwen** en **Later**.

Via de instellingenknop zijn grotere tekst, hoog contrast, minder beweging en extra kleursymbolen beschikbaar. Spelgeluiden, rustige muziek en gesproken uitleg kunnen afzonderlijk worden in- of uitgeschakeld. Ieder spel toont bij de eerste keer een korte uitleg en kan vanuit het spel volledig scherm worden geopend. Op het startscherm filter je spellen op Taal, Rekenen, Puzzels, Geheugen, Samen of Actie.

Ruimterunner heeft een echte pauzeknop die animatie, snelheid, afstand en obstakels volledig stilzet. Wanneer de browser naar de achtergrond gaat, wordt automatisch gepauzeerd; hervatten veroorzaakt geen sprong in tijd of snelheid.

## Productie en controle

`api/health` controleert zonder geheime informatie prijs te geven of de server en database bereikbaar zijn en vermeldt of de site lokaal, als Vercel Preview of in productie draait. De ouderomgeving toont deze status en het aantal recente technische fouten. Aangemelde clients en multiplayerfuncties registreren geschoonde fouten; foutmeldingen ouder dan 30 dagen worden automatisch verwijderd.

De productiecheck controleert vereiste bestanden, JavaScript-syntax, offline-cacheverwijzingen en budgetten van 500 KB voor kerncode en 5 MB voor offline-afbeeldingen. Vercel Preview-deployments vormen de testomgeving; pas na controle daarvan hoort dezelfde wijziging naar productie te gaan. De privacy-uitleg in de site beschrijft gegevensgebruik, ouderlijke controle, export, verwijdering en bewaartermijnen.

Dezelfde controle bewaakt nu ook de mobiele viewport en de responsieve omschakelingen voor drie schermklassen:

- computer: vier spelkaarten naast elkaar en een spelbord met zijpaneel;
- tablet: twee spelkaarten naast elkaar, spellen onder elkaar en één zeeslagbord per rij;
- telefoon: één spelkaart per rij en enkelkoloms vensters voor ouder- en privacy-informatie.

Voer vóór iedere publicatie `node scripts/validate-levels.js` en `node scripts/production-check.js` uit. Voor een lokale browsercontrole start je `node scripts/local-server.js` en open je `http://127.0.0.1:4173`.
