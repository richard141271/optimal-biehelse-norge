[OPEN] Debug session: `project-upload-images`

## Problem
- Opplasting av mange bilder til prosjekt-vedlegg feiler fortsatt av og til.
- Symptomet ser ut til å være ustabilitet ved mange bilder fra bildebibliotek/kamerarull.

## Hypoteser
- `A`: Klienten feiler før request er sendt ferdig når mange filer velges.
- `B`: Serveren feiler ved `request.formData()` eller multipart-lesing når payload blir stor.
- `C`: En eller flere filer feiler under lagring til storage, og hele batchen stopper.
- `D`: Auto-arkivering til Felles bildebibliotek gjør requesten for treg eller ustabil.
- `E`: Batch-/statuslogikk i klienten skjuler hvor feilen faktisk oppstår.

## Plan
- Starte debug-server for denne økten.
- Legge inn instrumentering i klient og API for prosjektvedlegg.
- Reprodusere og samle logger.
- Analysere bevis før eventuell logikkendring.

## Evidence
- Instrumentering lagt inn i klient:
  - `app/min-side/prosjekter/[id]/page.tsx`
  - logger batch-start, fetch-start, fetch-feil, respons og synlig feilstatus
- Instrumentering lagt inn i API:
  - `app/api/min-side/prosjekter/[id]/route.ts`
  - logger før/etter `request.formData()`, per storage-upload og ved arkivering til media-bibliotek
- Avventer ny reproduksjon for å samle runtime-logger i debug-serveren.

## Status
- Instrumentering er på plass.
- Avventer reproduksjon og logganalyse.
