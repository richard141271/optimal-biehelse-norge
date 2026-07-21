[OPEN] Debug session: `membership-signup`

## Problem
- Folk får fortsatt feil ved offentlig innmelding.
- Feilmeldingen i produksjon har vært både gammel schema-SQL og senere generisk "Innmelding er midlertidig utilgjengelig".
- Målet er at offentlig innmelding faktisk fungerer, ikke bare viser penere feil.

## Hypoteser
- `A`: Produksjon kjører ikke siste deploy, og brukere treffer gammel kodebane med gammel schema-feilmelding.
- `B`: `auth.admin.createUser(...)` lykkes, men insert i `public.medlemmer` feiler på en constraint eller manglende kolonne som ikke er synlig for brukeren.
- `C`: `public.medlemmer` finnes, men har annen struktur/constraint enn koden forventer, for eksempel `id`-type, `not null`, unik index eller trigger.
- `D`: En annen del av registreringsløpet feiler etter medlemsinnsetting, for eksempel vervelogikk eller etterfølgende innlogging, og brukeren ser derfor bare en generisk feil.
- `E`: Offentlig side og SQL Editor peker til riktig database, men produksjonsmiljøet har andre env-verdier eller andre service keys enn forventet.

## Evidence Goal
- Fange eksakt hvilken operasjon som feiler i `app/api/medlemmer/route.ts` og med hvilken database-/auth-feil.
