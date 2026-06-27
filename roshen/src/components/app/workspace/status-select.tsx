"use client";

import { useRef } from "react";

type Opt = { value: string; label: string };

/** Inline status changer — auto-submits the setTaskStatus server action on change. */
export function StatusSelect({
  id,
  current,
  options,
  action,
  className = "",
}: {
  id: string;
  current: string;
  options: Opt[];
  action: (fd: FormData) => Promise<void>;
  className?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} className="inline-block">
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={current}
        onChange={() => ref.current?.requestSubmit()}
        className={"rounded-lg border border-line bg-white px-2 py-1 text-xs font-medium text-ink outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15 " + className}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </form>
  );
}
