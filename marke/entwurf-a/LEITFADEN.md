# Entwurf A: Feld

> Marke des Stundenplanners, einer von drei Entwürfen (V-0239, 05.10.2026). Silas wählt einen; erst dann wird er eingebaut. Die drei nebeneinander: [`../vergleich.html`](../vergleich.html).

## Die Idee

**Ein Fenster aus Rahmen und Kreuz, in einem Feld liegt eine Kachel: das Raster der Woche und dein Platz darin.**

Im Sand: Ein Quadrat ziehen, ein Kreuz hinein, in ein Feld mit der Ferse einen Stein setzen. Das Raster ist das, was jeder Stundenplan ist, und die eine Kachel ist das, was man darin sucht. Jedes Kind malt dieses Fenster.

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

Raster 48: Rahmen 40 × 40 mit Außenradius 8, Rahmen und Kreuz 4 breit, vier Felder 14 × 14 (Radius 3). Im Feld oben rechts liegt eine Kachel 8 × 8 (Radius 1,5), 3 vom Rand des Feldes. Die kleine Zeichnung (Raster 16) legt alles auf ganze Pixel: Rahmen 0–16, Strich 2, Felder 5, Kachel 3.

Auf Tafelgrün und auf Dunkel ist das Fenster Kreide und die Kachel Kreidegelb: ein Fenster, in dem Licht brennt. Auf Hell ist alles Tafelgrün, weil Kreidegelb dort nur 1,22:1 hätte.

Das Favicon ist eine Tafelgrün-Kachel mit dem Fenster in Kreide (Rahmen 1–15, Strich 2, Felder 4) und einer Kachel 2 × 2 in Kreidegelb, alles auf ganzen Pixeln. App-Symbole: dasselbe in groß, das Fenster in Kreide auf Tafelgrün.

## Farben

Quelle ist OKLCH, ins CSS kommt Hex (wie in docs/DESIGN.md §5). Die Markenfarben gehören dem Zeichen, den App-Symbolen und dem Vorschaubild. **In der Bedienung bleibt die Tinte der eine Akzent** (DESIGN §5.1): Eine Markenfarbe auf Knöpfen wäre die elfte Farbe und würde mit einem Modul verwechselt.

| | Name | Hex | OKLCH | Aufgabe |
|---|---|---|---|---|
| primär | Tafelgrün | `#1d5641` | `oklch(0.41 0.07 165)` | Zeichen und Schriftzug auf Hell, Fläche der App-Kachel und des Vorschaubilds |
| primär auf Dunkel | Tafelgrün hell | `#88d0b0` | `oklch(0.8 0.085 165)` | Zeichen auf dunklem Grund, wenn nur eine Farbe geht |
| sekundär | Kreidegelb | `#f6e28b` | `oklch(0.91 0.11 97)` | die Kachel im Feld auf Tafelgrün und auf Dunkel; nie als Schrift oder Linie auf Hell |
| neutral | Kreide | `#f3f8f6` | `oklch(0.975 0.006 165)` | Rahmen, Kreuz und Schrift auf Tafelgrün und auf Dunkel |
| Seite | Papier, Nacht | `#f7f8fb`, `#111213` | | die Gründe der Seite hell und dunkel (`--grau-2`) |

Tafelgrün (Ton 165) liegt nah am dritten Modul (Grün, Ton 150). In der Kopfzeile ist das Zeichen keine Kachel und steht allein; verwechselt wird es dort kaum, in der Bedienung hat Tafelgrün trotzdem nichts zu suchen.

**Kontraste**, aus den Hex-Werten gerechnet und abgeschnitten, nicht gerundet. Ziel: Text 4,5:1, Zeichen und Flächen 3:1. Das Logo ist von WCAG 1.4.3 ausgenommen; es hält die Werte trotzdem.

| Vorne | auf | Kontrast | Ziel | wo |
|---|---|---|---|---|
| Tafelgrün `#1d5641` | Papier (Seite hell) `#f7f8fb` | 8,03:1 | 4,50:1, ok | Logo in Farbe auf der hellen Seite |
| Tafelgrün `#1d5641` | Weiß `#ffffff` | 8,53:1 | 4,50:1, ok | Logo in Farbe auf Weiß |
| Kreide `#f3f8f6` | Nacht (Seite dunkel) `#111213` | 17,47:1 | 4,50:1, ok | Logo invertiert auf der dunklen Seite |
| Kreidegelb `#f6e28b` | Nacht (Seite dunkel) `#111213` | 14,44:1 | 3,00:1, ok | Kachel im Feld, invertiert auf Dunkel |
| Kreide `#f3f8f6` | Tafelgrün `#1d5641` | 7,95:1 | 4,50:1, ok | Schrift und Fenster auf Tafelgrün (Vorschaubild, App-Kachel) |
| Kreidegelb `#f6e28b` | Tafelgrün `#1d5641` | 6,57:1 | 3,00:1, ok | Kachel im Feld auf Tafelgrün |
| Tafelgrün hell `#88d0b0` | Nacht (Seite dunkel) `#111213` | 10,44:1 | 4,50:1, ok | Tafelgrün hell auf Dunkel |
| Kreidegelb `#f6e28b` | Papier (Seite hell) `#f7f8fb` | 1,22:1 | 3,00:1, nie | Kreidegelb auf Hell: nie |
| Tafelgrün `#1d5641` | Nacht (Seite dunkel) `#111213` | 2,19:1 | 3,00:1, nie | Tafelgrün auf Dunkel: nie, dort die invertierte Fassung |

## Schrift

Der Schriftzug ist aus **Schibsted Grotesk** gesetzt, Gewicht 700, Laufweite −0,01 em, mit der Unterschneidung der Schrift (HarfBuzz), und dann in Pfade umgewandelt. Schibsted Grotesk ist frei unter der **SIL Open Font License 1.1** (`schrift/OFL.txt`; Quelle: https://github.com/google/fonts/tree/main/ofl/schibstedgrotesk; Copyright The Schibsted-Grotesk Project Authors). Die Lizenz erlaubt, die Umrisse in einem Logo zu verwenden; eingebettet wird keine Schriftdatei.

**Die Seite bleibt bei der Systemschrift** (DESIGN §5.7) und lädt keine Webfont (DESIGN §6, Leistungsbudget). Schibsted Grotesk gibt es nur im Schriftzug, als Pfad. Wer neben dem Logo Text setzt (Vorschaubild, Plakat), nimmt Schibsted Grotesk 500 dafür; auf der Seite nie.

## Schutzraum, Mindestgrößen, Abstände

**Schutzraum:** x = ein Feld des Zeichens (14 von 48, also 0,29 × Zeichenhöhe). Ringsum um Logo, Schriftzug und Zeichen bleibt mindestens x frei von Text, Kanten und anderen Zeichen. Bei 28 px Zeichenhöhe sind das 8 px. Bild: `logo/schutzraum.svg`.

| Was | kleinste Größe |
|---|---|
| Zeichen | 16 px; unter 24 px die kleine Zeichnung. Druck: 6 mm hoch |
| Logo quer | Zeichen 20 px hoch, das Logo ist dann 111 px breit. Druck: Zeichen 6 mm, Logo 33 mm breit |
| Logo gestapelt | Zeichen 32 px hoch, dann 84 px breit |
| nur Schriftzug | Versalhöhe 7 px, dann 77 px breit |

**Abstände, die im Logo fest sind:** quer 12 von 48 zwischen Zeichen und Schriftzug, der Versalblock steht mittig zum Zeichen; gestapelt 11 von 48 zwischen Zeichen und Versalhöhe. Logo und Schriftzug werden nie neu zusammengesetzt, nur als Datei verwendet.

**Abstände in der Anwendung:**

- **Kopfzeile der Seite:** Logo quer, Zeichen 28 px hoch (156 px breit), senkrecht mittig in der 48-px-Zeile, links bündig mit dem Seitenrand (16 px am Handy, 24 px am Rechner). Hell die Fassung „farbe“, dunkel „invertiert“, umgeschaltet über `prefers-color-scheme` wie die Seite: inline, mit Klassen an den Pfaden und den Farben als Tokens in `web/stil.css` (keine weitere Anfrage). Die Lücke von 16 px zum Studiengang-Reiter hält den Schutzraum.
- **App-Symbole:** Das Zeichen nimmt 60 % der Kachelbreite ein (`icon-192`, `icon-512`, `apple-touch-icon`), in den randlosen Fassungen für Android 48 %, damit es in der runden Schutzzone (80 %) bleibt.
- **Favicon:** die eigene 16-px-Zeichnung auf ganzen Pixeln, nicht das verkleinerte große Zeichen.
- **Vorschaubild:** 96 px Rand links, Logo mit 163 px Zeichenhöhe, darunter eine Zeile in der Schrift des Schriftzugs (500), bündig mit dem Schriftzug, unten die Adresse.

## Richtig und falsch

Richtig:

- Genau ein Feld ist besetzt, immer oben rechts.
- Auf Hell einfarbig Tafelgrün (oder Schwarz), auf Tafelgrün und Dunkel Kreide mit Kreidegelb.
- Unter 24 px die kleine Zeichnung (`symbol-klein-*`, Favicon).
- Nur die Dateien verwenden, nicht nachbauen.
- Auf ruhigen Gründen: Papier, Weiß, Nacht, Schwarz oder die eigene Markenfläche.

Falsch:

- Kein zweites Feld füllen, keine Farbe je Feld: Das wäre ein Raster aus Modulfarben und kein Zeichen mehr.
- Das Fenster nicht drehen oder schräg stellen, die Felder nicht ungleich groß machen.
- Kreidegelb nie auf Hell, Tafelgrün nie auf Dunkel (2,19:1).
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
<link rel="mask-icon" href="safari-pinned-tab.svg" color="#1d5641">
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
