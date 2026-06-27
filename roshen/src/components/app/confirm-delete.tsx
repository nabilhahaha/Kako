"use client";

import { Trash2 } from "lucide-react";

/** Admin delete control: a tiny form that confirms before invoking a server action. */
export function ConfirmDelete({
  action,
  id,
  message = "Delete this entry? This cannot be undone.",
}: {
  action: (fd: FormData) => Promise<void>;
  id: string;
  message?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        aria-label="Delete"
        className="rounded-lg p-1.5 text-muted hover:bg-roshen-red/10 hover:text-roshen-red"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  );
}
