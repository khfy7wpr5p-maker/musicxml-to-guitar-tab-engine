'use strict';

const CLASSIFICATION = Object.freeze({
  SUPPORTED: 'SUPPORTED',
  SAFE_IGNORE: 'SAFE_IGNORE',
  LATER_GATE: 'LATER_GATE',
  REJECT: 'REJECT',
});

function classified(classification, feature = null) {
  return Object.freeze({ classification, feature });
}

const SUPPORTED = classified(CLASSIFICATION.SUPPORTED);
const SAFE_IGNORE = classified(CLASSIFICATION.SAFE_IGNORE);

function safeIgnoreAttributes(...names) {
  return Object.freeze(Object.fromEntries(names.map((name) => [name, SAFE_IGNORE])));
}

const ROOT_CHILDREN = Object.freeze({
  'part-list': SUPPORTED,
  part: SUPPORTED,
});

const PART_LIST_CHILDREN = Object.freeze({
  'score-part': SUPPORTED,
});

const SCORE_PART_CHILDREN = Object.freeze({
  'part-name': SAFE_IGNORE,
});

const PART_CHILDREN = Object.freeze({
  measure: SUPPORTED,
});

const MEASURE_CHILDREN = Object.freeze({
  attributes: SUPPORTED,
  note: SUPPORTED,
  backup: classified(CLASSIFICATION.LATER_GATE, 'backup-forward-cursor'),
  forward: classified(CLASSIFICATION.LATER_GATE, 'backup-forward-cursor'),
});

const ATTRIBUTES_CHILDREN = Object.freeze({
  divisions: SUPPORTED,
  time: SUPPORTED,
  staves: SUPPORTED,
  transpose: classified(CLASSIFICATION.REJECT, 'transpose'),
  'measure-style': classified(CLASSIFICATION.REJECT, 'measure-style'),
});

const TIME_CHILDREN = Object.freeze({
  beats: SUPPORTED,
  'beat-type': SUPPORTED,
});

const NOTE_CHILDREN = Object.freeze({
  pitch: SUPPORTED,
  rest: SUPPORTED,
  duration: SUPPORTED,
  voice: SUPPORTED,
  staff: SUPPORTED,
  tie: SUPPORTED,
  notations: SUPPORTED,
  type: SAFE_IGNORE,
  dot: SAFE_IGNORE,
  stem: SAFE_IGNORE,
  beam: SAFE_IGNORE,
  notehead: SAFE_IGNORE,
  'notehead-text': SAFE_IGNORE,
  accidental: SAFE_IGNORE,
  footnote: SAFE_IGNORE,
  level: SAFE_IGNORE,
  chord: classified(CLASSIFICATION.LATER_GATE, 'source-chord-marker'),
  grace: classified(CLASSIFICATION.LATER_GATE, 'grace-note'),
  cue: classified(CLASSIFICATION.REJECT, 'cue-note'),
  unpitched: classified(CLASSIFICATION.REJECT, 'unpitched-note'),
  'time-modification': classified(CLASSIFICATION.LATER_GATE, 'time-modification'),
  instrument: classified(CLASSIFICATION.REJECT, 'note-instrument-assignment'),
});

const PITCH_CHILDREN = Object.freeze({
  step: SUPPORTED,
  alter: SUPPORTED,
  octave: SUPPORTED,
});

const NOTATIONS_CHILDREN = Object.freeze({
  tied: SUPPORTED,
});

const ROOT_ATTRIBUTES = Object.freeze({ version: SUPPORTED });
const SCORE_PART_ATTRIBUTES = Object.freeze({ id: SUPPORTED });
const PART_ATTRIBUTES = Object.freeze({ id: SUPPORTED });
const MEASURE_ATTRIBUTES = Object.freeze({ number: SUPPORTED, implicit: SUPPORTED });
const EMPTY_CHILDREN = Object.freeze({});
const EMPTY_ATTRIBUTES = Object.freeze({});

const FONT_ATTRIBUTES = safeIgnoreAttributes(
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
);

const FORMATTED_TEXT_ATTRIBUTES = Object.freeze({
  ...FONT_ATTRIBUTES,
  ...safeIgnoreAttributes(
    'color',
    'default-x',
    'default-y',
    'dir',
    'enclosure',
    'halign',
    'justify',
    'letter-spacing',
    'line-height',
    'line-through',
    'overline',
    'relative-x',
    'relative-y',
    'rotation',
    'underline',
    'valign',
  ),
});

const POSITION_ATTRIBUTES = safeIgnoreAttributes(
  'color',
  'default-x',
  'default-y',
  'relative-x',
  'relative-y',
);

const SAFE_IGNORE_NOTE_PROFILES = Object.freeze({
  type: Object.freeze({
    children: EMPTY_CHILDREN,
    attributes: safeIgnoreAttributes('size'),
  }),
  dot: Object.freeze({
    children: EMPTY_CHILDREN,
    attributes: Object.freeze({
      ...POSITION_ATTRIBUTES,
      ...FONT_ATTRIBUTES,
      ...safeIgnoreAttributes('placement'),
    }),
  }),
  stem: Object.freeze({
    children: EMPTY_CHILDREN,
    attributes: POSITION_ATTRIBUTES,
  }),
  beam: Object.freeze({
    children: EMPTY_CHILDREN,
    attributes: Object.freeze({
      ...safeIgnoreAttributes('color', 'id', 'number'),
      fan: classified(CLASSIFICATION.REJECT, 'beam-fan'),
      repeater: classified(CLASSIFICATION.REJECT, 'beam-repeater'),
    }),
  }),
  notehead: Object.freeze({
    children: EMPTY_CHILDREN,
    attributes: Object.freeze({
      ...FONT_ATTRIBUTES,
      ...safeIgnoreAttributes('color', 'filled', 'parentheses'),
      smufl: classified(CLASSIFICATION.REJECT, 'notehead-smufl'),
    }),
  }),
  'notehead-text': Object.freeze({
    children: Object.freeze({
      'display-text': SAFE_IGNORE,
      'accidental-text': SAFE_IGNORE,
    }),
    attributes: EMPTY_ATTRIBUTES,
    descendants: Object.freeze({
      'display-text': Object.freeze({
        children: EMPTY_CHILDREN,
        attributes: FORMATTED_TEXT_ATTRIBUTES,
      }),
      'accidental-text': Object.freeze({
        children: EMPTY_CHILDREN,
        attributes: Object.freeze({
          ...FORMATTED_TEXT_ATTRIBUTES,
          ...safeIgnoreAttributes('smufl'),
        }),
      }),
    }),
  }),
  accidental: Object.freeze({
    children: EMPTY_CHILDREN,
    attributes: Object.freeze({
      ...FONT_ATTRIBUTES,
      ...safeIgnoreAttributes(
        'bracket',
        'cautionary',
        'color',
        'default-x',
        'default-y',
        'editorial',
        'parentheses',
        'relative-x',
        'relative-y',
        'size',
        'smufl',
      ),
    }),
  }),
  footnote: Object.freeze({
    children: EMPTY_CHILDREN,
    attributes: FORMATTED_TEXT_ATTRIBUTES,
  }),
  level: Object.freeze({
    children: EMPTY_CHILDREN,
    attributes: safeIgnoreAttributes('bracket', 'parentheses', 'reference', 'size', 'type'),
  }),
});

const SAFE_IGNORE_SCORE_PART_PROFILES = Object.freeze({
  'part-name': Object.freeze({
    children: EMPTY_CHILDREN,
    attributes: Object.freeze({
      ...FONT_ATTRIBUTES,
      ...safeIgnoreAttributes(
        'color',
        'default-x',
        'default-y',
        'justify',
        'print-object',
        'relative-x',
        'relative-y',
      ),
    }),
  }),
});

const NOTE_ATTRIBUTES = Object.freeze({
  color: SAFE_IGNORE,
  'default-x': SAFE_IGNORE,
  'default-y': SAFE_IGNORE,
  'relative-x': SAFE_IGNORE,
  'relative-y': SAFE_IGNORE,
  'font-family': SAFE_IGNORE,
  'font-size': SAFE_IGNORE,
  'font-style': SAFE_IGNORE,
  'font-weight': SAFE_IGNORE,
  'print-dot': SAFE_IGNORE,
  'print-leger': SAFE_IGNORE,
  'print-object': SAFE_IGNORE,
  'print-spacing': SAFE_IGNORE,
  id: SAFE_IGNORE,
  attack: classified(CLASSIFICATION.REJECT, 'note-timing-offset'),
  release: classified(CLASSIFICATION.REJECT, 'note-timing-offset'),
  'time-only': classified(CLASSIFICATION.REJECT, 'conditional-note'),
  dynamics: classified(CLASSIFICATION.REJECT, 'note-attribute:dynamics'),
  'end-dynamics': classified(CLASSIFICATION.REJECT, 'note-attribute:end-dynamics'),
  pizzicato: classified(CLASSIFICATION.REJECT, 'note-attribute:pizzicato'),
});

const TIE_ATTRIBUTES = Object.freeze({
  type: SUPPORTED,
  'time-only': classified(CLASSIFICATION.REJECT, 'conditional-tie'),
});

function unqualifiedAttribute(node, name, processing = null, location = {}) {
  for (let attributeIndex = 0; attributeIndex < node.attributes.length; attributeIndex += 1) {
    if (processing) {
      processing.checkpoint(`polyphonic-semantic-profile:${node.name}-attribute-lookup`, {
        ...location,
        attributeIndex,
      });
    }
    const attribute = node.attributes[attributeIndex];
    if (attribute.name === name && attribute.uri.length === 0) {
      return attribute;
    }
  }
  return undefined;
}

function rejectEntry(entry, fallbackFeature, location, rejectUnsupported, extraDetails = {}) {
  if (
    entry.classification === CLASSIFICATION.SUPPORTED
    || entry.classification === CLASSIFICATION.SAFE_IGNORE
  ) {
    return;
  }
  throw rejectUnsupported(entry.feature || fallbackFeature, { ...location, ...extraDetails });
}

function enforceChildren(
  node,
  surface,
  table,
  location,
  rejectUnsupported,
  unknownFeature = null,
  processing = null,
) {
  const grouped = new Map();
  for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
    const child = node.children[childIndex];
    if (processing) {
      processing.checkpoint(`polyphonic-semantic-profile:${surface}-child`, {
        ...location,
        childIndex,
      });
    }
    if (child.uri !== node.uri) {
      continue;
    }
    const entry = table[child.name];
    if (!entry) {
      const feature = unknownFeature
        ? unknownFeature(child.name)
        : `${surface}-child:${child.name}`;
      throw rejectUnsupported(feature, location);
    }
    rejectEntry(entry, `${surface}-child:${child.name}`, location, rejectUnsupported);
    const existing = grouped.get(child.name);
    if (existing) {
      existing.push(child);
    } else {
      grouped.set(child.name, [child]);
    }
  }
  return grouped;
}

function enforceAttributes(
  node,
  surface,
  table,
  location,
  rejectUnsupported,
  processing = null,
) {
  const grouped = new Map();
  for (let attributeIndex = 0; attributeIndex < node.attributes.length; attributeIndex += 1) {
    const attribute = node.attributes[attributeIndex];
    if (processing) {
      processing.checkpoint(`polyphonic-semantic-profile:${surface}-attribute`, {
        ...location,
        attributeIndex,
      });
    }
    if (attribute.uri.length !== 0) {
      continue;
    }
    const entry = table[attribute.name];
    if (!entry) {
      throw rejectUnsupported(`${surface}-attribute:${attribute.name}`, location);
    }
    const extraDetails = {};
    if (entry.feature === 'note-timing-offset') {
      extraDetails.attribute = attribute.name;
    } else if (entry.feature === 'conditional-note' || entry.feature === 'conditional-tie') {
      extraDetails.timeOnly = attribute.value;
    }
    rejectEntry(
      entry,
      `${surface}-attribute:${attribute.name}`,
      location,
      rejectUnsupported,
      extraDetails,
    );
    const existing = grouped.get(attribute.name);
    if (existing) {
      existing.push(attribute);
    } else {
      grouped.set(attribute.name, [attribute]);
    }
  }
  return grouped;
}

function enforceLeaf(node, surface, location, rejectUnsupported, processing = null) {
  enforceChildren(
    node,
    surface,
    EMPTY_CHILDREN,
    location,
    rejectUnsupported,
    null,
    processing,
  );
  enforceAttributes(
    node,
    surface,
    EMPTY_ATTRIBUTES,
    location,
    rejectUnsupported,
    processing,
  );
}

function enforceNodeProfile(
  node,
  surface,
  profile,
  location,
  rejectUnsupported,
  processing = null,
) {
  const groupedChildren = enforceChildren(
    node,
    surface,
    profile.children,
    location,
    rejectUnsupported,
    null,
    processing,
  );
  enforceAttributes(
    node,
    surface,
    profile.attributes,
    location,
    rejectUnsupported,
    processing,
  );
  for (const [childName, childProfile] of Object.entries(profile.descendants || {})) {
    for (const child of groupedChildren.get(childName) || []) {
      enforceNodeProfile(
        child,
        childName,
        childProfile,
        location,
        rejectUnsupported,
        processing,
      );
    }
  }
}

function enforceGroupedProfiles(
  groupedChildren,
  profiles,
  location,
  rejectUnsupported,
  processing = null,
) {
  for (const [childName, profile] of Object.entries(profiles)) {
    for (const child of groupedChildren.get(childName) || []) {
      enforceNodeProfile(
        child,
        childName,
        profile,
        location,
        rejectUnsupported,
        processing,
      );
    }
  }
}

function enforceScalarLeaves(
  groupedChildren,
  names,
  location,
  rejectUnsupported,
  processing = null,
) {
  for (const name of names) {
    for (const node of groupedChildren.get(name) || []) {
      enforceLeaf(node, name, location, rejectUnsupported, processing);
    }
  }
}

function enforceNoteProfile(noteNode, location, rejectUnsupported, processing = null) {
  const noteChildren = enforceChildren(
    noteNode,
    'note',
    NOTE_CHILDREN,
    location,
    rejectUnsupported,
    null,
    processing,
  );
  enforceAttributes(
    noteNode,
    'note',
    NOTE_ATTRIBUTES,
    location,
    rejectUnsupported,
    processing,
  );
  enforceScalarLeaves(
    noteChildren,
    ['duration', 'voice', 'staff'],
    location,
    rejectUnsupported,
    processing,
  );
  enforceGroupedProfiles(
    noteChildren,
    SAFE_IGNORE_NOTE_PROFILES,
    location,
    rejectUnsupported,
    processing,
  );

  for (const pitch of noteChildren.get('pitch') || []) {
    const pitchChildren = enforceChildren(
      pitch,
      'pitch',
      PITCH_CHILDREN,
      location,
      rejectUnsupported,
      null,
      processing,
    );
    enforceAttributes(
      pitch,
      'pitch',
      EMPTY_ATTRIBUTES,
      location,
      rejectUnsupported,
      processing,
    );
    enforceScalarLeaves(
      pitchChildren,
      ['step', 'alter', 'octave'],
      location,
      rejectUnsupported,
      processing,
    );
  }
  for (const rest of noteChildren.get('rest') || []) {
    enforceLeaf(rest, 'rest', location, rejectUnsupported, processing);
  }
  for (const tie of noteChildren.get('tie') || []) {
    enforceChildren(
      tie,
      'tie',
      Object.freeze({}),
      location,
      rejectUnsupported,
      null,
      processing,
    );
    enforceAttributes(
      tie,
      'tie',
      TIE_ATTRIBUTES,
      location,
      rejectUnsupported,
      processing,
    );
  }
  for (const notations of noteChildren.get('notations') || []) {
    const notationChildren = enforceChildren(
      notations,
      'notations',
      NOTATIONS_CHILDREN,
      location,
      rejectUnsupported,
      (name) => `notation:${name}`,
      processing,
    );
    enforceAttributes(
      notations,
      'notations',
      EMPTY_ATTRIBUTES,
      location,
      rejectUnsupported,
      processing,
    );
    for (const tied of notationChildren.get('tied') || []) {
      enforceChildren(
        tied,
        'tied',
        Object.freeze({}),
        location,
        rejectUnsupported,
        null,
        processing,
      );
      enforceAttributes(
        tied,
        'tied',
        TIE_ATTRIBUTES,
        location,
        rejectUnsupported,
        processing,
      );
    }
  }
}

function enforceAttributesProfile(
  attributesNode,
  location,
  rejectUnsupported,
  processing = null,
) {
  const attributeChildren = enforceChildren(
    attributesNode,
    'attributes',
    ATTRIBUTES_CHILDREN,
    location,
    rejectUnsupported,
    null,
    processing,
  );
  enforceAttributes(
    attributesNode,
    'attributes',
    EMPTY_ATTRIBUTES,
    location,
    rejectUnsupported,
    processing,
  );
  enforceScalarLeaves(
    attributeChildren,
    ['divisions', 'staves'],
    location,
    rejectUnsupported,
    processing,
  );
  for (const time of attributeChildren.get('time') || []) {
    const timeChildren = enforceChildren(
      time,
      'time',
      TIME_CHILDREN,
      location,
      rejectUnsupported,
      null,
      processing,
    );
    enforceAttributes(
      time,
      'time',
      EMPTY_ATTRIBUTES,
      location,
      rejectUnsupported,
      processing,
    );
    enforceScalarLeaves(
      timeChildren,
      ['beats', 'beat-type'],
      location,
      rejectUnsupported,
      processing,
    );
  }
}

function enforcePolyphonicMusicXmlSemanticProfile(
  parsedDocument,
  rejectUnsupported,
  processing = null,
) {
  const root = parsedDocument.root;
  const rootChildren = enforceChildren(
    root,
    'root',
    ROOT_CHILDREN,
    {},
    rejectUnsupported,
    null,
    processing,
  );
  enforceAttributes(root, 'root', ROOT_ATTRIBUTES, {}, rejectUnsupported, processing);

  const part = rootChildren.get('part')[0];
  const partChildren = enforceChildren(
    part,
    'part',
    PART_CHILDREN,
    {},
    rejectUnsupported,
    null,
    processing,
  );
  enforceAttributes(part, 'part', PART_ATTRIBUTES, {}, rejectUnsupported, processing);

  const measures = partChildren.get('measure') || [];
  for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
    const measure = measures[measureIndex];
    const numberAttribute = unqualifiedAttribute(measure, 'number', processing, { measureIndex });
    const location = {
      measureIndex,
      measureNumber: numberAttribute ? numberAttribute.value : undefined,
    };
    if (processing) {
      processing.checkpoint('polyphonic-semantic-profile:measure', location);
    }
    const measureChildren = enforceChildren(
      measure,
      'measure',
      MEASURE_CHILDREN,
      location,
      rejectUnsupported,
      null,
      processing,
    );
    enforceAttributes(
      measure,
      'measure',
      MEASURE_ATTRIBUTES,
      location,
      rejectUnsupported,
      processing,
    );

    for (const attributes of measureChildren.get('attributes') || []) {
      enforceAttributesProfile(attributes, location, rejectUnsupported, processing);
    }

    const noteChildren = measureChildren.get('note') || [];
    for (let sourceOrder = 0; sourceOrder < noteChildren.length; sourceOrder += 1) {
      if (processing) {
        processing.checkpoint('polyphonic-semantic-profile:event', {
          ...location,
          sourceOrder,
        });
      }
      enforceNoteProfile(
        noteChildren[sourceOrder],
        { ...location, sourceOrder },
        rejectUnsupported,
        processing,
      );
    }
  }

  const partList = rootChildren.get('part-list')[0];
  const partListChildren = enforceChildren(
    partList,
    'part-list',
    PART_LIST_CHILDREN,
    {},
    rejectUnsupported,
    null,
    processing,
  );
  enforceAttributes(partList, 'part-list', EMPTY_ATTRIBUTES, {}, rejectUnsupported, processing);

  const scorePart = partListChildren.get('score-part')[0];
  const scorePartChildren = enforceChildren(
    scorePart,
    'score-part',
    SCORE_PART_CHILDREN,
    {},
    rejectUnsupported,
    null,
    processing,
  );
  enforceAttributes(
    scorePart,
    'score-part',
    SCORE_PART_ATTRIBUTES,
    {},
    rejectUnsupported,
    processing,
  );
  enforceGroupedProfiles(
    scorePartChildren,
    SAFE_IGNORE_SCORE_PART_PROFILES,
    {},
    rejectUnsupported,
    processing,
  );
}

module.exports = {
  CLASSIFICATION,
  enforcePolyphonicMusicXmlSemanticProfile,
};
