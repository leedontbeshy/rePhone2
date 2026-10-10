import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  FRONTEND_BROWSER_SUITES,
  browserTestTitle,
  type FrontendBrowserSuiteDefinition,
  type FrontendBrowserSuiteId,
  type FrontendBrowserTestDefinition,
} from './frontend-browser-coverage';
import {
  FRONTEND_OPERATION_COVERAGE,
  FRONTEND_REQUIRED_STATES,
  FRONTEND_ROUTE_COVERAGE,
} from './frontend-coverage';

interface BrowserTestReference {
  readonly specFile: string;
  readonly suiteId: string;
  readonly testId: string;
}

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const browserRoot = join(repositoryRoot, 'tests/browser');

describe('FE-09 browser ownership contract', () => {
  it('keeps every browser spec and test registered exactly once', () => {
    const discovery = discoverBrowserTests();
    const expectedSpecFiles = [
      ...new Set(
        Object.values(FRONTEND_BROWSER_SUITES).flatMap((suite) => [
          suite.specFile,
          ...Object.values(
            suite.tests as Readonly<Record<string, FrontendBrowserTestDefinition>>,
          ).flatMap((definition) =>
            definition.specFile === undefined ? [] : [definition.specFile],
          ),
        ]),
      ),
    ].sort();
    const expectedReferences = registeredTestReferences();

    expect(discovery.disallowedCalls).toEqual([]);
    expect(discovery.specFiles).toEqual(expectedSpecFiles);
    expect(validateBrowserReferences(discovery.references, expectedReferences)).toEqual([]);
  });

  it('resolves every operation owner to a real suite in the same business phase', () => {
    for (const [, , , , , , phase, owner] of FRONTEND_OPERATION_COVERAGE) {
      expect(owner in FRONTEND_BROWSER_SUITES, `${owner} is not registered`).toBe(true);
      expect(FRONTEND_BROWSER_SUITES[owner as FrontendBrowserSuiteId].phase).toBe(phase);
    }
  });

  it('assigns all registered routes to one primary browser test and validates secondary claims', () => {
    const manifestRoutes = FRONTEND_ROUTE_COVERAGE.map(([route]) => route).sort();
    const knownRoutes = new Set(manifestRoutes);
    const primaryRoutes: string[] = [];

    for (const suite of Object.values(
      FRONTEND_BROWSER_SUITES,
    ) as readonly FrontendBrowserSuiteDefinition[]) {
      for (const testDefinition of Object.values(
        suite.tests,
      ) as readonly FrontendBrowserTestDefinition[]) {
        primaryRoutes.push(...testDefinition.ownsRoutes);
        for (const route of [...testDefinition.ownsRoutes, ...testDefinition.coversRoutes]) {
          expect(knownRoutes.has(route), `${suite.specFile} claims unknown route ${route}`).toBe(
            true,
          );
        }
      }
    }

    expect(primaryRoutes).toHaveLength(manifestRoutes.length);
    expect(new Set(primaryRoutes).size).toBe(manifestRoutes.length);
    expect([...primaryRoutes].sort()).toEqual(manifestRoutes);
  });

  it('uses stable titles and assigns every approved UI state to an owner', () => {
    const allowedStates = new Set<string>(FRONTEND_REQUIRED_STATES);
    const claimedStates = new Set<string>();
    const displayTitles: string[] = [];

    for (const [suiteId, suite] of Object.entries(FRONTEND_BROWSER_SUITES) as Array<
      [FrontendBrowserSuiteId, FrontendBrowserSuiteDefinition]
    >) {
      expect(suite.specFile).toBe(`${suiteId.slice('browser:'.length)}.spec.ts`);
      for (const [testId, testDefinition] of Object.entries(suite.tests)) {
        expect(testId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(testDefinition.title.trim().length).toBeGreaterThan(0);
        displayTitles.push(browserTestTitle(suiteId, testId as never));
        for (const state of testDefinition.ownsStates) {
          claimedStates.add(state);
          expect(
            allowedStates.has(state),
            `${suiteId}#${testId} claims unknown state ${state}`,
          ).toBe(true);
        }
      }
    }

    expect(new Set(displayTitles).size).toBe(displayTitles.length);
    expect([...claimedStates].sort()).toEqual([...FRONTEND_REQUIRED_STATES].sort());
  });

  it('fails closed when a registered test disappears or an unregistered test is added', () => {
    const expected = registeredTestReferences();
    const missingOne = expected.slice(1);
    const extraOne = [
      ...expected,
      {
        specFile: 'frontend-foundation.spec.ts',
        suiteId: 'browser:frontend-foundation',
        testId: 'unregistered-test',
      },
    ];

    expect(validateBrowserReferences(missingOne, expected)).toContain(
      `missing:${referenceKey(expected[0] as BrowserTestReference)}`,
    );
    expect(validateBrowserReferences(extraOne, expected)).toContain(
      'extra:frontend-foundation.spec.ts|browser:frontend-foundation#unregistered-test',
    );
  });
});

function discoverBrowserTests(): {
  readonly disallowedCalls: readonly string[];
  readonly references: readonly BrowserTestReference[];
  readonly specFiles: readonly string[];
} {
  const specPaths = listBrowserTestFiles(browserRoot);
  const references: BrowserTestReference[] = [];
  const disallowedCalls: string[] = [];

  for (const specPath of specPaths) {
    const specFile = normalizePath(relative(browserRoot, specPath));
    const sourceFile = ts.createSourceFile(
      specPath,
      readFileSync(specPath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      /\.[jt]sx$/.test(specPath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const titleIdentifiers = readBrowserTitleIdentifiers(sourceFile);
    const playwrightTestIdentifiers = readPlaywrightTestIdentifiers(sourceFile);

    visit(sourceFile, (node) => {
      if (!ts.isCallExpression(node)) return;

      if (ts.isIdentifier(node.expression) && playwrightTestIdentifiers.has(node.expression.text)) {
        const reference = readRegisteredTitleCall(node, specFile, titleIdentifiers);
        if (reference === null) {
          disallowedCalls.push(
            `${specFile}:${(sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1).toString()}`,
          );
        } else {
          references.push(reference);
        }
        return;
      }

      const memberChain = readMemberChain(node.expression);
      const blockedModifier = memberChain.find((member) =>
        ['only', 'skip', 'fixme', 'fail'].includes(member),
      );
      if (
        memberChain[0] !== undefined &&
        playwrightTestIdentifiers.has(memberChain[0]) &&
        blockedModifier !== undefined
      ) {
        disallowedCalls.push(
          `${specFile}:${(sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1).toString()}:${blockedModifier}`,
        );
      }
    });
  }

  return {
    disallowedCalls: disallowedCalls.sort(),
    references,
    specFiles: specPaths.map((path) => normalizePath(relative(browserRoot, path))).sort(),
  };
}

function readRegisteredTitleCall(
  testCall: ts.CallExpression,
  specFile: string,
  titleIdentifiers: ReadonlySet<string>,
): BrowserTestReference | null {
  const titleCall = testCall.arguments[0];
  if (
    titleCall === undefined ||
    !ts.isCallExpression(titleCall) ||
    !ts.isIdentifier(titleCall.expression) ||
    !titleIdentifiers.has(titleCall.expression.text)
  ) {
    return null;
  }

  const [suiteId, testId] = titleCall.arguments;
  if (
    suiteId === undefined ||
    testId === undefined ||
    !ts.isStringLiteralLike(suiteId) ||
    !ts.isStringLiteralLike(testId)
  ) {
    return null;
  }

  return { specFile, suiteId: suiteId.text, testId: testId.text };
}

function readBrowserTitleIdentifiers(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const identifiers = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.endsWith('apps/web/lib/frontend-browser-coverage')
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === 'browserTestTitle') identifiers.add(element.name.text);
    }
  }
  return identifiers;
}

function readPlaywrightTestIdentifiers(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const identifiers = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@playwright/test'
    ) {
      continue;
    }

    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === 'test') identifiers.add(element.name.text);
    }
  }
  return identifiers;
}

function registeredTestReferences(): BrowserTestReference[] {
  return Object.entries(FRONTEND_BROWSER_SUITES).flatMap(([suiteId, suite]) =>
    Object.entries(suite.tests as Readonly<Record<string, FrontendBrowserTestDefinition>>).map(
      ([testId, definition]) => ({
        specFile: definition.specFile ?? suite.specFile,
        suiteId,
        testId,
      }),
    ),
  );
}

function referenceKeys(references: readonly BrowserTestReference[]): string[] {
  return references.map(referenceKey).sort();
}

function referenceKey({ specFile, suiteId, testId }: BrowserTestReference): string {
  return `${specFile}|${suiteId}#${testId}`;
}

function validateBrowserReferences(
  actual: readonly BrowserTestReference[],
  expected: readonly BrowserTestReference[],
): string[] {
  const actualCounts = new Map<string, number>();
  const expectedKeys = new Set(referenceKeys(expected));
  for (const key of referenceKeys(actual)) {
    actualCounts.set(key, (actualCounts.get(key) ?? 0) + 1);
  }

  const issues: string[] = [];
  for (const key of expectedKeys) {
    const count = actualCounts.get(key) ?? 0;
    if (count === 0) issues.push(`missing:${key}`);
    if (count > 1) issues.push(`duplicate:${key}`);
  }
  for (const key of actualCounts.keys()) {
    if (!expectedKeys.has(key)) issues.push(`extra:${key}`);
  }
  return issues.sort();
}

function listBrowserTestFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return listBrowserTestFiles(target);
    return /\.(?:spec|test)\.(?:[cm]?[jt]sx?)$/.test(entry.name) ? [target] : [];
  });
}

function normalizePath(path: string): string {
  return path.split(sep).join('/');
}

function readMemberChain(expression: ts.Expression): string[] {
  if (ts.isIdentifier(expression)) return [expression.text];
  if (!ts.isPropertyAccessExpression(expression)) return [];
  return [...readMemberChain(expression.expression), expression.name.text];
}

function visit(node: ts.Node, visitor: (node: ts.Node) => void): void {
  visitor(node);
  node.forEachChild((child) => {
    visit(child, visitor);
  });
}
