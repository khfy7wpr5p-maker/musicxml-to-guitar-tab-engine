'use strict';

function freezeObjectGraph(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;

  seen.add(value);
  const descriptors = Object.values(Object.getOwnPropertyDescriptors(value));
  for (const descriptor of descriptors) {
    if (Object.hasOwn(descriptor, 'value')) {
      freezeObjectGraph(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

module.exports = {
  freezeObjectGraph,
};
