# Dzsufizio weboldal

A Dzsufizio 34 oldalas, statikus webes előnézete. Minden oldal önálló címen nyílik meg. A közös menü, a stíluslapok, a képek és a lejátszók külön fájlokban vannak. A weboldalnak nincs szüksége adatbázisra, szerveroldali futtatásra vagy külső csomagokra.

## Megtekintés a saját gépen

Node.js 22 vagy újabb kell. A projekt mappájában:

    npm run preview

Ez előállítja a weboldalt, majd megnyitásra kész állapotban kiszolgálja a http://127.0.0.1:4173/ címen. Az építés és az ellenőrzés külön is futtatható:

    npm run build
    npm run check

## Hol mit lehet módosítani?

| Hely | Tartalom |
| --- | --- |
| src/pages.json | Oldalcímek, útvonalak és leírások |
| src/pages/ | Az oldalak szövege, hivatkozásai és médiakártyái |
| src/layouts/ | Közös HTML-sablon és a 404-es oldal tartalma |
| src/assets/css/ | Arculat és elrendezés, cikkstílusok, médiakártyák |
| src/assets/js/ | Mobilmenü, oldalon belüli navigáció, csapatkártyák és videólejátszók |
| src/assets/images/ | WebP képek és valódi videóelőképek, témakörönként |
| scripts/ | Építés, helyi előnézet és hivatkozások ellenőrzése |

Az oldalak tartalmában a {{root}} jelölés a weboldal kezdőmappájára mutat. Így a linkek és a képek egy GitHub Pages alkönyvtárból is működnek. A dist/ mappa minden építéskor újra előáll; módosítsd a src/ fájljait.

Az Instagram- és TikTok-videók a szolgáltatók saját lejátszóját használják. A kártyák az eredeti hivatkozást is megőrzik, ha a szolgáltató egy felvételt nem ad át beágyazásra.

## GitHub Pages

1. Töltsd fel ezt a projektet egy új GitHub-repó main ágára. A .github/ mappa is kerüljön bele.
2. A repóban a **Settings → Pages → Build and deployment → Source** alatt válaszd a **GitHub Actions** lehetőséget.
3. Az **Actions → Dzsufizio · GitHub Pages** oldalon futtasd a **Run workflow** gombbal. A következő main ágra érkező változtatások automatikusan elindítják az építést és a telepítést.
4. Az elkészült webcím az Actions telepítési eredményében, illetve a **Settings → Pages** oldalon jelenik meg.

A telepítés csak a build kimenetét teszi közzé. A GitHub Pages előnézet noindex jelölést használ, hogy párhuzamosan megosztható legyen az éles dzsufizio.hu mellett. Ez keresőre vonatkozó jelzés, nem hozzáférési korlátozás. GitHub Free csomaggal a GitHub Pageshez nyilvános repó szükséges.

Ha a forrást ZIP-ből bontottad ki, és a kívánt GitHub-fiókban már be vagy jelentkezve a GitHub CLI-ben, az első lépés parancsokkal:

    git init -b main
    git add .
    git commit -m "Dzsufizio website"
    gh repo create dzsufizio-web --public --source . --remote origin --push

Új repó esetén a Pages forrását ezután kell a 2. pont szerint beállítani.
