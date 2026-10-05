"""Darf dieser Prozess eine Hochschule fragen? Nur mit Silas' ausdrücklicher Genehmigung (V-0242).

Silas, 05.10.2026: „Ab jetzt sind keine Zugriffe mehr auf das TU-System erlaubt, solange ich es nicht
ausdrücklich genehmigt habe.“ Anlass: innoCampus (TU Berlin) sieht das Abrufen der Weboberfläche nicht
gern und sperrt auffällige Adressen. Agenten, die das Werkzeug bauten, hatten am 4. und 5.10.2026
einige tausend MOSES-Seiten abgerufen, ohne dass Silas davon wusste; dazu fuhr jede Auslieferung einen
Abruf mehr (V-0241). Eine Regel in einer Anleitung allein hätte das nicht verhindert, denn die Agenten
starteten den Abruf, um ihn zu testen. Deshalb sperrt der Code selbst.

Genehmigt ist genau ein Weg: der tägliche Lauf im Container stundenplanner-abruf (betrieb/lauf.py). Er
setzt VARIABLE nur für seinen Schritt `abruf`. Jeder andere Weg zu moses.Client oder lsf.Client endet
hier, bevor eine Anfrage das Haus verlässt: abruf.py im Arbeitsbaum, modulliste.py, ein Test mit echtem
Netz, ein Agent „nur zum Nachsehen“.

SETZE VARIABLE NIE SELBST. Wer einen Zugriff braucht, fragt Silas vorher und nennt (1) den Umfang:
welche Seiten, wie viele Anfragen, wie oft; (2) die Maßnahmen gegen Last: Pausen, Uhrzeit,
Zwischenspeicher, Abbruchgrenze; (3) den Grund, warum es ohne den Zugriff nicht geht (AGENTS.md §2 ⑦).
Erst mit seiner Antwort, und nur in dem Umfang, den er genehmigt.
"""
from __future__ import annotations

import os

VARIABLE = 'STUNDENPLANNER_ABRUF_GENEHMIGT'
TAEGLICHER_LAUF = 'taeglicher-lauf'

SATZ = ('Zugriffe auf Hochschulsysteme sind gesperrt (Silas, 05.10.2026). Genehmigt ist nur der tägliche '
        'Lauf im Container stundenplanner-abruf. Wer mehr braucht, fragt Silas vorher und nennt Umfang, '
        'Maßnahmen gegen Last und Grund (AGENTS.md §2 ⑦). Die Freigabe-Variable nie selbst setzen.')


class Gesperrt(RuntimeError):
    """Ein Zugriff ohne Genehmigung. Absichtlich kein SourceError: Der Abruf darf ihn nicht als
    „Modul gescheitert, der Vorbestand trägt“ schlucken, er bricht ab."""


def genehmigt() -> bool:
    return os.environ.get(VARIABLE) == TAEGLICHER_LAUF


def pruefen(host: str) -> None:
    """Vor JEDER Anfrage an eine Hochschule. Wirft Gesperrt, ohne dass etwas gesendet wurde."""
    if not genehmigt():
        raise Gesperrt(f'{host}: {SATZ}')
