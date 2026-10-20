"""Read-only catalogue/source audit. No database, catalogue or workbook writes."""
import argparse, hashlib, json, re, zipfile, posixpath
import xml.etree.ElementTree as ET
from pathlib import Path

MEASUREMENTS = ["bustMm", "waistMm", "hipMm", "shoulderMm", "sleeveLengthMm", "garmentLengthMm"]
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

def workbook_rows(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(t.text or "" for t in si.findall(".//s:t", NS)) for si in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        rels = {x.attrib["Id"]: x.attrib["Target"] for x in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        sheets = {}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).findall("s:sheets/s:sheet", NS):
            target = rels[sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]]
            target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
            rows = {}
            for row in ET.fromstring(archive.read(target)).findall(".//s:sheetData/s:row", NS):
                values = []
                for cell in row.findall("s:c", NS):
                    value_node = cell.find("s:v", NS)
                    value = value_node.text if value_node is not None else None
                    if cell.attrib.get("t") == "s" and value is not None: value = strings[int(value)]
                    if cell.attrib.get("t") == "inlineStr": value = "".join(t.text or "" for t in cell.findall(".//s:t", NS))
                    if value is not None: values.append(str(value).strip())
                rows[int(row.attrib["r"])] = values
            sheets[sheet.attrib["name"]] = rows
        return sheets

def codes(product):
    return sorted({m[1].upper() + "_" + m[2] for variant in product["variants"] for m in re.finditer(r"(HIDI|KUR|COR)[_-](\d{3})(?!\d)", variant["sku"], re.I)})

def labelled(rows):
    result = []; section = "General"
    for row_number, cells in rows:
        for cell in cells:
            if re.match(r"^Top\s*/", cell, re.I): section = "Top"
            elif re.match(r"^Bottom\s*/", cell, re.I): section = "Bottom"
            elif re.match(r"^Dupatta\s*/", cell, re.I): section = "Dupatta"
        if not cells: continue
        parts = re.split(r"\s*:\s*", cells[0], maxsplit=1)
        label = parts[0].strip()
        value = " | ".join(cells[1:]) if len(parts) == 1 else parts[1]
        if value: result.append({"section": section, "label": label, "value": value, "row": row_number})
    return result

parser = argparse.ArgumentParser()
parser.add_argument("--workbook", required=True)
parser.add_argument("--source-index", required=True)
parser.add_argument("--catalogue", required=True)
args = parser.parse_args()
workbook = Path(args.workbook); sheets = workbook_rows(workbook)
index = json.loads(Path(args.source_index).read_text(encoding="utf-8-sig"))
products = json.loads(Path(args.catalogue).read_text(encoding="utf-8-sig"))
source_by_code = {}
for source in index: source_by_code.setdefault(source["sku"], []).append(source)
reviewed = {}; audit = []
for product in products:
    product_codes = codes(product)
    sources = source_by_code.get(product_codes[0], []) if len(product_codes) == 1 else []
    source = sources[0] if len(sources) == 1 else None
    fields = labelled([(r, sheets[source["sheet"]].get(r, [])) for r in range(source["start_row"], source["end_row"] + 1)]) if source else []
    specs = []
    for field in fields:
        label, value, section = field["label"], field["value"], field["section"]
        display = {"Neckline": "Neckline", "Sleeves": "Sleeves", "Front Detail": "Front detail", "Side Detail": "Side detail", "Lining": "Lining", "Pocket Detail": "Pocket detail"}.get(label)
        if label == "Length" and section in ["Top", "Bottom"]: display = "Top length" if section == "Top" else "Bottom length"
        if not display or re.search(r"approximately|appearance|looks|appears|decorative circular", value, re.I): continue
        if display in [s["label"] for s in specs]: continue
        specs.append({"label": display, "value": value, "sheet": source["sheet"], "row": field["row"]})
    # "With lining" is an explicit source statement, even when stored in Fabric.
    if not any(spec["label"] == "Lining" for spec in specs):
        lining_source = next((f for f in fields if f["label"].lower() == "fabric" and re.search(r"\bwith lining\b", f["value"], re.I)), None)
        if lining_source:
            specs.append({"label": "Lining", "value": "Included", "sheet": source["sheet"], "row": lining_source["row"], "sourceValue": lining_source["value"]})
    # Do not select an arbitrary first value or replace a conflicting live label.
    live_description = product.get("description") or ""
    spec_issues = []
    safe_specs = []
    for spec in specs:
        source_values = {f["value"] for f in fields if f["label"].casefold() == spec["label"].casefold()}
        live_values = re.findall(r"^\s*" + re.escape(spec["label"]) + r"\s*:\s*([^\n]+)", live_description, re.I | re.M)
        def agrees(value):
            if value.strip().casefold() == spec["value"].casefold(): return True
            # Both phrases explicitly confirm presence; neither specifies lining fabric.
            return spec["label"] == "Lining" and spec["value"] == "Included" and bool(re.fullmatch(r"(?:Inner )?Lining (?:Available|Included)|Lining All Over|Included", value.strip(), re.I))
        if len(source_values) > 1 or any(not agrees(value) for value in live_values):
            spec_issues.append(spec["label"] + ": conflicting explicit values; not added")
        else: safe_specs.append(spec)
    specs = safe_specs
    variants = product["variants"]
    missing = []
    for key in MEASUREMENTS:
        if any(not isinstance(v.get(key), (int, float)) or v[key] <= 0 for v in variants): missing.append(key)
    if not re.search(r"(?:model.*height|model.*wear(?:ing|s).*size)", product.get("description") or "", re.I): missing.append("model height and worn size")
    if not any(spec["label"] == "Lining" for spec in specs): missing.append("lining confirmation")
    if not any(f["label"].lower() == "pocket detail" and "pocket" in f["value"].lower() for f in fields): missing.append("pocket confirmation")
    if not any("waistband" in (f["label"] + f["value"]).lower() for f in fields): missing.append("waistband confirmation")
    missing.append("fibre composition percentages")
    issues = spec_issues.copy()
    if not source: issues.append("No unique source-code match; no workbook specifications added")
    fabric_values = sorted({f["value"] for f in fields if f["label"].lower() == "fabric"})
    if fabric_values and any(value.casefold() != (product.get("fabric") or "").casefold() for value in fabric_values): issues.append("Fabric wording differs between source workbook and live catalogue; no fabric override")
    source_fits = sorted({f["value"] for f in fields if f["label"].lower() in ["fit", "fit / silhouette"]})
    live_fit = re.search(r"^\s*Fit:\s*([^\n]+)", live_description, re.I | re.M)
    if live_fit and source_fits and live_fit[1].strip().casefold() not in [v.casefold() for v in source_fits]: issues.append("Fit wording differs between workbook garment sections and live summary; no fit override")
    if re.search(r"^Model:\s*.*(?:piece|set|kurta|kurtha)", product.get("description") or "", re.I | re.M): issues.append("Model field contains product contents rather than model sizing")
    if product["slug"] == "hidi-019-fuchsia-pink-floral-printed-kurta-set-with-pants":
        issues += ["Fit: live summary Relaxed Fit; workbook Straight-Fit Kurta / Comfortable Fit pants; no fit override", "Pattern: workbook print versus live narrative embroidery; no technique claim"]
    if specs:
        reviewed[product["slug"]] = {"productId": product["id"], "catalogueName": product["name"], "catalogueFabric": product.get("fabric"), "catalogueDescription": product.get("description"), "styleCode": product_codes[0], "specifications": specs}
    audit.append({"id": product["id"], "slug": product["slug"], "styleCodes": product_codes, "sourceMatch": {"sheet": source["sheet"], "startRow": source["start_row"], "endRow": source["end_row"]} if source else None, "variantCount": len(variants), "variantsWithAnyMeasurement": sum(any(v.get(k) is not None for k in MEASUREMENTS) for v in variants), "confirmedSpecifications": specs, "missingOrIncomplete": missing, "issues": issues})
summary = {"auditedOn": "2026-10-20", "publishedProducts": len(products), "variants": sum(len(p["variants"]) for p in products), "productsWithUniqueSourceMatch": sum(a["sourceMatch"] is not None for a in audit), "productsWithConfirmedSpecifications": len(reviewed), "variantsWithAnyMeasurement": sum(a["variantsWithAnyMeasurement"] for a in audit), "sourceWorkbook": workbook.name, "sourceWorkbookSha256": hashlib.sha256(workbook.read_bytes()).hexdigest(), "sourceEntries": len(index), "duplicateSourceCodes": [c for c, entries in source_by_code.items() if len(entries) > 1], "verificationScope": "Explicit original workbook entries cross-checked by unique style code. No physical garment measurement verification or image inference."}
Path("docs/product-data-audit.json").write_text(json.dumps({"summary": summary, "products": audit}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
Path("apps/web/lib/pdp-reviewed-specifications.json").write_text(json.dumps(reviewed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary))
