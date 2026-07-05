import * as XLSX from 'xlsx'
import type { CustomerInput } from '@/types'

// Only the columns that come from a spreadsheet; category is set separately.
const HEADER_SYNONYMS: Partial<Record<keyof CustomerInput, string[]>> = {
  name: ['name', 'customername', 'customer', 'storename', 'store', 'shop', 'shopname'],
  code: ['code', 'customercode', 'customerid', 'storecode', 'accountcode'],
  city: ['city', 'town'],
  area: ['area', 'district', 'region', 'zone', 'neighborhood'],
  address: ['address', 'street', 'location', 'fulladdress'],
  phone: ['phone', 'mobile', 'tel', 'telephone', 'phonenumber', 'mobilenumber', 'contact'],
  notes: ['notes', 'note', 'comment', 'comments', 'remark', 'remarks'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'lon', 'long'],
}

const normalize = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '')

export interface ImportPreview {
  rows: CustomerInput[]
  skipped: number
  mappedColumns: string[]
}

/** Parses an .xlsx/.xls/.csv file into customer rows using flexible header matching. */
export async function parseCustomerFile(file: File): Promise<ImportPreview> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return { rows: [], skipped: 0, mappedColumns: [] }
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  const fieldForHeader = new Map<string, keyof CustomerInput>()
  const mappedColumns: string[] = []
  if (raw.length > 0) {
    for (const header of Object.keys(raw[0])) {
      const key = normalize(header)
      for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
        if (synonyms.includes(key) && ![...fieldForHeader.values()].includes(field as keyof CustomerInput)) {
          fieldForHeader.set(header, field as keyof CustomerInput)
          mappedColumns.push(header)
          break
        }
      }
    }
  }

  const rows: CustomerInput[] = []
  let skipped = 0
  for (const rawRow of raw) {
    const row: Record<string, string | number | null> = {}
    for (const [header, field] of fieldForHeader) {
      const value = rawRow[header]
      if (field === 'latitude' || field === 'longitude') {
        const num = typeof value === 'number' ? value : parseFloat(String(value))
        row[field] = Number.isFinite(num) ? num : null
      } else {
        const text = String(value ?? '').trim()
        row[field] = text || null
      }
    }
    if (typeof row.name === 'string' && row.name) {
      // Imported customers start with the "Other" defaults for the required
      // profile fields; the user refines them later from Edit Customer.
      rows.push({
        ...(row as unknown as CustomerInput),
        customer_category: 'other',
        custom_category: null,
        roshen_available: false,
        distributor: 'other',
      })
    } else {
      skipped++
    }
  }
  return { rows, skipped, mappedColumns }
}

/** Downloads an empty template with the expected column headers. */
export function downloadImportTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Name', 'Code', 'City', 'Area', 'Address', 'Phone', 'Notes', 'Latitude', 'Longitude'],
    ['ABC Market', 'C-001', 'Kyiv', 'Podil', '12 Sahaidachnoho St', '+380501234567', '', '', ''],
  ])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Customers')
  XLSX.writeFile(book, 'customers-template.xlsx')
}
