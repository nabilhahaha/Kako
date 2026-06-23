// Pure helpers for the FV verification form's pre-submit photo list (take/upload,
// remove, replace). No I/O, no React — so the remove/replace behavior is unit-tested
// independently of the component. These operate on the in-memory File[] BEFORE submit;
// already-submitted attachments are never touched.

/** Remove the file at `index`, preserving order. Out-of-range index → unchanged copy. */
export function removeFileAt(files: File[], index: number): File[] {
  if (index < 0 || index >= files.length) return files.slice();
  return files.filter((_, i) => i !== index);
}

/** Merge newly picked files into the existing list:
 *  - single (multiple=false): REPLACE with the first picked file (take/upload a replacement);
 *  - multiple: APPEND the picked files (add more without removing the others).
 *  Empty pick → unchanged copy. */
export function mergeFiles(existing: File[], incoming: File[], multiple: boolean): File[] {
  if (incoming.length === 0) return existing.slice();
  return multiple ? [...existing, ...incoming] : incoming.slice(0, 1);
}
