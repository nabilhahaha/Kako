import { Card } from "@/components/ui/card";

export function PageStub({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">
        {title}
      </h1>
      <Card className="p-6">
        <p className="text-sm text-muted">
          {note ?? "This screen is part of the MVP build and lands in an upcoming step."}
        </p>
      </Card>
    </div>
  );
}
