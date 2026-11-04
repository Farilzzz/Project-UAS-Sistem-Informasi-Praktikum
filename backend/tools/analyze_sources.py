"""Read-only extraction of the three original references; run before implementation."""
from pathlib import Path
import json, hashlib
from openpyxl import load_workbook
from pypdf import PdfReader
from pptx import Presentation
root = Path(__file__).resolve().parents[2]
out = Path(__file__).resolve().parents[1] / 'docs'
out.mkdir(exist_ok=True)
data = {}
for p in root.iterdir():
    if p.suffix.lower() not in ('.pdf', '.xlsx', '.pptx'): continue
    entry = {'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
    if p.suffix == '.pdf':
        r = PdfReader(p)
        entry['pages'] = [{'page': i+1, 'text': page.extract_text()} for i,page in enumerate(r.pages)]
    elif p.suffix == '.xlsx':
        w = load_workbook(p, data_only=False); cached = load_workbook(p, data_only=True)
        entry['sheets'] = {s.title: [{'cell': c.coordinate, 'value': c.value, 'cached': cached[s.title][c.coordinate].value} for row in s for c in row if c.value is not None] for s in w}
    else:
        deck = Presentation(p)
        entry['slides'] = [{'slide': i+1, 'texts': [s.text for s in slide.shapes if s.has_text_frame], 'tables': [[[c.text for c in row.cells] for row in s.table.rows] for s in slide.shapes if s.has_table], 'notes': slide.notes_slide.notes_text_frame.text if slide.has_notes_slide else ''} for i,slide in enumerate(deck.slides)]
    data[p.name] = entry
path = out / 'source-extraction.json'
if path.exists():
    previous = json.loads(path.read_text(encoding='utf-8'))
    assert previous == data, 'Source changed; refusing to replace extraction'
else:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps(data, indent=2, ensure_ascii=False))
