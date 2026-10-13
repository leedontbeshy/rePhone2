export interface PerformanceRevision {
  readonly sha: string;
  readonly clean: boolean;
  readonly changes: string;
  readonly sourceMode: 'commit' | 'working-tree';
  readonly sourceFingerprint: string;
  readonly sourceFileCount: number;
}

export interface PerformanceBuildProvenance {
  readonly schema: 'rephone.performance-build';
  readonly schemaVersion: 1;
  readonly commitSha: string;
  readonly sourceFingerprint: string;
  readonly sourceFileCount: number;
  readonly buildId: string;
  readonly runtimeFingerprint: string;
}

export const PERFORMANCE_REPOSITORY_ROOT: string;
export const PERFORMANCE_BUILD_MANIFEST: string;
export function isPerformanceSourceInput(file: string): boolean;
export function currentPerformanceRevision(options?: {
  readonly cwd?: string;
  readonly sourceMode?: string | undefined;
}): PerformanceRevision;
export function assertPerformanceRevisionAllowed(revision: PerformanceRevision): void;
export function assertSamePerformanceRevision(
  before: PerformanceRevision,
  after: PerformanceRevision,
): void;
export function validatePerformanceBuildProvenance(
  input: unknown,
  expected?: Partial<PerformanceBuildProvenance>,
): PerformanceBuildProvenance;
export function createPerformanceBuildProvenance(
  revision: PerformanceRevision,
  buildId: string,
  runtimeFingerprint: string,
): PerformanceBuildProvenance;
export function performanceRuntimeFingerprint(options?: { readonly cwd?: string }): string;
export function readPerformanceBuildProvenance(options?: {
  readonly cwd?: string;
  readonly revision?: PerformanceRevision;
}): PerformanceBuildProvenance;
