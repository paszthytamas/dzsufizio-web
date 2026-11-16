# Dzsufizio átnézés

A szövegrészlet, kép, videó vagy foglalógomb mellett megjelenő „Megjegyzés ehhez” művelet a jobb oldali átnéző sávban nyitja meg az egyetlen szövegmezőt. Az adatbázisban az oldal és a megjelölt hely is szerepel. A kezelő a közös listából odaugorhat, késznek jelölhet vagy újranyithat egy kérést.

## Beállítás

1. Futtasd a 001_review.sql migrációt a projekthez tartozó Supabase-adatbázison.
2. A dzs_review.links táblában ugyanahhoz a board_id azonosítóhoz adj egy reviewer és egy owner hozzáférést. A hozzáférési linkekhez használj külön, 32 véletlen bájtból képzett base64url kódot. A táblába a kód SHA-256 értéke kerüljön, bytea formában. A kódot ne tedd a GitHub-forrásba.
3. A src/assets/js/review/config.js modulban állítsd be a projekt nyilvános REST-címét (/rest/v1 végződéssel, záró perjel nélkül) és a publishable kulcsot, restUrl és publishableKey mezőkkel. Ezt követően építsd és telepítsd a szokásos módon az oldalt.
4. A nyitóoldal címe után a #review= részt követően add meg az adott személy kódját. A két linket külön kezeld. A böngésző a megnyitás után eltávolítja a kódot a címsorból; az átnézés az adott lapon böngészve marad aktív.

A dzs_review séma tábláihoz a böngészőnek nincs közvetlen hozzáférése. A három adatbázisfüggvény minden lekérésnél ellenőrzi a linket. A normál látogató az átnéző sávot nem látja. A megjegyzéseket nem írjuk bele az oldal HTML-jébe.
