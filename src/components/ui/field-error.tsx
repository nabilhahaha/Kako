/** Inline validation message shown under a form field. Renders nothing when
 *  there's no error, so callers can pass `errors.fieldName` directly. */
export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-destructive">{children}</p>;
}
