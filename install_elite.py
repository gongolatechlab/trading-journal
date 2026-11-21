#!/usr/bin/env python3
"""Safely install Gongola Journal Elite (styles + workflow) into the EXISTING app.
Never replaces existing journal JS, storage, cloud auth or settings.
"""
from pathlib import Path
from datetime import datetime
import os
import sys

repo = Path.cwd()
index = repo / 'index.html'
assets = ['elite.css', 'elite.js', 'journal-workflow.css', 'journal-workflow.js']
for filename in ['index.html', *assets]:
    if not (repo / filename).is_file():
        sys.exit(f'ERROR: Missing {filename}. Extract the Elite v2 package into the journal root first.')

original = index.read_text(encoding='utf-8')
if '<title>Gongola Journal' not in original or 'id="view-dashboard"' not in original or 'id="daily-detail"' not in original:
    sys.exit('ERROR: The existing journal structure is not recognized. No files changed.')
if original.count('</head>') != 1:
    sys.exit('ERROR: Unexpected </head> count. No files changed.')

links = {
    'elite.css': '    <link rel="stylesheet" href="./elite.css">',
    'elite.js': '    <script src="./elite.js" defer></script>',
    'journal-workflow.css': '    <link rel="stylesheet" href="./journal-workflow.css">',
    'journal-workflow.js': '    <script src="./journal-workflow.js" defer></script>',
}
updated = original
for filename, element in links.items():
    if f'./{filename}' not in updated:
        updated = updated.replace('</head>', element + '\n</head>')
# Re-enable pinch-to-zoom for accessibility without changing layout or storage.
updated = updated.replace(', maximum-scale=1.0, user-scalable=no', '')
if updated == original:
    print('Gongola Journal Elite v2 is already linked. No edits needed.')
    sys.exit(0)

backups = Path.home() / '.gongola-backups'
backups.mkdir(parents=True, exist_ok=True)
backup = backups / ('journal-index-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.html')
backup.write_text(original, encoding='utf-8')

scratch = index.with_name('.journal-index-elite-staged.html')
try:
    scratch.write_text(updated, encoding='utf-8')
    os.replace(scratch, index)
except Exception:
    scratch.unlink(missing_ok=True)
    raise
print('SUCCESS: Gongola Journal Elite v2 installed in existing index.html.')
print('Backup: ' + str(backup))
print('Preserved: myTrades, dailyNotes, journalSettings, Supabase login and trading calculations.')
print('Added: 3 themes, daily reviews, optional setup context, screenshot evidence and full JSON backup.')
