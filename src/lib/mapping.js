// DB rows (snake_case) → UI shape (camelCase). Single boundary between DB and
// the view layer.

export const visitFromDb = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    salesmanId: row.salesman_id,
    salesmanName: row.salesman_name,
    custAccount: row.cust_account,
    custName: row.cust_name,
    visitDate: row.visit_date,
    status: row.status,
    visitType: row.visit_type || 'customer',
    notes: row.notes || '',
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const damageRequestFromDb = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    salesmanId: row.salesman_id,
    salesmanName: row.salesman_name,
    sourceType: row.source_type,             // 'van' | 'customer'
    custAccount: row.cust_account || null,
    custName: row.cust_name || null,
    status: row.status,                      // 'submitted' | 'tm_approved' | 'tm_rejected'
    tmComment: row.tm_comment || '',
    tmDecidedAt: row.tm_decided_at,
    tmDecidedBy: row.tm_decided_by,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const damageItemFromDb = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    damageRequestId: row.damage_request_id,
    itemNumber: row.item_number,
    itemName: row.item_name,
    quantity: Number(row.quantity),
    unit: row.unit || '',
    photoUrl: row.photo_url || null,
    notes: row.notes || '',
    createdAt: row.created_at,
  };
};

export const visitItemFromDb = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    visitId: row.visit_id,
    itemId: row.item_id,
    itemDesc: row.item_desc,
    netQty: Number(row.net_qty),
    physQty: Number(row.phys_qty),
    expiryDate: row.expiry_date,
    daysRemaining: row.days_remaining,
    photoExpiryPath: row.photo_expiry_path,
    photoQtyPath: row.photo_qty_path,
    salesmanSuggestion: row.salesman_suggestion,
    salesmanNotes: row.salesman_notes || '',
    tmId: row.tm_id,
    tmDecision: row.tm_decision,
    tmNotes: row.tm_notes || '',
    tmDecisionDate: row.tm_decision_date,
    rmId: row.rm_id,
    roshenDecision: row.rm_decision,
    roshenNotes: row.rm_notes || '',
    roshenDecisionDate: row.rm_decision_date,
    itemStatus: row.item_status,
    editHistory: Array.isArray(row.edit_history) ? row.edit_history : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};
