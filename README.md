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

Zeeslag en galgje ondersteunen daarna online kamers met joincodes en gesynchroniseerde spelstanden. Zeeslag gebruikt een klassiek 10×10-bord, een vloot van vijf schepen, een plaatsingsfase en beurtelings schieten. Profielen en puzzelvoortgang synchroniseren via beveiligde Vercel-serverfuncties; zonder verbinding blijft de lokale voortgang beschikbaar.

De service-role-key wordt uitsluitend door Vercel-serverfuncties gebruikt en mag nooit als `NEXT_PUBLIC_`-variabele worden ingesteld. Spelerpincodes worden met `scrypt` en een unieke salt gehasht. Sessietokens worden uitsluitend gehasht in Supabase opgeslagen.

Na het aanmelden kan via **Ouderherstel** een zescijferige oudercode worden ingesteld. Daarmee kan op het aanmeldscherm een vergeten spelerspincode worden vervangen. Ook oudercodes worden gehasht en na vijf foutieve pogingen tijdelijk geblokkeerd.

Online zeeslag gebruikt een afzonderlijke servergestuurde kamertabel. De server valideert vloten en schoten, houdt de tegenvloot geheim, voorkomt conflicterende zetten met revisienummers en ondersteunt herverbinden en revanche. Kamers verlopen automatisch na 24 uur.

Bij iedere online kamer staat een WhatsApp-deelknop. Uitnodigingslinks gebruiken de vorm `https://speelplaneet.vercel.app/?game=zeeslag&code=ABC-123` en openen na het aanmelden automatisch het juiste spel en de juiste kamer.

## Spellen

- Zeeslag, Galgje, Vier op een rij en Boter-kaas-en-eieren: solo en online met joincode
- Mini Sudoku, Woordzoeker, Memory, Kleurcode, Rekensprint en Sterrenreeks: solo met sterren en levels
- Ruimterunner: kies Ellie, Mila of Mats, spring over robots en buk voor ufo's; speelbaar zonder internet

Ieder spel heeft 100 unieke, oplopende niveaus. Elk spel/level-paar heeft een vaste missiecode en een deterministische puzzelconfiguratie. Daardoor blijft bijvoorbeeld niveau 37 bij een volgend bezoek dezelfde uitdaging, maar gebruikt geen ander niveau exact dezelfde configuratie. Na het voltooien van een niveau wordt automatisch het volgende niveau vrijgespeeld. De moeilijkheid groeit via langere woorden en reeksen, minder hints, unieke bordindelingen en codes, moeilijkere sommen en sterkere computertegenstanders.
