// PDF Report Generator for Roshen Field Intelligence Platform
// Uses browser's built-in print capabilities to generate PDF reports

export interface VisitReportData {
  visit: {
    id: string;
    customerName: string;
    customerCode: string;
    visitType: string;
    visitedAt: string;
    latitude: number | null;
    longitude: number | null;
    notes: string | null;
    status: string | null;
  };
  photos: string[];
  competitorReports: Array<{
    competitorName: string;
    products: string | null;
    promotions: string | null;
    pricing: string | null;
    notes: string | null;
    photos: string[];
  }>;
  issues: Array<{
    type: string;
    description: string;
    severity: string;
  }>;
  actionPlans: Array<{
    description: string;
    responsiblePerson: string | null;
    dueDate: string | null;
    priority: string;
    status: string;
  }>;
}

export interface DailyReportData {
  date: string;
  userName: string;
  totalVisits: number;
  validVisits: number;
  outOfRangeVisits: number;
  visits: VisitReportData[];
}

// --- Shared CSS ---

const BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    direction: rtl;
    text-align: right;
    color: #1f2937;
    background: #fff;
    font-size: 14px;
    line-height: 1.6;
  }

  .header {
    background: linear-gradient(135deg, #DC2626 0%, #991b1b 100%);
    color: #fff;
    padding: 24px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .header-title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .header-subtitle {
    font-size: 13px;
    color: #fecaca;
    margin-top: 4px;
  }
  .header-date {
    font-size: 13px;
    color: #D4A017;
    font-weight: 600;
    text-align: left;
  }
  .header-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #D4A017;
    font-weight: 700;
    font-size: 16px;
  }

  .content { padding: 24px 32px; }

  .section {
    margin-bottom: 24px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
  }
  .section-header {
    background: #f9fafb;
    padding: 12px 16px;
    font-weight: 700;
    font-size: 15px;
    border-bottom: 1px solid #e5e7eb;
    color: #DC2626;
  }
  .section-body { padding: 16px; }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 24px;
  }
  .info-item label {
    display: block;
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 2px;
  }
  .info-item span {
    font-weight: 600;
    color: #111827;
  }

  .badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }
  .badge-high { background: #fef2f2; color: #DC2626; border: 1px solid #fecaca; }
  .badge-medium { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
  .badge-low { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
  .badge-critical { background: #450a0a; color: #fecaca; }
  .badge-open { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
  .badge-completed { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
  .badge-in_progress { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }

  .photos-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-top: 8px;
  }
  .photos-grid img {
    width: 100%;
    height: 150px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    background: #f9fafb;
    padding: 10px 12px;
    text-align: right;
    font-weight: 600;
    color: #374151;
    border-bottom: 2px solid #e5e7eb;
  }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid #f3f4f6;
  }
  tr:hover td { background: #fafafa; }

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }
  .summary-card {
    padding: 16px;
    border-radius: 8px;
    text-align: center;
  }
  .summary-card .value {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .summary-card .label {
    font-size: 12px;
    color: #6b7280;
  }
  .card-red { background: #fef2f2; border: 1px solid #fecaca; }
  .card-red .value { color: #DC2626; }
  .card-green { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .card-green .value { color: #16a34a; }
  .card-gold { background: #fffbeb; border: 1px solid #fde68a; }
  .card-gold .value { color: #D4A017; }

  .notes-box {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 12px 16px;
    margin-top: 8px;
    white-space: pre-wrap;
  }

  .footer {
    text-align: center;
    padding: 16px 32px;
    font-size: 11px;
    color: #9ca3af;
    border-top: 1px solid #e5e7eb;
  }

  .page-break { page-break-before: always; }

  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .header { background: linear-gradient(135deg, #DC2626 0%, #991b1b 100%) !important; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
    .section { break-inside: avoid; }
  }
`;

// --- Utility helpers ---

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function formatDateShort(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function visitTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    office: 'مكتبية',
    branch: 'فرع',
    cashvan: 'كاش فان',
  };
  return labels[type] ?? type;
}

function statusLabel(status: string | null): string {
  if (!status) return 'غير محدد';
  const labels: Record<string, string> = {
    completed: 'مكتملة',
    pending: 'معلقة',
    cancelled: 'ملغاة',
    in_progress: 'قيد التنفيذ',
  };
  return labels[status] ?? status;
}

function severityBadge(severity: string): string {
  const cls: Record<string, string> = {
    high: 'badge-high',
    medium: 'badge-medium',
    low: 'badge-low',
    critical: 'badge-critical',
  };
  const labels: Record<string, string> = {
    high: 'عالية',
    medium: 'متوسطة',
    low: 'منخفضة',
    critical: 'حرجة',
  };
  return `<span class="badge ${cls[severity] ?? 'badge-medium'}">${labels[severity] ?? severity}</span>`;
}

function priorityBadge(priority: string): string {
  return severityBadge(priority);
}

function statusBadgeAction(status: string): string {
  const cls: Record<string, string> = {
    open: 'badge-open',
    in_progress: 'badge-in_progress',
    completed: 'badge-completed',
    cancelled: 'badge-low',
  };
  const labels: Record<string, string> = {
    open: 'مفتوح',
    in_progress: 'قيد التنفيذ',
    completed: 'مكتمل',
    cancelled: 'ملغى',
  };
  return `<span class="badge ${cls[status] ?? 'badge-open'}">${labels[status] ?? status}</span>`;
}

function issueTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    pricing: 'تسعير',
    display: 'عرض',
    visibility: 'رؤية',
    distribution: 'توزيع',
    other: 'أخرى',
  };
  return labels[type] ?? type;
}

// --- Section renderers ---

function renderVisitInfo(visit: VisitReportData['visit']): string {
  return `
    <div class="section">
      <div class="section-header">معلومات الزيارة</div>
      <div class="section-body">
        <div class="info-grid">
          <div class="info-item">
            <label>اسم العميل</label>
            <span>${visit.customerName}</span>
          </div>
          <div class="info-item">
            <label>رمز العميل</label>
            <span>${visit.customerCode}</span>
          </div>
          <div class="info-item">
            <label>نوع الزيارة</label>
            <span>${visitTypeLabel(visit.visitType)}</span>
          </div>
          <div class="info-item">
            <label>تاريخ الزيارة</label>
            <span>${formatDate(visit.visitedAt)}</span>
          </div>
          <div class="info-item">
            <label>الحالة</label>
            <span>${statusLabel(visit.status)}</span>
          </div>
          <div class="info-item">
            <label>الموقع</label>
            <span>${
              visit.latitude && visit.longitude
                ? `${visit.latitude.toFixed(6)}, ${visit.longitude.toFixed(6)}`
                : 'غير متوفر'
            }</span>
          </div>
        </div>
        ${
          visit.notes
            ? `<div style="margin-top: 16px;">
                <label style="font-size: 12px; color: #6b7280;">ملاحظات</label>
                <div class="notes-box">${visit.notes}</div>
              </div>`
            : ''
        }
      </div>
    </div>
  `;
}

function renderPhotos(photos: string[], title = 'صور الزيارة'): string {
  if (photos.length === 0) return '';
  return `
    <div class="section">
      <div class="section-header">${title}</div>
      <div class="section-body">
        <div class="photos-grid">
          ${photos.map((url) => `<img src="${url}" alt="صورة" />`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderCompetitorReports(
  reports: VisitReportData['competitorReports'],
): string {
  if (reports.length === 0) return '';
  return `
    <div class="section">
      <div class="section-header">تقارير المنافسين</div>
      <div class="section-body">
        ${reports
          .map(
            (r) => `
          <div style="margin-bottom: 16px; padding: 12px; background: #fafafa; border-radius: 6px; border: 1px solid #f3f4f6;">
            <h4 style="font-size: 15px; font-weight: 700; color: #DC2626; margin-bottom: 8px;">${r.competitorName}</h4>
            <div class="info-grid">
              ${r.products ? `<div class="info-item"><label>المنتجات</label><span>${r.products}</span></div>` : ''}
              ${r.promotions ? `<div class="info-item"><label>العروض</label><span>${r.promotions}</span></div>` : ''}
              ${r.pricing ? `<div class="info-item"><label>التسعير</label><span>${r.pricing}</span></div>` : ''}
            </div>
            ${r.notes ? `<div style="margin-top: 8px;"><label style="font-size: 12px; color: #6b7280;">ملاحظات</label><div class="notes-box">${r.notes}</div></div>` : ''}
            ${r.photos.length > 0 ? `<div class="photos-grid" style="margin-top: 8px;">${r.photos.map((url) => `<img src="${url}" alt="صورة منافس" />`).join('')}</div>` : ''}
          </div>
        `,
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderIssues(issues: VisitReportData['issues']): string {
  if (issues.length === 0) return '';
  return `
    <div class="section">
      <div class="section-header">المشكلات المبلغ عنها</div>
      <div class="section-body">
        <table>
          <thead>
            <tr>
              <th>النوع</th>
              <th>الوصف</th>
              <th>الخطورة</th>
            </tr>
          </thead>
          <tbody>
            ${issues
              .map(
                (issue) => `
              <tr>
                <td>${issueTypeLabel(issue.type)}</td>
                <td>${issue.description}</td>
                <td>${severityBadge(issue.severity)}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderActionPlans(plans: VisitReportData['actionPlans']): string {
  if (plans.length === 0) return '';
  return `
    <div class="section">
      <div class="section-header">خطط العمل</div>
      <div class="section-body">
        <table>
          <thead>
            <tr>
              <th>الوصف</th>
              <th>المسؤول</th>
              <th>تاريخ الاستحقاق</th>
              <th>الأولوية</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${plans
              .map(
                (plan) => `
              <tr>
                <td>${plan.description}</td>
                <td>${plan.responsiblePerson ?? 'غير محدد'}</td>
                <td>${plan.dueDate ? formatDateShort(plan.dueDate) : 'غير محدد'}</td>
                <td>${priorityBadge(plan.priority)}</td>
                <td>${statusBadgeAction(plan.status)}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// --- Main generators ---

function buildHeader(title: string, subtitle: string, date: string): string {
  return `
    <div class="header">
      <div>
        <div class="header-title">${title}</div>
        <div class="header-subtitle">${subtitle}</div>
      </div>
      <div style="text-align: left;">
        <div class="header-logo">Roshen Field Intelligence</div>
        <div class="header-date">${date}</div>
      </div>
    </div>
  `;
}

function buildFooter(): string {
  return `
    <div class="footer">
      Roshen Field Intelligence Platform &mdash; تقرير آلي &mdash; ${formatDateShort(new Date().toISOString())}
    </div>
  `;
}

function openPrintWindow(html: string): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لتنزيل التقرير');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for images to load before triggering print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
}

export function generateVisitPDF(data: VisitReportData): void {
  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>تقرير زيارة - ${data.visit.customerName}</title>
      <style>${BASE_STYLES}</style>
    </head>
    <body>
      ${buildHeader(
        'تقرير زيارة ميدانية',
        `${data.visit.customerName} (${data.visit.customerCode})`,
        formatDate(data.visit.visitedAt),
      )}

      <div class="content">
        ${renderVisitInfo(data.visit)}
        ${renderPhotos(data.photos)}
        ${renderCompetitorReports(data.competitorReports)}
        ${renderIssues(data.issues)}
        ${renderActionPlans(data.actionPlans)}
      </div>

      ${buildFooter()}
    </body>
    </html>
  `;

  openPrintWindow(html);
}

export function generateDailyReportPDF(data: DailyReportData): void {
  const visitSections = data.visits
    .map(
      (v, idx) => `
      ${idx > 0 ? '<div class="page-break"></div>' : ''}
      <div style="margin-top: ${idx === 0 ? '0' : '0'};">
        <h2 style="font-size: 18px; font-weight: 700; color: #DC2626; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #fecaca;">
          زيارة ${idx + 1}: ${v.visit.customerName} (${v.visit.customerCode})
        </h2>
        ${renderVisitInfo(v.visit)}
        ${renderPhotos(v.photos)}
        ${renderCompetitorReports(v.competitorReports)}
        ${renderIssues(v.issues)}
        ${renderActionPlans(v.actionPlans)}
      </div>
    `,
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>التقرير اليومي - ${data.date}</title>
      <style>${BASE_STYLES}</style>
    </head>
    <body>
      ${buildHeader(
        'التقرير اليومي الميداني',
        `المندوب: ${data.userName}`,
        formatDateShort(data.date),
      )}

      <div class="content">
        <!-- Executive Summary -->
        <div class="section" style="margin-bottom: 32px;">
          <div class="section-header">الملخص التنفيذي</div>
          <div class="section-body">
            <div class="summary-cards">
              <div class="summary-card card-red">
                <div class="value">${data.totalVisits}</div>
                <div class="label">إجمالي الزيارات</div>
              </div>
              <div class="summary-card card-green">
                <div class="value">${data.validVisits}</div>
                <div class="label">زيارات صالحة</div>
              </div>
              <div class="summary-card card-gold">
                <div class="value">${data.outOfRangeVisits}</div>
                <div class="label">زيارات خارج النطاق</div>
              </div>
            </div>
            <div class="info-grid">
              <div class="info-item">
                <label>التاريخ</label>
                <span>${formatDateShort(data.date)}</span>
              </div>
              <div class="info-item">
                <label>المندوب</label>
                <span>${data.userName}</span>
              </div>
              <div class="info-item">
                <label>نسبة الزيارات الصالحة</label>
                <span>${data.totalVisits > 0 ? Math.round((data.validVisits / data.totalVisits) * 100) : 0}%</span>
              </div>
              <div class="info-item">
                <label>عدد تقارير المنافسين</label>
                <span>${data.visits.reduce((sum, v) => sum + v.competitorReports.length, 0)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Visit Details -->
        ${visitSections}
      </div>

      ${buildFooter()}
    </body>
    </html>
  `;

  openPrintWindow(html);
}
