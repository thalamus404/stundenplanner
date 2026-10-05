# Entwurf B: Anschluss

> Marke des Stundenplanners, einer von drei Entwürfen (V-0239, 05.10.2026). Silas wählt einen; erst dann wird er eingebaut. Die drei nebeneinander: [`../vergleich.html`](../vergleich.html).

## Die Idee

**Zwei Kacheln, versetzt und ohne Überschneidung, ergeben ein S: Termine, die aneinander anschließen.**

Im Sand: Zwei Rechtecke, das zweite eine Stufe tiefer und nach links versetzt, beide mit dem Fuß ausfüllen. Der Zweck des Werkzeugs ist, dass Termine aneinanderpassen, ohne sich zu überschneiden. Zwei Kacheln zeigen genau das und sind zugleich der Anfangsbuchstabe.

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

Raster 48: zwei Kacheln 28 × 15 mit Radius 4,5, die obere ab x 16, die untere ab x 4, 4 Luft dazwischen; sie überlappen sich waagerecht um 16 und berühren sich nie. Auf der Textmarker-Kachel (Radius 23 %) nimmt das S 62 % der Breite ein. Die 16-px-Kachel hat eine eigene Zeichnung: Balken 9 × 4, 2 Luft, auf ganzen Pixeln.

Die Farbfassung auf Hell ist das S in Tinte auf der Textmarker-Kachel, denn Gelb auf Hell hätte nur 1,14:1. Auf Dunkel steht das S selbst in Textmarker, ohne Kachel.

Favicon und App-Symbole sind die Textmarker-Kachel mit dem S in Tinte. Bei 16 px eigene Balken (9 × 4, 2 Luft), damit beide Kacheln scharf bleiben.

## Farben

Quelle ist OKLCH, ins CSS kommt Hex (wie in docs/DESIGN.md §5). Die Markenfarben gehören dem Zeichen, den App-Symbolen und dem Vorschaubild. **In der Bedienung bleibt die Tinte der eine Akzent** (DESIGN §5.1): Eine Markenfarbe auf Knöpfen wäre die elfte Farbe und würde mit einem Modul verwechselt.

| | Name | Hex | OKLCH | Aufgabe |
|---|---|---|---|---|
| primär | Tinte | `#1d1e20` | `oklch(0.235 0.004 264)` | Zeichen und Schriftzug auf Hell, wie die Tinte der Seite |
| primär auf Dunkel | Kreideweiß | `#e6e8ea` | `oklch(0.93 0.004 250)` | Schriftzug auf Dunkel, wie die Tinte der Seite im dunklen Schema |
| sekundär | Textmarker | `#f8ee42` | `oklch(0.93 0.18 106)` | Fläche der Kachel hinter dem Zeichen und das Zeichen auf Dunkel; nie als Schrift oder Linie auf Hell |
| Seite | Papier, Nacht | `#f7f8fb`, `#111213` | | die Gründe der Seite hell und dunkel (`--grau-2`) |

Textmarker (Ton 106) liegt zwischen Bernstein für Hinweise (Ton 70–85) und dem achten Modul (Oliv, Ton 115), aber viel heller als beide. In der Bedienung bleibt die Tinte, wie heute: Diese Variante ändert an der Seite am wenigsten.

**Kontraste**, aus den Hex-Werten gerechnet und abgeschnitten, nicht gerundet. Ziel: Text 4,5:1, Zeichen und Flächen 3:1. Das Logo ist von WCAG 1.4.3 ausgenommen; es hält die Werte trotzdem.

| Vorne | auf | Kontrast | Ziel | wo |
|---|---|---|---|---|
| Tinte `#1d1e20` | Papier (Seite hell) `#f7f8fb` | 15,70:1 | 4,50:1, ok | Logo in Farbe auf der hellen Seite |
| Tinte `#1d1e20` | Textmarker `#f8ee42` | 13,74:1 | 4,50:1, ok | Zeichen und Schrift auf der Textmarker-Kachel und im Vorschaubild |
| Textmarker `#f8ee42` | Nacht (Seite dunkel) `#111213` | 15,44:1 | 3,00:1, ok | Zeichen invertiert auf der dunklen Seite |
| Kreideweiß `#e6e8ea` | Nacht (Seite dunkel) `#111213` | 15,26:1 | 4,50:1, ok | Schriftzug invertiert auf Dunkel |
| Textmarker `#f8ee42` | Papier (Seite hell) `#f7f8fb` | 1,14:1 | 3,00:1, nie | Textmarker auf Hell ohne Kachel: nie |

## Schrift

Der Schriftzug ist aus **Rubik** gesetzt, Gewicht 600, Laufweite −0,015 em, mit der Unterschneidung der Schrift (HarfBuzz), und dann in Pfade umgewandelt. Rubik ist frei unter der **SIL Open Font License 1.1** (`schrift/OFL.txt`; Quelle: https://github.com/google/fonts/tree/main/ofl/rubik; Copyright The Rubik Project Authors). Die Lizenz erlaubt, die Umrisse in einem Logo zu verwenden; eingebettet wird keine Schriftdatei.

**Die Seite bleibt bei der Systemschrift** (DESIGN §5.7) und lädt keine Webfont (DESIGN §6, Leistungsbudget). Rubik gibt es nur im Schriftzug, als Pfad. Wer neben dem Logo Text setzt (Vorschaubild, Plakat), nimmt Rubik 500 dafür; auf der Seite nie.

## Schutzraum, Mindestgrößen, Abstände

**Schutzraum:** x = eine Kachelhöhe des Zeichens (15 von 48, also 0,31 × Zeichenhöhe). Ringsum um Logo, Schriftzug und Zeichen bleibt mindestens x frei von Text, Kanten und anderen Zeichen. Bei 28 px Zeichenhöhe sind das 9 px. Bild: `logo/schutzraum.svg`.

| Was | kleinste Größe |
|---|---|
| Zeichen | 16 px; unter 24 px die kleine Zeichnung. Druck: 6 mm hoch |
| Logo quer | Zeichen 20 px hoch, das Logo ist dann 113 px breit. Druck: Zeichen 6 mm, Logo 34 mm breit |
| Logo gestapelt | Zeichen 32 px hoch, dann 83 px breit |
| nur Schriftzug | Versalhöhe 7 px, dann 76 px breit |

**Abstände, die im Logo fest sind:** quer 12 von 48 zwischen Zeichen und Schriftzug, der Versalblock steht mittig zum Zeichen; gestapelt 11 von 48 zwischen Zeichen und Versalhöhe. Logo und Schriftzug werden nie neu zusammengesetzt, nur als Datei verwendet.

**Abstände in der Anwendung:**

- **Kopfzeile der Seite:** Logo quer, Zeichen 28 px hoch (159 px breit), senkrecht mittig in der 48-px-Zeile, links bündig mit dem Seitenrand (16 px am Handy, 24 px am Rechner). Hell die Fassung „farbe“, dunkel „invertiert“, umgeschaltet über `prefers-color-scheme` wie die Seite: inline, mit Klassen an den Pfaden und den Farben als Tokens in `web/stil.css` (keine weitere Anfrage). Die Lücke von 16 px zum Studiengang-Reiter hält den Schutzraum.
- **App-Symbole:** Das Zeichen nimmt 60 % der Kachelbreite ein (`icon-192`, `icon-512`, `apple-touch-icon`), in den randlosen Fassungen für Android 48 %, damit es in der runden Schutzzone (80 %) bleibt.
- **Favicon:** die eigene 16-px-Zeichnung auf ganzen Pixeln, nicht das verkleinerte große Zeichen.
- **Vorschaubild:** 96 px Rand links, Logo mit 163 px Zeichenhöhe, darunter eine Zeile in der Schrift des Schriftzugs (500), bündig mit dem Schriftzug, unten die Adresse.

## Richtig und falsch

Richtig:

- Zwischen den Kacheln bleibt immer Luft: Sie schließen aneinander an und überschneiden sich nicht. Das ist die Aussage.
- Auf Hell das S in Tinte, mit oder ohne Textmarker-Kachel; auf Dunkel das S in Textmarker.
- Der Schriftzug ist klein geschrieben: stundenplanner.
- Nur die Dateien verwenden, nicht nachbauen.
- Auf ruhigen Gründen: Papier, Weiß, Nacht, Schwarz oder die eigene Markenfläche.

Falsch:

- Die Kacheln nicht zusammenschieben, nicht überlappen lassen, nicht spiegeln (dann ist es ein Z).
- Kein Textmarker-Gelb für Schrift, Linien oder das S auf Hell ohne Kachel.
- Keine dritte Kachel dazu.
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
<link rel="mask-icon" href="safari-pinned-tab.svg" color="#1d1e20">
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
