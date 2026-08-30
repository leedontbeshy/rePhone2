interface CenteredScrollOffsetInput {
  readonly currentOffset: number;
  readonly scrollSize: number;
  readonly targetSize: number;
  readonly targetStart: number;
  readonly viewportSize: number;
}

interface VisibleScrollOffsetInput extends CenteredScrollOffsetInput {
  readonly targetEnd: number;
}

export function clampScrollOffset(
  offset: number,
  scrollSize: number,
  viewportSize: number,
): number {
  return Math.max(0, Math.min(offset, Math.max(0, scrollSize - viewportSize)));
}

export function centeredScrollOffset({
  currentOffset,
  scrollSize,
  targetSize,
  targetStart,
  viewportSize,
}: CenteredScrollOffsetInput): number {
  return clampScrollOffset(
    currentOffset + targetStart - (viewportSize - targetSize) / 2,
    scrollSize,
    viewportSize,
  );
}

export function scrollOffsetForVisibleTarget({
  currentOffset,
  scrollSize,
  targetEnd,
  targetSize,
  targetStart,
  viewportSize,
}: VisibleScrollOffsetInput): number {
  if (targetStart >= 0 && targetEnd <= viewportSize) {
    return clampScrollOffset(currentOffset, scrollSize, viewportSize);
  }

  return centeredScrollOffset({
    currentOffset,
    scrollSize,
    targetSize,
    targetStart,
    viewportSize,
  });
}
