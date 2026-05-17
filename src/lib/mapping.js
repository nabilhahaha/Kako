// Convert a Supabase row (snake_case) into the camelCase shape the UI components
// already expect. This is the single boundary between DB and view.

export const fromDb = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    salesmanId: row.salesman_id,
    salesmanName: row.salesman_name,
    custAccount: row.cust_account,
    custName: row.cust_name,
    itemId: row.item_id,
    itemDesc: row.item_desc,
    netQty: Number(row.net_qty),
    physQty: Number(row.phys_qty),
    expiryDate: row.expiry_date,
    daysRemaining: row.days_remaining,
    salesmanSuggestion: row.salesman_suggestion,
    salesmanNotes: row.salesman_notes || '',
    photoExpiryPath: row.photo_expiry_path,
    photoQtyPath: row.photo_qty_path,
    status: row.status,
    tmId: row.tm_id,
    tmDecision: row.tm_decision,
    tmNotes: row.tm_notes || '',
    tmDecisionDate: row.tm_decision_date,
    rmId: row.rm_id,
    roshenDecision: row.rm_decision,
    roshenNotes: row.rm_notes || '',
    roshenDecisionDate: row.rm_decision_date,
    editHistory: Array.isArray(row.edit_history) ? row.edit_history : [],
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
};
