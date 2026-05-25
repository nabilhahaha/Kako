import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PptxGenJS from 'pptxgenjs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CampaignExport {
  id: string;
  customerName: string;
  customerAccount: string;
  classification: string;
  spendType: string;
  duration: string;
  items: string[];
  spendAmount: number;
  roshenPct: number;
  roshenShare: number;
  distributorShare: number;
  startDate: string;
  status: string;
  createdBy: string;
  createdAt: string;
  approvedDistributorAt?: string;
  approvedDistributorBy?: string;
  approvedRoshenAt?: string;
  approvedRoshenBy?: string;
  branches: Array<{ name: string; photoUrl?: string }>;
}

export interface ExportData {
  title: string;
  date: string;
  campaigns: CampaignExport[];
}

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const COLORS = {
  maroon: '#7A1D2E',
  gold: '#D4A843',
  white: '#FFFFFF',
  dark: '#1a1a1a',
  muted: '#6b7280',
  lightGray: '#F5F5F5',
  rowAlt: '#F9F5F6',
} as const;

/** Format a number as SAR currency string. */
function fmtSAR(v: number): string {
  return `SAR ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format a percentage (e.g. 65 → "65%"). */
function fmtPct(v: number): string {
  return `${v}%`;
}

/** Return a status color hex string. */
function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'final_approved') return '#16a34a';
  if (s === 'approved_pending_photos') return '#7c3aed';
  if (s === 'photos_submitted') return '#0891b2';
  if (s.includes('approved') || s.includes('complete')) return '#16a34a';
  if (s.includes('pending') || s.includes('waiting')) return '#d97706';
  if (s.includes('rejected') || s.includes('declined')) return '#dc2626';
  if (s.includes('draft')) return '#6b7280';
  return COLORS.dark;
}

/** Trigger a browser download from a Blob. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Build the export filename. */
function buildFilename(data: ExportData, ext: string): string {
  const datePart = data.date.replace(/[/\s]/g, '_');
  if (data.campaigns.length === 1) {
    return `Trade_Spend_Request_${data.campaigns[0].id}_${datePart}.${ext}`;
  }
  return `Trade_Spend_Requests_${datePart}.${ext}`;
}

/** Strip the '#' from a hex color for pptxgenjs. */
function pptColor(hex: string): string {
  return hex.replace('#', '');
}

// ---------------------------------------------------------------------------
// 1. PDF Export
// ---------------------------------------------------------------------------

export function exportToPDF(data: ExportData): void {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentW = pageW - margin * 2;

    let isFirstPage = true;

    // --- Shared page chrome ---

    const addHeader = (): void => {
      doc.setFillColor(COLORS.maroon);
      doc.rect(0, 0, pageW, 18, 'F');

      doc.setTextColor(COLORS.white);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('TRADE SPEND REQUEST', margin, 12);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(data.date, pageW - margin, 12, { align: 'right' });
    }

    const addFooter = (): void => {
      const pageNum = (doc as unknown as { internal: { pages: unknown[] } }).internal.pages.length - 1;
      doc.setFontSize(8);
      doc.setTextColor(COLORS.muted);
      doc.setFont('helvetica', 'normal');
      doc.text(`Page ${pageNum}`, pageW / 2, pageH - 8, { align: 'center' });
    }

    const newPage = (): void => {
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false;
      addHeader();
      addFooter();
    }

    // --- Render each campaign ---

    data.campaigns.forEach((camp) => {
      // ===== PAGE 1: Campaign Summary =====
      newPage();
      let y = 26;

      // Campaign ID title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(COLORS.dark);
      doc.text(camp.id, margin, y);
      y += 4;

      // Gold accent line under title
      doc.setFillColor(COLORS.gold);
      doc.rect(margin, y, 40, 1, 'F');
      y += 8;

      // --- Info Grid (2 columns) ---
      const colLabelW = 45;
      const col2X = margin + contentW / 2;
      const lineH = 7;

      const drawInfoRow = (
        label: string,
        value: string,
        x: number,
        rowY: number,
        valueColor?: string
      ): void => {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(COLORS.muted);
        doc.text(label, x, rowY);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(valueColor || COLORS.dark);
        doc.text(value, x + colLabelW, rowY);
      }

      // Left column rows
      const leftRows: Array<[string, string, string?]> = [
        ['Customer', `${camp.customerName} (${camp.customerAccount})`],
        ['Classification', camp.classification],
        ['Spend Type', camp.spendType],
        ['Duration', camp.duration],
        ['Start Date', camp.startDate],
      ];

      // Right column rows
      const rightRows: Array<[string, string, string?]> = [
        ['Status', camp.status, statusColor(camp.status)],
        ['Created By', camp.createdBy],
        ['Created At', camp.createdAt],
        [
          'Approved (Dist.)',
          camp.approvedDistributorAt
            ? `${camp.approvedDistributorAt}${camp.approvedDistributorBy ? ' by ' + camp.approvedDistributorBy : ''}`
            : '—',
        ],
        [
          'Approved (Roshen)',
          camp.approvedRoshenAt
            ? `${camp.approvedRoshenAt}${camp.approvedRoshenBy ? ' by ' + camp.approvedRoshenBy : ''}`
            : '—',
        ],
      ];

      const maxRows = Math.max(leftRows.length, rightRows.length);
      for (let i = 0; i < maxRows; i++) {
        const rowY = y + i * lineH;
        if (i < leftRows.length) {
          const [label, value, color] = leftRows[i];
          drawInfoRow(label, value, margin, rowY, color);
        }
        if (i < rightRows.length) {
          const [label, value, color] = rightRows[i];
          drawInfoRow(label, value, col2X, rowY, color);
        }
      }

      y += maxRows * lineH + 6;

      // --- Cost Split Section ---
      doc.setFillColor(COLORS.lightGray);
      doc.roundedRect(margin, y, contentW, 28, 2, 2, 'F');

      // Gold accent bar on left
      doc.setFillColor(COLORS.gold);
      doc.rect(margin, y, 2, 28, 'F');

      const splitX = margin + 8;
      const splitY = y + 6;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(COLORS.dark);
      doc.text('Cost Split', splitX, splitY);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(COLORS.dark);

      const distributorPct = 100 - camp.roshenPct;

      doc.setFont('helvetica', 'bold');
      doc.text(`Total: ${fmtSAR(camp.spendAmount)}`, splitX, splitY + 8);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(COLORS.maroon);
      doc.text(
        `Roshen Share (${fmtPct(camp.roshenPct)}): ${fmtSAR(camp.roshenShare)}`,
        splitX,
        splitY + 15
      );

      doc.setTextColor(COLORS.muted);
      doc.text(
        `Distributor Share (${fmtPct(distributorPct)}): ${fmtSAR(camp.distributorShare)}`,
        splitX + contentW / 2 - 8,
        splitY + 15
      );

      y += 36;

      // --- Items Table ---
      if (camp.items.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(COLORS.dark);
        doc.text('Items', margin, y);
        y += 3;

        autoTable(doc, {
          startY: y,
          head: [['#', 'Item Description']],
          body: camp.items.map((item, idx) => [String(idx + 1), item]),
          styles: {
            fontSize: 10,
            cellPadding: 3,
            textColor: COLORS.dark,
          },
          headStyles: {
            fillColor: COLORS.maroon,
            textColor: COLORS.white,
            fontStyle: 'bold',
            fontSize: 10,
          },
          alternateRowStyles: { fillColor: COLORS.rowAlt },
          columnStyles: {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: contentW - 12 },
          },
          margin: { left: margin, right: margin },
        });
      }

      // ===== PAGE 2: Branch Photos (if any) =====
      if (camp.branches.length > 0) {
        newPage();
        let bY = 26;

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(COLORS.dark);
        doc.text('Branch Documentation', margin, bY);
        bY += 2;

        doc.setFillColor(COLORS.gold);
        doc.rect(margin, bY, 50, 1, 'F');
        bY += 6;

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(COLORS.muted);
        doc.text(`Campaign ${camp.id} — ${camp.customerName}`, margin, bY);
        bY += 8;

        // Layout: 2 photos per row
        const photoW = (contentW - 10) / 2;
        const photoH = 70;
        const gapX = 10;
        const gapY = 12;

        camp.branches.forEach((branch, idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);

          const px = margin + col * (photoW + gapX);
          const py = bY + row * (photoH + gapY);

          // Check if we need a new page
          if (py + photoH + 10 > pageH - 20) {
            newPage();
            bY = 26;
            // Recalculate — restart the positioning on the new page
            // We'll just let subsequent branches overflow for simplicity
            // A more robust approach would track position across pages
          }

          // Branch name
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(COLORS.dark);
          doc.text(branch.name, px, py);

          if (branch.photoUrl) {
            try {
              // Determine image format from data URL
              let format: 'JPEG' | 'PNG' = 'JPEG';
              if (branch.photoUrl.includes('image/png')) {
                format = 'PNG';
              }
              doc.addImage(branch.photoUrl, format, px, py + 3, photoW, photoH - 8);
            } catch {
              // Fallback: draw placeholder
              doc.setFillColor(COLORS.lightGray);
              doc.rect(px, py + 3, photoW, photoH - 8, 'F');
              doc.setFontSize(9);
              doc.setTextColor(COLORS.muted);
              doc.setFont('helvetica', 'italic');
              doc.text('Photo could not be loaded', px + photoW / 2, py + photoH / 2, {
                align: 'center',
              });
            }
          } else {
            // No photo placeholder
            doc.setDrawColor(COLORS.muted);
            doc.setFillColor(COLORS.lightGray);
            doc.roundedRect(px, py + 3, photoW, photoH - 8, 1, 1, 'FD');
            doc.setFontSize(9);
            doc.setTextColor(COLORS.muted);
            doc.setFont('helvetica', 'italic');
            doc.text('No photo', px + photoW / 2, py + photoH / 2, { align: 'center' });
          }
        });
      }
    });

    // --- Save ---
    doc.save(buildFilename(data, 'pdf'));
  } catch (err) {
    console.error('PDF export failed:', err);
    alert('Failed to generate PDF document. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// 2. PowerPoint Export
// ---------------------------------------------------------------------------

export function exportToPPTX(data: ExportData): void {
  try {
    const pptx = new PptxGenJS();
    pptx.author = 'Trade Spend Management Platform';
    pptx.subject = 'Trade Spend Request';

    // ---- Slide 1: Title ----
    const slideTitle = pptx.addSlide();
    slideTitle.background = { color: pptColor(COLORS.maroon) };

    slideTitle.addText('Trade Spend Requests', {
      x: 0.8,
      y: 1.5,
      w: 8.4,
      h: 1.5,
      fontSize: 34,
      fontFace: 'Arial',
      color: pptColor(COLORS.white),
      bold: true,
      align: 'center',
    });

    slideTitle.addText(data.date, {
      x: 0.8,
      y: 3.2,
      w: 8.4,
      h: 0.6,
      fontSize: 18,
      fontFace: 'Arial',
      color: pptColor(COLORS.gold),
      align: 'center',
    });

    slideTitle.addText('Confidential', {
      x: 0.8,
      y: 4.5,
      w: 8.4,
      h: 0.4,
      fontSize: 10,
      fontFace: 'Arial',
      color: 'BBBBBB',
      align: 'center',
      italic: true,
    });

    // ---- Per-campaign slides ----
    data.campaigns.forEach((camp) => {
      // === Campaign Details Slide ===
      const slide = pptx.addSlide();

      // Title bar
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 10,
        h: 0.9,
        fill: { color: pptColor(COLORS.maroon) },
      });

      slide.addText(`${camp.id}  —  ${camp.customerName}`, {
        x: 0.5,
        y: 0.1,
        w: 9,
        h: 0.7,
        fontSize: 20,
        fontFace: 'Arial',
        color: pptColor(COLORS.white),
        bold: true,
      });

      // Left side: details table
      const distributorPct = 100 - camp.roshenPct;

      const detailRows: Array<[string, string]> = [
        ['Customer', `${camp.customerName} (${camp.customerAccount})`],
        ['Classification', camp.classification],
        ['Spend Type', camp.spendType],
        ['Duration', camp.duration],
        ['Start Date', camp.startDate],
        ['Amount', fmtSAR(camp.spendAmount)],
        ['Roshen Share', `${fmtPct(camp.roshenPct)} — ${fmtSAR(camp.roshenShare)}`],
        ['Distributor Share', `${fmtPct(distributorPct)} — ${fmtSAR(camp.distributorShare)}`],
        ['Status', camp.status],
        ['Created By', `${camp.createdBy} (${camp.createdAt})`],
        [
          'Approved (Dist.)',
          camp.approvedDistributorAt
            ? `${camp.approvedDistributorAt}${camp.approvedDistributorBy ? ' — ' + camp.approvedDistributorBy : ''}`
            : '—',
        ],
        [
          'Approved (Roshen)',
          camp.approvedRoshenAt
            ? `${camp.approvedRoshenAt}${camp.approvedRoshenBy ? ' — ' + camp.approvedRoshenBy : ''}`
            : '—',
        ],
      ];

      const tableRows: PptxGenJS.TableRow[] = [];

      // Header
      tableRows.push([
        {
          text: 'Field',
          options: {
            fill: { color: pptColor(COLORS.maroon) },
            color: 'FFFFFF',
            bold: true,
            fontSize: 9,
          },
        },
        {
          text: 'Details',
          options: {
            fill: { color: pptColor(COLORS.maroon) },
            color: 'FFFFFF',
            bold: true,
            fontSize: 9,
          },
        },
      ]);

      detailRows.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? 'F9F5F6' : 'FFFFFF';
        const isStatus = row[0] === 'Status';
        const valColor = isStatus ? pptColor(statusColor(row[1])) : '333333';

        tableRows.push([
          {
            text: row[0],
            options: { bold: true, fontSize: 9, fill: { color: bg }, color: pptColor(COLORS.muted) },
          },
          {
            text: row[1],
            options: { fontSize: 9, fill: { color: bg }, color: valColor, bold: isStatus },
          },
        ]);
      });

      slide.addTable(tableRows, {
        x: 0.4,
        y: 1.1,
        w: 5.2,
        colW: [1.6, 3.6],
        fontSize: 9,
        fontFace: 'Arial',
        border: { type: 'solid', pt: 0.5, color: 'DDDDDD' },
      });

      // Right side: items list
      if (camp.items.length > 0) {
        slide.addText('Items', {
          x: 5.9,
          y: 1.1,
          w: 3.8,
          h: 0.4,
          fontSize: 12,
          fontFace: 'Arial',
          color: pptColor(COLORS.maroon),
          bold: true,
        });

        // Gold accent under "Items"
        slide.addShape(pptx.ShapeType.rect, {
          x: 5.9,
          y: 1.5,
          w: 3.8,
          h: 0.03,
          fill: { color: pptColor(COLORS.gold) },
        });

        const itemText = camp.items
          .map((item, idx) => `${idx + 1}. ${item}`)
          .join('\n');

        slide.addText(itemText, {
          x: 5.9,
          y: 1.7,
          w: 3.8,
          h: 3.5,
          fontSize: 9,
          fontFace: 'Arial',
          color: '333333',
          valign: 'top',
          lineSpacingMultiple: 1.3,
        });
      }

      // === Branch Photos Slide (if any) ===
      if (camp.branches.length > 0) {
        const branchSlide = pptx.addSlide();

        // Title bar
        branchSlide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 10,
          h: 0.9,
          fill: { color: pptColor(COLORS.maroon) },
        });

        branchSlide.addText(`Branch Documentation — ${camp.id}`, {
          x: 0.5,
          y: 0.1,
          w: 9,
          h: 0.7,
          fontSize: 20,
          fontFace: 'Arial',
          color: pptColor(COLORS.white),
          bold: true,
        });

        // 2x2 grid
        const gridCols = 2;
        const cellW = 4.2;
        const cellH = 2.5;
        const startX = 0.6;
        const startY = 1.2;
        const gapX = 0.6;
        const gapY = 0.4;

        camp.branches.forEach((branch, idx) => {
          const col = idx % gridCols;
          const row = Math.floor(idx / gridCols);
          const bx = startX + col * (cellW + gapX);
          const by = startY + row * (cellH + gapY);

          if (branch.photoUrl) {
            try {
              branchSlide.addImage({
                data: branch.photoUrl,
                x: bx,
                y: by,
                w: cellW,
                h: cellH - 0.4,
              });
            } catch {
              // Placeholder on error
              branchSlide.addShape(pptx.ShapeType.rect, {
                x: bx,
                y: by,
                w: cellW,
                h: cellH - 0.4,
                fill: { color: 'F0F0F0' },
                line: { color: 'CCCCCC', width: 0.5 },
              });
              branchSlide.addText('Photo unavailable', {
                x: bx,
                y: by,
                w: cellW,
                h: cellH - 0.4,
                fontSize: 9,
                color: '999999',
                align: 'center',
                valign: 'middle',
                italic: true,
              });
            }
          } else {
            branchSlide.addShape(pptx.ShapeType.rect, {
              x: bx,
              y: by,
              w: cellW,
              h: cellH - 0.4,
              fill: { color: 'F0F0F0' },
              line: { color: 'CCCCCC', width: 0.5 },
            });
            branchSlide.addText('No photo', {
              x: bx,
              y: by,
              w: cellW,
              h: cellH - 0.4,
              fontSize: 9,
              color: '999999',
              align: 'center',
              valign: 'middle',
              italic: true,
            });
          }

          // Branch name label
          branchSlide.addText(branch.name, {
            x: bx,
            y: by + cellH - 0.4,
            w: cellW,
            h: 0.35,
            fontSize: 8,
            fontFace: 'Arial',
            color: '333333',
            align: 'center',
            bold: true,
          });
        });
      }
    });

    // ---- Save ----
    pptx.writeFile({ fileName: buildFilename(data, 'pptx') }).catch((err) => {
      console.error('PPTX write failed:', err);
      alert('Failed to generate PowerPoint document. Please try again.');
    });
  } catch (err) {
    console.error('PowerPoint export failed:', err);
    alert('Failed to generate PowerPoint document. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// 3. Excel Export
// ---------------------------------------------------------------------------

export function exportToExcel(data: ExportData): void {
  try {
    const wb = XLSX.utils.book_new();

    const rows = data.campaigns.map((c) => ({
      'Campaign ID': c.id,
      Customer: c.customerName,
      Account: c.customerAccount,
      Classification: c.classification,
      'Spend Type': c.spendType,
      Duration: c.duration,
      Items: c.items.join(', '),
      Amount: c.spendAmount,
      'Roshen %': c.roshenPct,
      'Roshen Share': c.roshenShare,
      'Distributor Share': c.distributorShare,
      'Start Date': c.startDate,
      Status: c.status,
      'Created By': c.createdBy,
      'Created At': c.createdAt,
      'Approved Distributor': c.approvedDistributorAt
        ? `${c.approvedDistributorAt}${c.approvedDistributorBy ? ' — ' + c.approvedDistributorBy : ''}`
        : '',
      'Approved Roshen': c.approvedRoshenAt
        ? `${c.approvedRoshenAt}${c.approvedRoshenBy ? ' — ' + c.approvedRoshenBy : ''}`
        : '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 14 }, // Campaign ID
      { wch: 28 }, // Customer
      { wch: 14 }, // Account
      { wch: 16 }, // Classification
      { wch: 16 }, // Spend Type
      { wch: 12 }, // Duration
      { wch: 40 }, // Items
      { wch: 14 }, // Amount
      { wch: 10 }, // Roshen %
      { wch: 14 }, // Roshen Share
      { wch: 16 }, // Distributor Share
      { wch: 12 }, // Start Date
      { wch: 18 }, // Status
      { wch: 18 }, // Created By
      { wch: 12 }, // Created At
      { wch: 30 }, // Approved Distributor
      { wch: 30 }, // Approved Roshen
    ];

    ws['!autofilter'] = { ref: ws['!ref']! };

    XLSX.utils.book_append_sheet(wb, ws, 'Trade Spend Requests');

    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbOut], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, buildFilename(data, 'xlsx'));
  } catch (err) {
    console.error('Excel export failed:', err);
    alert('Failed to generate Excel document. Please try again.');
  }
}
