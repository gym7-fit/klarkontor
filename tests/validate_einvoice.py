#!/usr/bin/env python3
"""Prüft CII-XML gegen das offizielle EN-16931-XSD und die EN-16931-Geschäftsregeln (Schematron, aus dem Python-Paket 'factur-x').
Aufruf: validate_einvoice.py datei.xml [...]   -> JSON auf stdout, Exit-Code 1 bei Fehlern."""
import sys, json, os
try:
    import facturx
    from lxml import etree
    from saxonche import PySaxonProcessor
except ImportError as e:
    print(json.dumps({"skipped": str(e)})); sys.exit(0)

base = os.path.join(os.path.dirname(facturx.__file__), "xsd_and_schematron", "facturx-en16931")
xsd = etree.XMLSchema(etree.parse(os.path.join(base, "Factur-X_EN16931.xsd")))
result, bad = {}, False
with PySaxonProcessor(license=False) as proc:
    xslt = proc.new_xslt30_processor()
    exe = xslt.compile_stylesheet(stylesheet_file=os.path.join(base, "FACTUR-X_EN16931.xslt"))
    for path in sys.argv[1:]:
        doc = etree.parse(path)
        xsd_errors = [] if xsd.validate(doc) else [str(e) for e in xsd.error_log]
        out = exe.transform_to_string(source_file=path)
        svrl = etree.fromstring(out.encode("utf-8"))
        ns = {"svrl": "http://purl.oclc.org/dsdl/svrl"}
        failed = []
        for f in svrl.findall(".//svrl:failed-assert", ns):
            # Factur-X erlaubt nur dessen eigene Spezifikations-ID; die XRechnung-ID ist bewusst eine andere (CIUS)
            if f.get("id") == "FX-SCH-A-000556" and "xrechnung" in os.path.basename(path):
                continue
            failed.append({"id": f.get("id"), "flag": f.get("flag"), "text": " ".join("".join(f.itertext()).split())})
        result[path] = {"xsd": xsd_errors, "schematron": failed}
        if xsd_errors or failed: bad = True
print(json.dumps(result, ensure_ascii=False, indent=1))
sys.exit(1 if bad else 0)
