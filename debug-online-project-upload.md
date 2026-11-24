[OPEN] Debug session: `online-project-upload`

## Problem
- Opplasting av flere bilder/vedlegg i prosjekt feiler fortsatt (selv 2 stk).
- Enkeltbilde fra kamera kan lastes opp.
- Vedlegg kan slettes i prosjektet.
- Ønske: bilder som slettes i prosjekt skal bli liggende i Felles bildebibliotek.
- Ønske: all logikk for Felles bildebibliotek (duplikater/lagring/styring) skal være samlet i selve bildebiblioteket, ikke spredt utover andre moduler.

## Hypoteser (falsifiserbare)
- `A`: Opplasting feiler fordi det gjøres ekstra arbeid per fil (auto-arkivering til Felles bildebibliotek) som gjør requesten treg/ustabil ved flere filer.
- `B`: `request.formData()` feiler på større multipart (spesielt på mobil) selv ved få filer, avhengig av filtype (HEIC) og totalstørrelse.
- `C`: Supabase Storage upload feiler for noen filtyper/størrelser (f.eks. HEIC uten `contentType`) og stopper batchen.
- `D`: Instrumentering som forsøker å poste til en lokal debug-server over http blir blokkert fra https (mixed content) og gir støy/uforutsigbarhet i klienten.

## Plan
- Fjerne auto-arkivering til Felles bildebibliotek fra andre moduler slik at bildebiblioteket er eneste sted som styrer dette.
- Sørge for at sletting av prosjektvedlegg aldri sletter fra Felles bildebibliotek (kun prosjekt-bucket).
- Forenkle/robustgjøre upload ved å minimere arbeid per fil i prosjekt-endepunktet.

## Evidence
- Basert på brukerobservasjon etter siste deploy (ingen serverlogger tilgjengelig ennå).

## Status
- Pågående.
