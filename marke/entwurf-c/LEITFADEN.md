# Entwurf C: Kuhle

> Marke des Stundenplanners, einer von drei Entwürfen (V-0239, 05.10.2026). Silas wählt einen; erst dann wird er eingebaut. Die drei nebeneinander: [`../vergleich.html`](../vergleich.html).

## Die Idee

**Eine Kuhle und eine Murmel, die darin liegen bleibt: Für das, was du nehmen willst, ist genau ein Platz frei.**

Im Sand: Mit dem Fuß eine Kuhle ziehen, ein U, dann mit der Ferse die Murmel hineinsetzen. Im Sand gräbt man eine Kuhle und lässt die Murmel hineinrollen. Sie bleibt liegen, wo sie hinpasst, so wie ein Termin, der in die Lücke der Woche fällt.

## Die Dateien

Alle Zeichnungen sind SVG aus reinen Flächen, ohne Rasterbild; der Schriftzug ist in Pfade umgewandelt. „farbe“ ist für helle Gründe, „invertiert“ für dunkle und für die Markenfläche, „schwarz“ und „weiss“ sind einfarbig (Druck, Stempel, fremde Gründe).

| Was | Dateien |
|---|---|
| Logo quer | `logo/logo-quer-{farbe,invertiert,schwarz,weiss}.svg` |
| Logo gestapelt | `logo/logo-gestapelt-{farbe,invertiert,schwarz,weiss}.svg` |
| nur Schriftzug | `schriftzug/schriftzug-{farbe,invertiert,schwarz,weiss}.svg` |
| nur Zeichen | `symbol/symbol-{farbe,invertiert,schwarz,weiss}.svg`, unter 24 px `symbol/symbol-klein-*.svg` |
| Schutzraum | `logo/schutzraum.svg` |
| Farben | `farben/farben.svg` (Tafel), `farben/farben.css` (Variablen) |
| Favicon | `favicon/favicon.svg`, `favicon/favicon.ico` (16, 32, 48) |
| App-Symbole | `favicon/apple-touch-icon.png` (180, randlos), `favicon/icon-192.png`, `favicon/icon-512.png` (runde Kachel), `favicon/icon-maskable-192.png`, `favicon/icon-maskable-512.png` (randlos, Zeichen in der Schutzzone) |
| einfarbig | `favicon/safari-pinned-tab.svg` (Safari, auch als Manifest-Symbol „monochrome“) |
| Vorschaubild | `social/og-image.png` (1200 × 630), Quelle `social/og-image.svg` |
| Anwendung | `anwendung/kopfzeile-{hell,dunkel}.png`, `anwendung/kopfzeile-handy-{hell,dunkel}.png` |
| Schriftlizenz | `schrift/OFL.txt` |

## Das Zeichen

Raster 48: ein U aus einem Strich 5 breit mit runden Enden, Halbkreis mit Radius 17 um (24 | 20), gerade Schenkel 9 lang. Die Murmel hat den Durchmesser 19 und liegt 2,5 über dem inneren Boden der Kuhle, ihr Scheitel unter den Enden des U. Die kleine Zeichnung (Raster 16): Strich 2, Radius 5,5, Murmel 6.

Die Kuhle ist Kobalt, die Murmel Murmelorange, auf Hell wie auf Dunkel; auf Dunkel wird nur die Kuhle heller (Kobalt hell). Auf Kobalt als Fläche steht die Murmel nie (2,43:1), deshalb ist die App-Kachel weiß und das Vorschaubild hell.

Favicon und App-Symbole sind eine weiße Kachel mit der Kuhle in Kobalt und der Murmel in Murmelorange; bei 16 px die kleine Zeichnung, mittig.

## Farben

Quelle ist OKLCH, ins CSS kommt Hex (wie in docs/DESIGN.md §5). Die Markenfarben gehören dem Zeichen, den App-Symbolen und dem Vorschaubild. **In der Bedienung bleibt die Tinte der eine Akzent** (DESIGN §5.1): Eine Markenfarbe auf Knöpfen wäre die elfte Farbe und würde mit einem Modul verwechselt.

| | Name | Hex | OKLCH | Aufgabe |
|---|---|---|---|---|
| primär | Kobalt | `#1b4ba9` | `oklch(0.44 0.16 262)` | die Kuhle auf Hell |
| primär auf Dunkel | Kobalt hell | `#92bdfb` | `oklch(0.79 0.1 258)` | die Kuhle auf Dunkel |
| sekundär | Murmelorange | `#e06e03` | `oklch(0.66 0.175 52)` | die Murmel, auf Hell und auf Dunkel; nie als Schrift |
| neutral | Tinte | `#1d1e20` | `oklch(0.235 0.004 264)` | Schriftzug auf Hell |
| neutral | Kreideweiß | `#e6e8ea` | `oklch(0.93 0.004 250)` | Schriftzug auf Dunkel |
| Seite | Papier, Nacht | `#f7f8fb`, `#111213` | | die Gründe der Seite hell und dunkel (`--grau-2`) |

Kobalt (Ton 262) liegt nah am ersten Modul (Blau, Ton 250), Murmelorange (Ton 52) fast auf dem siebten (Orange, Ton 50). Das Zeichen steht nur in der Kopfzeile, nie auf Kacheln; trotzdem ist das die Variante mit der größten Nähe zu den Modulfarben.

**Kontraste**, aus den Hex-Werten gerechnet und abgeschnitten, nicht gerundet. Ziel: Text 4,5:1, Zeichen und Flächen 3:1. Das Logo ist von WCAG 1.4.3 ausgenommen; es hält die Werte trotzdem.

| Vorne | auf | Kontrast | Ziel | wo |
|---|---|---|---|---|
| Kobalt `#1b4ba9` | Papier (Seite hell) `#f7f8fb` | 7,53:1 | 3,00:1, ok | Kuhle auf der hellen Seite |
| Murmelorange `#e06e03` | Papier (Seite hell) `#f7f8fb` | 3,08:1 | 3,00:1, ok | Murmel auf der hellen Seite |
| Murmelorange `#e06e03` | Weiß `#ffffff` | 3,28:1 | 3,00:1, ok | Murmel auf Weiß (App-Kachel) |
| Tinte `#1d1e20` | Papier (Seite hell) `#f7f8fb` | 15,70:1 | 4,50:1, ok | Schriftzug auf Hell |
| Kobalt hell `#92bdfb` | Nacht (Seite dunkel) `#111213` | 9,72:1 | 3,00:1, ok | Kuhle invertiert auf Dunkel |
| Murmelorange `#e06e03` | Nacht (Seite dunkel) `#111213` | 5,71:1 | 3,00:1, ok | Murmel auf Dunkel |
| Kreideweiß `#e6e8ea` | Nacht (Seite dunkel) `#111213` | 15,26:1 | 4,50:1, ok | Schriftzug invertiert auf Dunkel |
| Murmelorange `#e06e03` | Kobalt `#1b4ba9` | 2,43:1 | 3,00:1, nie | Murmel auf Kobalt: nie (darum ist das Vorschaubild hell) |
| Murmelorange `#e06e03` | Papier (Seite hell) `#f7f8fb` | 3,08:1 | 4,50:1, nie | Murmelorange als Schrift: nie (Text braucht 4,5:1) |

## Schrift

Der Schriftzug ist aus **Figtree** gesetzt, Gewicht 600, Laufweite −0,01 em, mit der Unterschneidung der Schrift (HarfBuzz), und dann in Pfade umgewandelt. Figtree ist frei unter der **SIL Open Font License 1.1** (`schrift/OFL.txt`; Quelle: https://github.com/google/fonts/tree/main/ofl/figtree; Copyright The Figtree Project Authors). Die Lizenz erlaubt, die Umrisse in einem Logo zu verwenden; eingebettet wird keine Schriftdatei.

**Die Seite bleibt bei der Systemschrift** (DESIGN §5.7) und lädt keine Webfont (DESIGN §6, Leistungsbudget). Figtree gibt es nur im Schriftzug, als Pfad. Wer neben dem Logo Text setzt (Vorschaubild, Plakat), nimmt Figtree 500 dafür; auf der Seite nie.

## Schutzraum, Mindestgrößen, Abstände

**Schutzraum:** x = eine Murmel des Zeichens (19 von 48, also 0,40 × Zeichenhöhe). Ringsum um Logo, Schriftzug und Zeichen bleibt mindestens x frei von Text, Kanten und anderen Zeichen. Bei 28 px Zeichenhöhe sind das 11 px. Bild: `logo/schutzraum.svg`.

| Was | kleinste Größe |
|---|---|
| Zeichen | 16 px; unter 24 px die kleine Zeichnung. Druck: 6 mm hoch |
| Logo quer | Zeichen 20 px hoch, das Logo ist dann 103 px breit. Druck: Zeichen 6 mm, Logo 31 mm breit |
| Logo gestapelt | Zeichen 32 px hoch, dann 77 px breit |
| nur Schriftzug | Versalhöhe 7 px, dann 70 px breit |

**Abstände, die im Logo fest sind:** quer 11 von 48 zwischen Zeichen und Schriftzug, der Versalblock steht mittig zum Zeichen; gestapelt 10 von 48 zwischen Zeichen und Versalhöhe. Logo und Schriftzug werden nie neu zusammengesetzt, nur als Datei verwendet.

**Abstände in der Anwendung:**

- **Kopfzeile der Seite:** Logo quer, Zeichen 28 px hoch (144 px breit), senkrecht mittig in der 48-px-Zeile, links bündig mit dem Seitenrand (16 px am Handy, 24 px am Rechner). Hell die Fassung „farbe“, dunkel „invertiert“, umgeschaltet über `prefers-color-scheme` wie die Seite: inline, mit Klassen an den Pfaden und den Farben als Tokens in `web/stil.css` (keine weitere Anfrage). Die Lücke von 16 px zum Studiengang-Reiter hält den Schutzraum.
- **App-Symbole:** Das Zeichen nimmt 60 % der Kachelbreite ein (`icon-192`, `icon-512`, `apple-touch-icon`), in den randlosen Fassungen für Android 48 %, damit es in der runden Schutzzone (80 %) bleibt.
- **Favicon:** die eigene 16-px-Zeichnung auf ganzen Pixeln, nicht das verkleinerte große Zeichen.
- **Vorschaubild:** 96 px Rand links, Logo mit 163 px Zeichenhöhe, darunter eine Zeile in der Schrift des Schriftzugs (500), bündig mit dem Schriftzug, unten die Adresse.

## Richtig und falsch

Richtig:

- Die Murmel liegt in der Kuhle, unter ihrem Rand, mittig.
- Kuhle Kobalt, Murmel Murmelorange; einfarbig nur in Schwarz oder Weiß.
- Unter 24 px die kleine Zeichnung (`symbol-klein-*`, Favicon).
- Nur die Dateien verwenden, nicht nachbauen.
- Auf ruhigen Gründen: Papier, Weiß, Nacht, Schwarz oder die eigene Markenfläche.

Falsch:

- Die Murmel nicht auf den Rand oder aus der Kuhle legen, nicht vergrößern, bis sie den Rand berührt: Dann ist es ein Gesicht.
- Das U nicht schließen und nicht drehen (umgedreht ist es ein Bogen, kein Platz).
- Murmelorange nicht als Schrift (3,08:1) und nicht auf Kobalt.
- Kein Verlauf, kein Schatten, kein Schein, keine Kontur um das Zeichen.
- Nicht verzerren, nicht drehen, keine Farbe außerhalb der Tafel oben.
- Den Schriftzug nicht in einer anderen Schrift setzen und keinen Slogan ins Logo nehmen.
- Kein Rot der TU Berlin und kein Hochschulwappen daneben: Der Stundenplanner ist kein offizielles Angebot.

## Einbau, wenn dieser Entwurf gewählt wird

Ins `<head>` (Dateien aus `favicon/` neben die Seite, `og-image.png` aus `social/`):

```html
<link rel="icon" href="favicon.ico" sizes="48x48">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="mask-icon" href="safari-pinned-tab.svg" color="#1b4ba9">
<meta property="og:image" content="https://stundenplanner.de/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
```

Im Manifest (`theme_color` und `background_color` bleiben die Farben der Seite, `#f7f8fb`):

```json
"icons": [
  { "src": "favicon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
  { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
  { "src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
  { "src": "safari-pinned-tab.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "monochrome" }
]
```

In der Kopfzeile ersetzt das Logo den Text „Stundenplanner“ in `.name`, als Inline-SVG mit `aria-label="Stundenplanner"` (die Seite erlaubt kein `style`-Attribut, Farben stehen als `fill` im SVG). Die Content-Security-Policy erlaubt Bilder vom eigenen Ort (`img-src 'self' data:`). Mit dem Einbau ändern sich docs/DESIGN.md §5.1 (eine Zeile: Markenfarbe nur im Zeichen), §5.12 (das Favicon) und die Symbole in `web/`; das macht der Vorgang, der die Wahl einbaut, nicht dieser Entwurf.
