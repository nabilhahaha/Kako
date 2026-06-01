/** Request & Approval Center messages. Keep ar/en in sync. */
export const ar = {
  requests: {
    title: 'الطلبات والموافقات',
    subtitle: 'صندوق الموافقات، وطلباتي، والسجل',
    tabs: { inbox: 'الموافقات', mine: 'طلباتي', history: 'السجل' },
    status: {
      pending: 'قيد الانتظار',
      approved: 'مقبول',
      rejected: 'مرفوض',
      cancelled: 'ملغي',
      escalated: 'مُصعّد',
    },
    col: {
      request: 'الطلب',
      status: 'الحالة',
      outcome: 'النتيجة',
      started: 'تاريخ الإرسال',
      decided: 'تاريخ القرار',
      step: 'الخطوة',
    },
    mine: { empty: 'لا توجد طلبات بعد' },
    history: { empty: 'لا يوجد سجل بعد' },
  },
};

export const en = {
  requests: {
    title: 'Requests & Approvals',
    subtitle: 'Approvals inbox, my requests, and history',
    tabs: { inbox: 'Approvals', mine: 'My Requests', history: 'History' },
    status: {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
      escalated: 'Escalated',
    },
    col: {
      request: 'Request',
      status: 'Status',
      outcome: 'Outcome',
      started: 'Submitted',
      decided: 'Decided',
      step: 'Step',
    },
    mine: { empty: 'No requests yet' },
    history: { empty: 'No history yet' },
  },
};
