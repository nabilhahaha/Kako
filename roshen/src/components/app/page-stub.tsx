import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";

export function PageStub({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">
          {title}
        </h1>
        <span className="rounded-full bg-gold-soft/50 px-2.5 py-0.5 text-xs font-medium text-chocolate">
          Coming soon
        </span>
      </div>
      <Card className="p-6">
        <p className="text-sm text-muted">
          {note ?? "This screen is part of the MVP build and lands in an upcoming step."}
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-medium text-burgundy hover:bg-burgundy-soft"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Link>
      </Card>
    </div>
  );
}
