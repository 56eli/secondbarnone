/** Return the visual status band for a resource percentage. */
export function resourceBarClass(value, max) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return percent < 25
    ? 'bar-critical'
    : percent < 50
      ? 'bar-warning'
      : percent < 75
        ? 'bar-fair'
        : 'bar-full';
}
