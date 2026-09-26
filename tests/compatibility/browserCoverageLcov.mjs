import fs from 'node:fs';
import path from 'node:path';

function executableCountForSegment(ranges, offset) {
  let selected = null;
  for (const range of ranges) {
    if (range.startOffset <= offset && offset < range.endOffset) {
      const width = range.endOffset - range.startOffset;
      if (!selected || width < selected.width) {
        selected = {width, count: range.count};
      }
    }
  }
  return selected?.count ?? null;
}

function lineCoverage(text, ranges) {
  const lines = text.split('\n');
  const records = [];
  let offset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineStart = offset;
    const lineEnd = lineStart + line.length;
    offset = lineEnd + 1;
    if (line.trim().length === 0) continue;

    const boundaries = new Set([lineStart, Math.max(lineStart + 1, lineEnd)]);
    for (const range of ranges) {
      if (range.endOffset <= lineStart || range.startOffset >= lineEnd) continue;
      boundaries.add(Math.max(lineStart, range.startOffset));
      boundaries.add(Math.min(lineEnd, range.endOffset));
    }
    const ordered = [...boundaries].sort((left, right) => left - right);
    let observed = false;
    let count = 0;
    for (let boundaryIndex = 0; boundaryIndex < ordered.length - 1; boundaryIndex += 1) {
      const start = ordered[boundaryIndex];
      const end = ordered[boundaryIndex + 1];
      if (end <= start) continue;
      const probe = start + Math.floor((end - start - 1) / 2);
      const segmentCount = executableCountForSegment(ranges, probe);
      if (segmentCount === null) continue;
      observed = true;
      count = Math.max(count, segmentCount);
    }
    if (observed) records.push({line: index + 1, count});
  }
  return records;
}

function rawRanges(entry) {
  const functions = entry.rawScriptCoverage?.functions;
  if (Array.isArray(functions)) {
    return functions.flatMap((fn) => (
      Array.isArray(fn.ranges)
        ? fn.ranges.map((range) => ({
          startOffset: range.startOffset,
          endOffset: range.endOffset,
          count: range.count,
        }))
        : []
    ));
  }
  return Array.isArray(entry.ranges)
    ? entry.ranges.map((range) => ({
      startOffset: range.start,
      endOffset: range.end,
      count: range.count ?? 1,
    }))
    : [];
}

function repositorySourcePath(entryUrl, repositoryRoot) {
  let parsed;
  try {
    parsed = new URL(entryUrl);
  } catch {
    return null;
  }
  if (!parsed.pathname.startsWith('/workbench/') || !parsed.pathname.endsWith('.js')) return null;
  const fileName = path.posix.basename(parsed.pathname);
  const relative = path.posix.join('web/guitar-tab-workbench', fileName);
  const absolute = path.join(repositoryRoot, ...relative.split('/'));
  return fs.existsSync(absolute) ? relative : null;
}

export function browserCoverageToLcov(entries, repositoryRoot) {
  const sections = [];
  for (const entry of entries) {
    const sourcePath = repositorySourcePath(entry.url, repositoryRoot);
    if (!sourcePath || typeof entry.text !== 'string') continue;
    const coverage = lineCoverage(entry.text, rawRanges(entry));
    if (coverage.length === 0) continue;
    const hitLines = coverage.filter((record) => record.count > 0).length;
    sections.push([
      'TN:EDTAB-03-browser',
      `SF:${sourcePath}`,
      ...coverage.map((record) => `DA:${record.line},${record.count}`),
      `LF:${coverage.length}`,
      `LH:${hitLines}`,
      'end_of_record',
    ].join('\n'));
  }
  return sections.length === 0 ? '' : `${sections.join('\n')}\n`;
}

export async function startBrowserCoverage(page) {
  await page.coverage.startJSCoverage({
    resetOnNavigation: false,
    reportAnonymousScripts: false,
    includeRawScriptCoverage: true,
    useBlockCoverage: true,
  });
}

export async function writeStoppedBrowserCoverage(page, repositoryRoot, outputPath) {
  const entries = await page.coverage.stopJSCoverage();
  const lcov = browserCoverageToLcov(entries, repositoryRoot);
  if (lcov.length === 0) {
    throw new Error('No Workbench browser JavaScript coverage was captured.');
  }
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, lcov, 'utf8');
  return {entryCount: entries.length, byteLength: Buffer.byteLength(lcov)};
}
