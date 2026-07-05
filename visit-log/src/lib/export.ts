import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import { categoryLabel, visitStatusLabel, visitTypeLabel } from '@/lib/constants'
import { downloadBlob, formatDate, formatTime, googleMapsUrl, slugify } from '@/lib/utils'
import type { Customer, VisitWithMeta } from '@/types'

type Row = Record<string, string | number>

function visitsToRows(visits: VisitWithMeta[]): Row[] {
  return visits.map((visit) => ({
    Date: formatDate(visit.visited_at),
    Time: formatTime(visit.visited_at),
    Customer: visit.customer?.name ?? '—',
    'Customer Code': visit.customer?.code ?? '',
    City: visit.customer?.city ?? '',
    'Visit Type': visitTypeLabel(visit.visit_type),
    Status: visitStatusLabel(visit.status),
    Photos: visit.photos.length,
    Notes: visit.notes ?? '',
    'Google Maps':
      visit.latitude != null && visit.longitude != null
        ? googleMapsUrl(visit.latitude, visit.longitude)
        : '',
  }))
}

function customersToRows(customers: Customer[]): Row[] {
  return customers.map((c) => ({
    Name: c.name,
    Category: categoryLabel(c),
    Code: c.code ?? '',
    City: c.city ?? '',
    Area: c.area ?? '',
    Address: c.address ?? '',
    Phone: c.phone ?? '',
    Notes: c.notes ?? '',
    Latitude: c.latitude ?? '',
    Longitude: c.longitude ?? '',
  }))
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (value: string | number) => {
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [headers.join(','), ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))]
  return '\ufeff' + lines.join('\r\n')
}

function downloadCsv(rows: Row[], filename: string) {
  downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename)
}

function downloadExcel(rows: Row[], sheetName: string, filename: string) {
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, sheetName)
  const buffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  )
}

const stamp = () => format(new Date(), 'yyyy-MM-dd')

export function exportVisitsCsv(visits: VisitWithMeta[], name = 'visits') {
  downloadCsv(visitsToRows(visits), `${name}-${stamp()}.csv`)
}

export function exportVisitsExcel(visits: VisitWithMeta[], name = 'visits') {
  downloadExcel(visitsToRows(visits), 'Visits', `${name}-${stamp()}.xlsx`)
}

export function exportCustomersCsv(customers: Customer[]) {
  downloadCsv(customersToRows(customers), `customers-${stamp()}.csv`)
}

export function exportCustomersExcel(customers: Customer[]) {
  downloadExcel(customersToRows(customers), 'Customers', `customers-${stamp()}.xlsx`)
}

const ROSHEN_RED: [number, number, number] = [227, 6, 19]

export function exportCustomerHistoryPdf(customer: Customer, visits: VisitWithMeta[]) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFillColor(...ROSHEN_RED)
  doc.rect(0, 0, pageWidth, 92, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('Roshen Visit Log', 40, 40)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text('Customer Visit History', 40, 60)
  doc.setFontSize(10)
  doc.text(`Generated ${format(new Date(), 'd MMMM yyyy, HH:mm')}`, pageWidth - 40, 40, {
    align: 'right',
  })

  doc.setTextColor(20, 20, 25)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(customer.name, 40, 124)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(110, 110, 120)
  const details = [
    customer.code ? `Code: ${customer.code}` : null,
    [customer.city, customer.area].filter(Boolean).join(' · ') || null,
    customer.address,
    customer.phone,
  ].filter(Boolean) as string[]
  details.forEach((line, index) => doc.text(line, 40, 142 + index * 14))

  const totalPhotos = visits.reduce((sum, v) => sum + v.photos.length, 0)
  doc.setTextColor(20, 20, 25)
  doc.text(`${visits.length} visits · ${totalPhotos} photos`, pageWidth - 40, 124, {
    align: 'right',
  })

  autoTable(doc, {
    startY: 150 + details.length * 14,
    head: [['Date', 'Time', 'Visit Type', 'Status', 'Photos', 'Notes']],
    body: visits.map((visit) => [
      formatDate(visit.visited_at),
      formatTime(visit.visited_at),
      visitTypeLabel(visit.visit_type),
      visitStatusLabel(visit.status),
      String(visit.photos.length),
      visit.notes ?? '',
    ]),
    styles: { fontSize: 9, cellPadding: 6, textColor: [40, 40, 48] },
    headStyles: { fillColor: ROSHEN_RED, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: { 5: { cellWidth: 170 } },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight()
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 158)
      doc.text(
        `Page ${doc.getNumberOfPages()}`,
        pageWidth / 2,
        pageHeight - 20,
        { align: 'center' },
      )
    },
  })

  doc.save(`${slugify(customer.name) || 'customer'}-visits-${stamp()}.pdf`)
}
