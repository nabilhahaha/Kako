// Field Verification — report access + photo helpers (pure, no I/O / no React) so the
// "who may view FV reports" rule and the photo-id collection are unit-tested and reused by
// the report actions + panel.

/** Who may view Field Verification reports (read-only): platform/super, the company admin
 *  role, or any user holding `field_verification.reports` (Supervisor / Viewer-Reporter /
 *  Manager) — or the generic `reports.view`. Row visibility is still company-scoped by RLS;
 *  reps without a report permission keep seeing only their OWN rows. */
export function canViewFvReports(p: {
  isPlatformOwner?: boolean;
  isSuperAdmin?: boolean;
  topRole?: string | null;
  permissions: readonly string[];
}): boolean {
  return (
    !!p.isPlatformOwner ||
    !!p.isSuperAdmin ||
    p.topRole === 'admin' ||
    p.permissions.includes('field_verification.reports') ||
    p.permissions.includes('reports.view')
  );
}

/** Collect the resolvable attachment ids for a verification (outside + inside), dropping
 *  blanks — what the report detail passes to getVerificationPhotos for signed URLs. */
export function verificationPhotoIds(r: { outsidePhotoId?: string | null; insidePhotoIds?: readonly (string | null)[] | null }): string[] {
  return [r.outsidePhotoId, ...(r.insidePhotoIds ?? [])].filter((x): x is string => typeof x === 'string' && x.length > 0);
}
