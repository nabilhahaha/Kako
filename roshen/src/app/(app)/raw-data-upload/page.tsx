import Link from "next/link";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { Uploader } from "@/components/app/import/uploader";
import { Stepper } from "@/components/app/import/stepper";
import { Card } from "@/components/ui/card";
import { Eye, ArrowRight } from "lucide-react";

export default async function RawDataUploadPage() {
  const { profile } = await requireProfile();
  const isAdmin = isAdminRole(profile!.role);
  const supabase = await createClient();

  const { data: dists } = await supabase
    .from("agent")
    .select("id,name,code,city:city_id(name)")
    .eq("type", "distributor")
    .eq("is_active", true)
    .order("name");
  const distributors = (dists ?? []).map((d) => {
    const city = (Array.isArray(d.city) ? d.city[0] : d.city) as { name?: string } | null;
    return { value: d.id, label: `${d.name} (${d.code})${city?.name ? ` — ${city.name}` : ""}` };
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">Raw Data Upload</h1>
        <p className="text-sm text-muted">
          Upload a distributor’s sales file, map its columns, validate, and import.
        </p>
      </div>
      <Stepper current="Upload" />

      {isAdmin ? (
        <Uploader distributors={distributors} />
      ) : (
        <Card className="p-6">
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
            <Eye className="h-4 w-4" /> Importing raw data is an Admin task.
          </p>
          <p className="mt-2 text-sm text-muted">
            You can review imported batches and their status in Import Batches.
          </p>
          <Link
            href="/import-batches"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2 text-sm font-medium text-burgundy hover:bg-burgundy-soft"
          >
            Go to Import Batches <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      )}
    </div>
  );
}
