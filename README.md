# Klarkontor

**Vom ersten Kontakt bis zur bezahlten E-Rechnung – ohne Abo, ohne Konto, ohne Cloud.**

Klarkontor ist eine kostenlose Web-App für Kleinunternehmer und Freelancer in Deutschland: Kunden-Pipeline, Angebote, Rechnungen mit GiroCode, E-Rechnungen (XRechnung/ZUGFeRD), Zahlungsüberwachung und Mahnwesen. Alle Daten bleiben im Browser der Nutzerin bzw. des Nutzers.

## Funktionen

| Bereich | Was es kann |
|---|---|
| **Übersicht** | Offene und überfällige Forderungen, Umsatz, Pipeline-Wert, „Was jetzt zu tun ist“, Monatsumsatz, Einrichtungs-Checkliste |
| **Kleinunternehmer-Grenze** | Zeigt Umsatz gegenüber den Grenzen nach § 19 UStG (25.000 € Vorjahr / 100.000 € laufendes Jahr) |
| **Kontakte** | Pipeline-Board (Drag & Drop) und Liste, Verlauf, Wiedervorlagen, Auftragswert, Angebot/Rechnung per Klick |
| **Angebote & Rechnungen** | Live-Vorschau, Einheiten, 19 %/7 % oder § 19, Rabatt (% oder €), Leistungszeitraum, Textbausteine mit Platzhaltern |
| **Festschreiben** | Lückenlose Nummernkreise (z. B. `RE-{YYYY}-{NNN}`), Pflichtangaben-Prüfung, Sperre nach Ausstellung, Storno per Stornorechnung |
| **PDF** | Eigene PDF-Engine (DIN-5008-nah, mehrseitig, Logo), **GiroCode** (EPC-QR) für die Überweisung |
| **E-Rechnung** | XRechnung 3.0 (CII-XML) und ZUGFeRD/Factur-X-Hybrid-PDF (EN 16931), Pflichtfeld-Check vor dem Export |
| **Zahlungen & Mahnwesen** | Teil-/Vollzahlungen, Überfälligkeit, Zahlungserinnerung, 1./2. Mahnung mit Verzugszinsen und 40-€-Pauschale (§ 288 BGB) |
| **Export** | CSV für die Steuerberatung: Einnahmen nach Zahlungseingang und Rechnungsübersicht |
| **Daten** | Sicherung/Wiederherstellung (JSON), Backup-Erinnerung, Beispieldaten, Migration aus dem alten Akquise-Tracker |
| **Technik** | Offline-fähig (PWA, installierbar), Dark Mode, Handy-Ansicht, strenge CSP, keine externen Ressourcen |

## Gestaltung

Das Designsystem heißt **„Vordruck“**: Klarkontor sieht aus wie ein gut gesetztes deutsches Formular. Formularfelder mit Beschriftung im Kästchen, Haarlinien, Feldnummern, Status als Stempel, Kontakte als Karteikarten, Beträge in Monospace mit doppelt unterstrichener Summe. Farben: Druckerschwarz, Formularrot (wie der SEPA-Überweisungsträger), Stempelblau. Schrift: Barlow / Barlow Condensed, Zahlen in IBM Plex Mono. Keine Rundungen, keine weichen Schatten. Die erzeugten Rechnungs-PDFs bleiben bewusst neutral (Schwarz/Grau), weil sie die Marke der Nutzerin bzw. des Nutzers tragen.

## Starten

Es gibt keinen Build-Schritt.

- **Lokal:** `app.html` per Doppelklick im Browser öffnen – fertig. (Offline-Modus/Installation benötigen einen Webserver.)
- **Mit Webserver:** `python3 -m http.server 8000` und `http://localhost:8000/` öffnen.
- **Veröffentlichen (z. B. GitHub Pages):** Repository → *Settings → Pages* → Branch `main`, Ordner `/ (root)`. Jeder statische Hoster funktioniert (Netlify, Cloudflare Pages, eigener Server).

Einstieg: `index.html` (Startseite) → `app.html` (App). `app.html?demo=1` lädt Beispieldaten, sofern noch keine eigenen Daten vorhanden sind. Die alten Seiten `generator.html` und `tracker.html` leiten in die App weiter; Kontakte aus dem alten Tracker werden automatisch übernommen.

## Vor dem Live-Gang

- [ ] `impressum.html` und `datenschutz.html` ausfüllen (markierte Platzhalter) und rechtlich prüfen lassen.
- [ ] Rechnungs-, Angebots- und Mahntexte einmal von einer Steuerberatung prüfen lassen.
- [ ] Eine Beispiel-XRechnung mit dem offiziellen KoSIT-Validator prüfen (siehe „E-Rechnung“ unten).
- [ ] Bei jeder Änderung an Dateien `VERSION` in `sw.js` erhöhen, damit installierte Apps aktualisieren.

## Datenschutz und Daten

- Alle Daten liegen im `localStorage` des Browsers (Schlüssel `klarkontor.data.v2`). Es gibt keinen Server, keine Cookies, kein Tracking; Schriften liegen lokal unter `fonts/`.
- Risiko: Browserdaten löschen oder Gerät wechseln = Daten weg. Die App erinnert deshalb an Sicherungen und fordert persistenten Speicher an.
- Logos werden beim Hochladen in ein JPEG umgerechnet; nur `data:image/jpeg`-Daten werden akzeptiert.

## E-Rechnung – Stand der Prüfung

- Das erzeugte CII-XML wird in den Tests gegen das **offizielle EN-16931-XSD** und die **EN-16931-Schematron-Regeln** (Factur-X 1.09, aus dem Python-Paket `factur-x`) validiert – für Kleinunternehmer und Regelbesteuerung, mit Rabatt, zwei Steuersätzen, Leistungszeitraum, Storno (Typ 381) und Sonderzeichen: **0 Befunde**.
- Die XRechnung-spezifischen Zusatzregeln (BR-DE-…) sind im Pflichtfeld-Check umgesetzt, aber **nicht** mit dem KoSIT-Validator geprüft (der war in der Entwicklungsumgebung nicht verfügbar).
- Das ZUGFeRD-PDF ist ein Hybrid mit eingebetteter `factur-x.xml` und XMP-Metadaten; es ist **nicht** als PDF/A-3 zertifiziert.
- Kleinunternehmer: Steuerkategorie `E` mit Befreiungsgrund § 19 UStG; die Steuernummer wird zusätzlich als Verkäuferkennung geführt (BR-CO-26).

## Grenzen

Keine Steuer- oder Rechtsberatung und keine Buchhaltung. Nicht unterstützt: Reverse-Charge, innergemeinschaftliche Lieferungen, Auslandsrechnungen, Fremdwährungen, Skonto, Abschlags-/Schlussrechnungen, Bankanbindung, E-Mail-Versand.

## Aufbau

```
index.html            Startseite (ohne JavaScript)
app.html              App (Hash-Routing: #/, #/kontakte, #/belege, #/beleg/:id, #/einstellungen/:tab, #/hilfe)
css/                  fonts.css, app.css (Designsystem „Vordruck“, Dark Mode), site.css (Startseite)
js/util.js            Geld (ganze Cent), Datum, HTML-Escaping (html``-Template), IBAN
js/calc.js            Beträge, USt-Gruppen, Rabatt, Nummernkreise, Belegstatus, Mahnberechnung
js/store.js           localStorage, Schema v2, Normalisierung, Migration, Import/Export
js/domain.js          Fachlogik: Kontakte, Festschreiben, Angebot→Rechnung, Storno, Zahlungen, Auswertungen
js/layout.js          Belegdesign als Zeichenbefehle (mm) – gemeinsame Quelle für PDF und Vorschau
js/pdf.js, docpdf.js  PDF-Writer ohne Abhängigkeiten (Helvetica, JPEG, Vektor-QR, Anhänge, XMP)
js/svg.js             Live-Vorschau (gleiches Layout als SVG)
js/fontmetrics.js     Helvetica-Breiten (AFM) für exakten Satz
js/epc.js             GiroCode-Payload (EPC069-12) + QR-Matrix
js/einvoice.js        XRechnung/ZUGFeRD (CII), Pflichtfeld-Prüfung
js/export.js          CSV-Exporte (mit Schutz gegen Formel-Injektion)
js/demo.js            Beispieldaten
js/ui.js, js/app.js   UI-Helfer, Router, Navigation
js/views/*.js         Ansichten
vendor/qrcode.js      QR-Code-Generator (Kazuhiko Arase, MIT)
fonts/                Barlow, Barlow Condensed, IBM Plex Mono (SIL Open Font License)
sw.js, manifest       Offline-Betrieb / Installation
```

Alle Kernmodule laufen im Browser **und** in Node (für Tests); klassische Skripte statt ES-Module, damit `file://` funktioniert.

## Tests

```bash
npm install
npm test            # alle Tests
npm run test:unit   # Rechenkern, Store, PDF, GiroCode, E-Rechnung, Export
npm run test:e2e    # Browser-Abläufe mit Playwright (Chromium)
npm run sample      # Beispiel-PDFs nach tests/out/
```

Für den vollen Umfang werden zusätzlich benötigt: `poppler-utils` (`pdftotext`, `pdftoppm`, `pdfimages`), Python 3 mit `factur-x`, `lxml`, `saxonche`, `pypdf` (E-Rechnungs-Validierung, Hybrid-PDF) sowie Playwright mit Chromium. Fehlen Werkzeuge, werden die betroffenen Tests übersprungen.

Abgedeckt u. a.: Cent-genaue Rundung (inkl. Zufallstests), Nummernkreise, Migration, Speicherfehler, Pflichtangaben, Storno, Mahnzinsen, PDF-Text/Seitenumbruch/Umlaute, QR-Code aus dem gerenderten PDF dekodiert, XML gegen XSD + Schematron, Hybrid-PDF-Extraktion, kompletter Ablauf im Browser, Autosave, XSS-Schutz, Backup-Roundtrip, Logo im PDF, Handy-Layout, `file://`, Barrierefreiheit (axe-core, WCAG 2 AA).

## Roadmap-Ideen

1. **E-Rechnungs-Viewer:** empfangene XRechnung/ZUGFeRD-Dateien lesbar anzeigen und als PDF speichern – seit 2025 muss jedes Unternehmen E-Rechnungen empfangen können.
2. Optionale, Ende-zu-Ende-verschlüsselte Synchronisierung zwischen Geräten (mögliches Bezahlmodell).
3. Skonto, Abschlags- und Schlussrechnungen, Reverse-Charge.
4. Leistungskatalog mit Preisen, wiederkehrende Rechnungen.
5. Versand per E-Mail (mailto mit Anhang-Hinweis) und Versandprotokoll.
