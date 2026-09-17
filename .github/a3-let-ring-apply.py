from pathlib import Path

projector = Path('src/parser/polyphonicMusicXmlProjector.js')
text = projector.read_text(encoding='utf-8')
replacements = [
    (
        "  const state = { tieStart: false, tieStop: false };",
        "  const state = { tieStart: false, tieStop: false, letRing: false };",
    ),
    (
        "  for (const tied of tiedNodes) {\n    rejectConditionalTie(tied, location);\n    applyTieType(state, getAttribute(tied, 'type'), location);\n  }",
        "  for (const tied of tiedNodes) {\n    rejectConditionalTie(tied, location);\n    const tiedType = getAttribute(tied, 'type');\n    if (tiedType === 'let-ring') {\n      state.letRing = true;\n      continue;\n    }\n    applyTieType(state, tiedType, location);\n  }",
    ),
    (
        "    tieStart: tieState.tieStart,\n    tieStop: tieState.tieStop,\n    source: {",
        "    tieStart: tieState.tieStart,\n    tieStop: tieState.tieStop,\n    ...(tieState.letRing ? { letRing: true } : {}),\n    source: {",
    ),
]
for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'projector anchor count mismatch ({count}): {old[:60]!r}')
    text = text.replace(old, new, 1)
projector.write_text(text, encoding='utf-8')

model = Path('src/music/polyphonicSourceModel.js')
text = model.read_text(encoding='utf-8')
old = "      'tieStart',\n      'tieStop',\n      'source',\n    ]),\n    new Set(["
new = "      'tieStart',\n      'tieStop',\n      'letRing',\n      'source',\n    ]),\n    new Set(["
count = text.count(old)
if count != 1:
    raise SystemExit(f'allowed-key anchor count mismatch: {count}')
text = text.replace(old, new, 1)

old = "  const tieStop = requireBoolean(\n    descriptorValue(descriptors, 'tieStop'),\n    `${field}.tieStop`,\n    { measureIndex, eventIndex },\n  );\n  if (type === 'rest' && (tieStart || tieStop)) {"
new = "  const tieStop = requireBoolean(\n    descriptorValue(descriptors, 'tieStop'),\n    `${field}.tieStop`,\n    { measureIndex, eventIndex },\n  );\n  const hasLetRing = Object.hasOwn(descriptors, 'letRing');\n  const letRing = hasLetRing\n    ? requireBoolean(\n      descriptorValue(descriptors, 'letRing'),\n      `${field}.letRing`,\n      { measureIndex, eventIndex },\n    )\n    : false;\n  if (type === 'rest' && (tieStart || tieStop || letRing)) {"
count = text.count(old)
if count != 1:
    raise SystemExit(f'let-ring validation anchor count mismatch: {count}')
text = text.replace(old, new, 1)

old = "    tieStart,\n    tieStop,\n    source,\n  });"
new = "    tieStart,\n    tieStop,\n    ...(hasLetRing ? { letRing } : {}),\n    source,\n  });"
count = text.count(old)
if count != 1:
    raise SystemExit(f'normalized-event anchor count mismatch: {count}')
text = text.replace(old, new, 1)
model.write_text(text, encoding='utf-8')
