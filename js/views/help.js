/* Klarkontor – Ansicht „Hilfe & Hinweise“ */
(function (root) {
  'use strict';
  const KK = root.KK, U = KK.util;
  KK.views = KK.views || {};

  KK.views.help = {
    render(el, params) {
      el.innerHTML = `
        <div class="page-head"><div><h1>Hilfe &amp; Hinweise</h1><div class="sub">Kurz erklärt, was Klarkontor kann – und wo seine Grenzen liegen.</div></div></div>
        <div class="card prose">
          <h2 id="start">So arbeiten Sie mit Klarkontor</h2>
          <ol>
            <li><strong>Kontakt anlegen</strong> und in der Pipeline weiterschieben (Neu → Angeschrieben → … → Kunde).</li>
            <li><strong>Angebot erstellen</strong> – direkt aus dem Kontakt. Mit „Festschreiben“ erhält es seine Nummer.</li>
            <li><strong>Angebot annehmen</strong> und per Klick in eine <strong>Rechnung</strong> umwandeln.</li>
            <li><strong>Rechnung festschreiben</strong>, als PDF oder E-Rechnung herunterladen und versenden.</li>
            <li><strong>Zahlung erfassen</strong>. Bei Verzug erinnert die Übersicht an fällige Rechnungen und erstellt auf Wunsch Mahnschreiben.</li>
          </ol>

          <h2 id="kleinunternehmer">Kleinunternehmerregelung (§ 19 UStG)</h2>
          <p>Wer die Kleinunternehmerregelung nutzt, weist keine Umsatzsteuer aus. Seit 2025 gilt: Der Umsatz im Vorjahr darf höchstens 25.000 € betragen und im laufenden Jahr voraussichtlich höchstens 100.000 €. Wird die Grenze von 100.000 € überschritten, entfällt die Regelung sofort ab diesem Umsatz.</p>
          <p>Die Anzeige „Kleinunternehmer-Grenze“ auf der Übersicht summiert Ihre Zahlungseingänge als <em>Orientierung</em>. Welche Umsätze genau zählen, ist steuerlich nicht immer eindeutig – bitte klären Sie Grenzfälle mit Ihrer Steuerberatung.</p>

          <h2 id="erechnung">E-Rechnung: XRechnung und ZUGFeRD</h2>
          <p>Seit dem 1. Januar 2025 müssen alle inländischen Unternehmen E-Rechnungen <strong>empfangen</strong> können. Beim <strong>Ausstellen</strong> gelten Übergangsfristen: Bis Ende 2026 sind Papier- und PDF-Rechnungen weiter erlaubt, bis Ende 2027 für Unternehmen mit bis zu 800.000 € Vorjahresumsatz, danach gilt die Pflicht für Rechnungen zwischen inländischen Unternehmen. Kleinunternehmer sind von der Pflicht zum Ausstellen ausgenommen.</p>
          <ul>
            <li><strong>XRechnung</strong> ist eine reine XML-Datei. Sie ist Standard bei Behörden und wird von den meisten Buchhaltungsprogrammen gelesen. Bei Behörden brauchen Sie deren <em>Leitweg-ID</em> (Feld „Käuferreferenz“).</li>
            <li><strong>ZUGFeRD</strong> (Factur-X) verbindet das lesbare PDF mit den maschinenlesbaren Daten in einer Datei. Das Klarkontor-PDF ist ein Hybrid mit eingebetteter XML, aber <em>nicht</em> als PDF/A-3 zertifiziert.</li>
          </ul>
          <p>Klarkontor prüft die erzeugten Daten gegen die europäische Norm EN 16931. Eine Prüfung mit dem offiziellen XRechnung-Prüftool (KoSIT) ersetzt das nicht – wenn der Empfänger strenge Prüfungen fährt, testen Sie zuerst eine Beispielrechnung. Für Rechtsfragen zur Pflicht fragen Sie bitte Ihre Steuerberatung; die Rechtslage kann sich ändern.</p>

          <h2 id="festschreiben">Warum „Festschreiben“?</h2>
          <p>Rechnungen müssen fortlaufend nummeriert und nach der Ausstellung unveränderbar sein. Deshalb sperrt Klarkontor Belege nach dem Festschreiben. Fehler korrigieren Sie mit einer <strong>Stornorechnung</strong> und einer neuen Rechnung. Entwürfe können Sie jederzeit ändern oder löschen. Belegnummern werden erst beim Festschreiben vergeben, damit keine Lücken entstehen.</p>

          <h2 id="mahnwesen">Mahnwesen</h2>
          <p>Die Mahnschreiben sind sachliche Textvorlagen. Verzugszinsen und die 40-€-Pauschale (nur zwischen Unternehmen) entsprechen § 288 BGB; den aktuellen Basiszinssatz tragen Sie in den Einstellungen selbst ein. Prüfen Sie Fristen und Beträge, bevor Sie ein Schreiben versenden.</p>

          <h2 id="daten">Datenschutz und Sicherung</h2>
          <p>Klarkontor funktioniert ohne Konto und ohne Server: Alle Daten bleiben in Ihrem Browser (lokaler Speicher). Es werden keine Daten an Dritte gesendet, auch keine Schriften oder Statistiken nachgeladen.</p>
          <p><strong>Das Risiko:</strong> Löschen Sie Ihre Browserdaten oder wechseln Sie das Gerät, sind die Daten weg. Laden Sie deshalb regelmäßig unter <a href="#/einstellungen/daten">Einstellungen → Daten &amp; Sicherung</a> eine Sicherung herunter und bewahren Sie sie sicher auf. Gesetzliche Aufbewahrungspflichten für Rechnungen und Geschäftsbriefe (derzeit in der Regel 8 bzw. 6 Jahre) liegen bei Ihnen – prüfen Sie die aktuellen Fristen.</p>

          <h2 id="grenzen">Grenzen</h2>
          <ul>
            <li>Klarkontor ist <strong>keine Steuerberatung</strong> und keine Buchhaltungssoftware. Lassen Sie Vorlagen, Texte und Pflichtangaben von Ihrer Steuerberatung prüfen.</li>
            <li>Nicht unterstützt: Reverse-Charge, innergemeinschaftliche Lieferungen, Leistungen an Empfänger im Ausland, Skonto, Abschlags- und Schlussrechnungen, Fremdwährungen.</li>
            <li>Die Software wird ohne Gewähr bereitgestellt. Prüfen Sie jede Rechnung vor dem Versand.</li>
          </ul>
        </div>`;
      const id = params && params[0];
      if (id) { const t = el.querySelector('#' + CSS.escape(id)); if (t) setTimeout(() => t.scrollIntoView({ block: 'start' }), 0); }
    },
  };
})(typeof self !== 'undefined' ? self : globalThis);
