import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(workspaceRoot, 'apps/web');
const appRoot = resolve(webRoot, 'app');
const nextConfigPath = resolve(webRoot, 'next.config.ts');

const CLASSIFICATION_NOTICE =
  'Static evidence is advisory only. A wrapper candidate is not automatically safe to convert; ' +
  'confirm its imported component boundary, build output, hydration behavior, and browser contracts.';

try {
  const outputPath = parseArguments(process.argv.slice(2));
  const report = await buildReport();
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath === undefined) {
    process.stdout.write(json);
  } else {
    const destination = resolve(process.cwd(), outputPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, json, 'utf8');
  }
} catch {
  process.stderr.write(
    `${JSON.stringify({ error: { code: 'FE09_CLIENT_MEDIA_AUDIT_FAILED' } }, null, 2)}\n`,
  );
  process.exitCode = 1;
}

async function buildReport() {
  const sourceFiles = (await collectSourceFiles(webRoot)).filter((file) =>
    isProductionSource(file),
  );
  const tsxFiles = sourceFiles.filter((file) => extname(file) === '.tsx');
  const sources = new Map(
    await Promise.all(sourceFiles.map(async (file) => [file, await readFile(file, 'utf8')])),
  );

  const clientTsxFiles = tsxFiles.filter((file) => hasUseClientDirective(sourceFor(sources, file)));
  const clientPageFiles = clientTsxFiles.filter(
    (file) => file.startsWith(`${appRoot}${sep}`) && file.endsWith(`${sep}page.tsx`),
  );
  const pageClassifications = clientPageFiles.map((file) =>
    classifyClientPage(file, sourceFor(sources, file)),
  );
  const rawImageConsumers = tsxFiles
    .map((file) => rawImageEvidence(file, sourceFor(sources, file)))
    .filter((entry) => entry.occurrences.length > 0);
  const layoutPlacements = tsxFiles
    .filter((file) => file.startsWith(`${appRoot}${sep}`) && file.endsWith(`${sep}layout.tsx`))
    .map((file) => layoutProviderEvidence(file, sourceFor(sources, file)));
  const nextConfigSource = await readFile(nextConfigPath, 'utf8');
  const nextImageConsumers = sourceFiles
    .filter((file) => /from\s+['"]next\/image['"]/.test(sourceFor(sources, file)))
    .map(relativePath)
    .sort();

  return {
    schemaVersion: 1,
    scope: {
      root: 'apps/web',
      method: 'conservative-text-scan',
      excludes: ['test/spec source files', 'test directories', 'build output', 'dependencies'],
    },
    notice: CLASSIFICATION_NOTICE,
    summary: {
      clientPageCount: clientPageFiles.length,
      clientTsxCount: clientTsxFiles.length,
      rawImgConsumerCount: rawImageConsumers.length,
      rawImgOccurrenceCount: rawImageConsumers.reduce(
        (total, entry) => total + entry.occurrences.length,
        0,
      ),
      layoutCount: layoutPlacements.length,
    },
    clientPages: {
      count: clientPageFiles.length,
      files: clientPageFiles.map(relativePath).sort(),
      classifications: {
        counts: countClassifications(pageClassifications),
        entries: pageClassifications.sort(compareByPath),
      },
    },
    clientTsx: {
      count: clientTsxFiles.length,
      files: clientTsxFiles.map(relativePath).sort(),
    },
    rawImages: {
      consumerCount: rawImageConsumers.length,
      occurrenceCount: rawImageConsumers.reduce(
        (total, entry) => total + entry.occurrences.length,
        0,
      ),
      consumers: rawImageConsumers.sort(compareByPath),
      caveat:
        'Production-source matches exclude tests but do not prove that every matching module is reachable at runtime.',
    },
    layoutProviders: {
      layouts: layoutPlacements.sort(compareByPath),
      caveat:
        'Only provider-like JSX elements whose names end in Provider are reported; indirect composition may add other providers.',
    },
    nextImage: nextImageEvidence(nextConfigSource, nextImageConsumers),
  };
}

async function collectSourceFiles(root) {
  const files = [];
  await visit(root, files);
  return files.sort();
}

async function visit(directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path, files);
      continue;
    }
    if (entry.isFile() && ['.ts', '.tsx'].includes(extname(entry.name))) files.push(path);
  }
}

function shouldSkipEntry(name) {
  return ['.next', 'node_modules', 'coverage', 'dist', 'tests', '__tests__'].includes(name);
}

function isProductionSource(file) {
  const normalized = relativePath(file);
  return !(
    /(?:^|\/)(?:tests?|__tests__)(?:\/|$)/.test(normalized) ||
    /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function hasUseClientDirective(source) {
  return /^(?:\uFEFF|\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*(['"])use client\1\s*;/.test(
    source,
  );
}

function classifyClientPage(file, source) {
  const hookCalls = uniqueMatches(source, /\b(use[A-Z][A-Za-z\d_]*)\s*(?:<[^>]*>)?\s*\(/g);
  const replaceableRouteHooks = hookCalls.filter((hook) => hook === 'useParams');
  const directClientHooks = hookCalls.filter((hook) => hook !== 'useParams');
  const browserGlobals = uniqueMatches(
    source,
    /\b(window|document|navigator|localStorage|sessionStorage|matchMedia)\b/g,
  );
  const eventHandlers = uniqueMatches(source, /\b(on[A-Z][A-Za-z\d_]*)\s*=/g);
  const directEvidence = [
    ...directClientHooks.map((name) => `hook:${name}`),
    ...browserGlobals.map((name) => `browser-global:${name}`),
    ...eventHandlers.map((name) => `jsx-handler:${name}`),
  ].sort();
  const lineCount = source.split(/\r?\n/).length;

  if (directEvidence.length > 0) {
    return {
      path: relativePath(file),
      classification: 'client-required',
      evidence: directEvidence,
      rationale:
        'The current page module directly contains client-runtime evidence. Refactoring into a smaller client island still requires measurement and contract verification.',
    };
  }

  if (lineCount <= 80) {
    return {
      path: relativePath(file),
      classification: 'wrapper-candidate',
      evidence:
        replaceableRouteHooks.length === 0
          ? ['no-direct-client-runtime-evidence', `line-count:${String(lineCount)}`]
          : [
              ...replaceableRouteHooks.map((name) => `route-hook:${name}`),
              `line-count:${String(lineCount)}`,
            ],
      rationale:
        replaceableRouteHooks.length === 0
          ? 'The page is a small composition module with no direct client-runtime evidence detected; imported children may still require a client boundary.'
          : 'Page-level client evidence is limited to route params. Server params may replace it, but only after build, hydration, and browser verification.',
    };
  }

  return {
    path: relativePath(file),
    classification: 'needs-review',
    evidence: [`line-count:${String(lineCount)}`, 'no-known-direct-client-runtime-evidence'],
    rationale:
      'The static scan found no known client-runtime primitive, but the module is too substantial to classify as a wrapper candidate without manual review.',
  };
}

function rawImageEvidence(file, source) {
  const occurrences = [];
  const matcher = /<img(?=\s|>)/g;
  let match;
  while ((match = matcher.exec(source)) !== null) {
    occurrences.push({ line: lineNumberAt(source, match.index) });
  }
  return { path: relativePath(file), occurrences };
}

function layoutProviderEvidence(file, source) {
  const providerNames = uniqueMatches(source, /<([A-Z][A-Za-z\d]*Provider)(?=\s|>)/g);
  const imports = importedBindings(source);
  return {
    path: relativePath(file),
    scope: file === resolve(appRoot, 'layout.tsx') ? 'root' : 'nested',
    clientDirective: hasUseClientDirective(source),
    providers: providerNames.map((name) => ({
      name,
      importSource: imports.get(name) ?? null,
    })),
  };
}

function importedBindings(source) {
  const bindings = new Map();
  const matcher = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;/g;
  let match;
  while ((match = matcher.exec(source)) !== null) {
    const clause = match[1]?.trim();
    const importSource = match[2];
    if (clause === undefined || importSource === undefined || clause.startsWith('type ')) continue;

    const defaultBinding = clause.match(/^([A-Za-z_$][\w$]*)/u)?.[1];
    if (defaultBinding !== undefined) bindings.set(defaultBinding, importSource);

    const namedBlock = clause.match(/\{([\s\S]*?)\}/)?.[1];
    if (namedBlock === undefined) continue;
    for (const part of namedBlock.split(',')) {
      const normalized = part.trim().replace(/^type\s+/, '');
      if (normalized.length === 0) continue;
      const pieces = normalized.split(/\s+as\s+/);
      const localName = pieces.at(-1)?.trim();
      if (localName !== undefined && /^[A-Za-z_$][\w$]*$/u.test(localName)) {
        bindings.set(localName, importSource);
      }
    }
  }
  return bindings;
}

function nextImageEvidence(configSource, consumers) {
  const imagesBlockPresent = /\bimages\s*:/.test(configSource);
  const remotePatternsPresent = /\bremotePatterns\s*:/.test(configSource);
  const domainsPresent = /\bdomains\s*:/.test(configSource);
  const localPatternsPresent = /\blocalPatterns\s*:/.test(configSource);
  const allowlistConfigured = remotePatternsPresent || domainsPresent;
  return {
    configPath: relativePath(nextConfigPath),
    imagesBlockPresent,
    allowlistConfigured,
    detectedAllowlistKeys: [
      ...(remotePatternsPresent ? ['remotePatterns'] : []),
      ...(domainsPresent ? ['domains'] : []),
      ...(localPatternsPresent ? ['localPatterns'] : []),
    ],
    importConsumerCount: consumers.length,
    importConsumers: consumers,
    status: allowlistConfigured
      ? 'remote-allowlist-detected'
      : imagesBlockPresent
        ? 'images-config-needs-manual-review'
        : 'no-images-config-detected',
    caveat:
      'This is a static config scan. It does not validate runtime media hosts, fallbacks, deployment build arguments, or conversion safety.',
  };
}

function countClassifications(entries) {
  const counts = {
    'wrapper-candidate': 0,
    'client-required': 0,
    'needs-review': 0,
  };
  for (const entry of entries) counts[entry.classification] += 1;
  return counts;
}

function uniqueMatches(source, expression) {
  const values = new Set();
  let match;
  while ((match = expression.exec(source)) !== null) {
    const value = match[1];
    if (value !== undefined) values.add(value);
  }
  return [...values].sort();
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function sourceFor(sources, file) {
  const source = sources.get(file);
  if (source === undefined) throw new Error('Source inventory is incomplete.');
  return source;
}

function relativePath(file) {
  return relative(workspaceRoot, file).split(sep).join('/');
}

function compareByPath(left, right) {
  return left.path.localeCompare(right.path, 'en');
}

function parseArguments(arguments_) {
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--output') {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith('--') || output !== undefined) {
        throw new Error('Invalid output argument.');
      }
      output = value;
      index += 1;
      continue;
    }
    if (argument?.startsWith('--output=')) {
      const value = argument.slice('--output='.length);
      if (value.length === 0 || output !== undefined) throw new Error('Invalid output argument.');
      output = value;
      continue;
    }
    throw new Error('Unknown argument.');
  }
  return output;
}
