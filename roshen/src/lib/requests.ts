"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { requireProfile } from "@/lib/auth";
import { RECEIPT_REQUIRED } from "@/lib/req-meta";

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (fd: FormData, k: string) => {
  const v = fd.get(k);
  if (v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function ctx() {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();
  return { supabase, userId: user.id, companyId: profile!.company_id!, role: profile!.role as string };
}

type SB = Awaited<ReturnType<typeof createClient>>;

/** Approver routing: area_manager→company_manager, company_manager→admin, admin→company_manager. */
async function resolveApprover(supabase: SB, companyId: string, requesterRole: string, requesterId: string): Promise<string | null> {
  const target = requesterRole === "area_manager" ? "company_manager" : requesterRole === "company_manager" ? "admin" : "company_manager";
  const { data } = await supabase
    .from("profile")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", target as never)
    .neq("id", requesterId)
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

async function notify(
  supabase: SB,
  recipients: (string | null | undefined)[],
  actorId: string,
  type: string,
  title: string,
  message: string,
  requestId: string,
) {
  const seen = new Set<string>();
  for (const r of recipients) {
    if (!r || r === actorId || seen.has(r)) continue;
    seen.add(r);
    await supabase.rpc("enqueue_notification", {
      p_user_id: r,
      p_type: type as never,
      p_title: title,
      p_message: message,
      p_task_id: null as never,
      p_action_url: `/requests/${requestId}`,
    });
  }
}

/** Recompute and persist the request total from its expense lines. */
async function recomputeTotal(supabase: SB, requestId: string) {
  const { data } = await supabase.from("expense_line").select("amount").eq("request_id", requestId);
  const total = (data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  await supabase.from("request").update({ total_amount: total, updated_at: new Date().toISOString() }).eq("id", requestId);
  return total;
}

/** Create an expense request draft and redirect to its detail page. */
export async function createExpenseDraft(fd: FormData) {
  const { supabase, userId, companyId, role } = await ctx();
  const title = str(fd, "title") ?? "Expense request";
  const approver = await resolveApprover(supabase, companyId, role, userId);
  const { data, error } = await supabase
    .from("request")
    .insert({
      company_id: companyId,
      request_type: "expense",
      title,
      requested_by: userId,
      assigned_approver: approver,
      status: "draft",
      currency: str(fd, "currency") ?? "SAR",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = data!.id as string;
  await supabase.from("request_activity").insert({ request_id: id, actor_id: userId, type: "created" });
  revalidatePath("/requests");
  redirect(`/requests/${id}`);
}

export async function addExpenseLine(fd: FormData) {
  const { supabase, userId } = await ctx();
  const requestId = str(fd, "request_id");
  if (!requestId) return;
  await assertDraftOwned(supabase, requestId, userId);
  const category = str(fd, "category") ?? "other";
  const { error } = await supabase.from("expense_line").insert({
    request_id: requestId,
    category: category as never,
    expense_date: str(fd, "expense_date"),
    amount: num(fd, "amount") ?? 0,
    currency: str(fd, "currency") ?? "SAR",
    description: str(fd, "description"),
    merchant: str(fd, "merchant"),
    vat_amount: num(fd, "vat_amount"),
    payment_method: str(fd, "payment_method"),
    receipt_required: RECEIPT_REQUIRED.has(category),
  });
  if (error) throw new Error(error.message);
  await recomputeTotal(supabase, requestId);
  revalidatePath(`/requests/${requestId}`);
}

export async function deleteExpenseLine(fd: FormData) {
  const { supabase, userId } = await ctx();
  const id = str(fd, "id");
  const requestId = str(fd, "request_id");
  if (!id || !requestId) return;
  await assertDraftOwned(supabase, requestId, userId);
  // Remove any receipts attached to this line from Storage first.
  const { data: atts } = await supabase.from("request_attachment").select("storage_path").eq("expense_line_id", id);
  const paths = (atts ?? []).map((a) => a.storage_path as string).filter(Boolean);
  if (paths.length) await supabase.storage.from("request-receipts").remove(paths);
  await supabase.from("expense_line").delete().eq("id", id);
  await recomputeTotal(supabase, requestId);
  revalidatePath(`/requests/${requestId}`);
}

/** Guard: only the requester may edit lines, and only while the request is a draft. */
async function assertDraftOwned(supabase: SB, requestId: string, userId: string) {
  const { data } = await supabase.from("request").select("status,requested_by").eq("id", requestId).maybeSingle();
  if (!data) throw new Error("Request not found.");
  if (data.requested_by !== userId) throw new Error("Only the requester can edit this request.");
  if (data.status !== "draft") throw new Error("This request can no longer be edited.");
}

export async function submitRequest(fd: FormData) {
  const { supabase, userId } = await ctx();
  const id = str(fd, "id");
  if (!id) return;
  const { data: req } = await supabase
    .from("request")
    .select("status,requested_by,assigned_approver,title,company_id")
    .eq("id", id)
    .maybeSingle();
  if (!req) throw new Error("Request not found.");
  if (req.requested_by !== userId) throw new Error("Only the requester can submit this request.");
  if (req.status !== "draft") throw new Error("This request has already been submitted.");

  let approver = req.assigned_approver as string | null;
  if (!approver) {
    const { role } = await ctx();
    approver = await resolveApprover(supabase, req.company_id as string, role, userId);
  }
  const { error } = await supabase
    .from("request")
    .update({ status: "pending_approval", assigned_approver: approver, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("request_approval").insert({ request_id: id, actor_id: userId, action: "submitted", from_status: "draft", to_status: "pending_approval" });
  await supabase.from("request_activity").insert({ request_id: id, actor_id: userId, type: "submitted" });
  await notify(supabase, [approver], userId, "approval_required", "Approval required", req.title as string, id);
  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
}

/** Approver decision: approve | reject | return. */
export async function decideRequest(fd: FormData) {
  const { supabase, userId } = await ctx();
  const id = str(fd, "id");
  const action = str(fd, "action");
  const comment = str(fd, "comment");
  if (!id || !action) return;
  const { data: req } = await supabase
    .from("request")
    .select("status,requested_by,assigned_approver,title")
    .eq("id", id)
    .maybeSingle();
  if (!req) throw new Error("Request not found.");
  if (req.assigned_approver !== userId) throw new Error("Only the assigned approver can act on this request.");
  if (!["submitted", "pending_approval"].includes(String(req.status))) throw new Error("This request is not awaiting approval.");

  const map: Record<string, { to: string; notif: string; label: string }> = {
    approve: { to: "approved", notif: "request_approved", label: "Request approved" },
    reject: { to: "rejected", notif: "request_rejected", label: "Request rejected" },
    return: { to: "draft", notif: "request_returned", label: "Request returned for correction" },
  };
  const m = map[action];
  if (!m) throw new Error("Unknown action.");

  const { error } = await supabase
    .from("request")
    .update({ status: m.to as never, decided_by: userId, decided_at: new Date().toISOString(), approval_comment: comment, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("request_approval").insert({ request_id: id, actor_id: userId, action, from_status: req.status as never, to_status: m.to as never, comment });
  await supabase.from("request_activity").insert({ request_id: id, actor_id: userId, type: action, to_value: m.to });
  await notify(supabase, [req.requested_by], userId, m.notif, m.label, req.title as string, id);
  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
}

export async function addRequestAttachment(fd: FormData) {
  const { supabase, userId } = await ctx();
  const requestId = str(fd, "request_id");
  const storagePath = str(fd, "storage_path");
  const filename = str(fd, "filename");
  if (!requestId || !storagePath || !filename) return;
  const { error } = await supabase.from("request_attachment").insert({
    request_id: requestId,
    expense_line_id: str(fd, "expense_line_id"),
    storage_path: storagePath,
    filename,
    mime_type: str(fd, "mime_type"),
    size_bytes: fd.get("size_bytes") ? Number(fd.get("size_bytes")) : null,
    title: str(fd, "title"),
    uploaded_by: userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/requests/${requestId}`);
}

export async function deleteRequestAttachment(fd: FormData) {
  const { supabase } = await ctx();
  const id = str(fd, "id");
  if (!id) return;
  const { data: a } = await supabase.from("request_attachment").select("storage_path,request_id").eq("id", id).maybeSingle();
  if (!a) return;
  if (a.storage_path) await supabase.storage.from("request-receipts").remove([a.storage_path as string]);
  await supabase.from("request_attachment").delete().eq("id", id);
  revalidatePath(`/requests/${a.request_id}`);
}

export async function requestReceiptSignedUrl(path: string): Promise<string | null> {
  const { supabase } = await ctx();
  const { data } = await supabase.storage.from("request-receipts").createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}

export async function deleteRequest(fd: FormData) {
  const { supabase, userId } = await ctx();
  const id = str(fd, "id");
  if (!id) return;
  const { data: req } = await supabase.from("request").select("requested_by,status").eq("id", id).maybeSingle();
  if (!req) return;
  if (req.requested_by !== userId) throw new Error("Only the requester can delete this request.");
  if (req.status !== "draft") throw new Error("Only draft requests can be deleted.");
  const { error } = await supabase.from("request").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/requests");
  redirect("/requests");
}
