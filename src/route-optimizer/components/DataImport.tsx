import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import type { RawCustomer } from '../types';

interface DataImportProps {
  onImport: (customers: RawCustomer[]) => void;
  importedCount: number;
  cities: string[];
  branches: string[];
  error: string | null;
  onError: (err: string | null) => void;
}

const COLUMN_MAP: Record<string, keyof RawCustomer> = {
  'CUSTOMER_NO': 'customerNo',
  'CUSTOMER NO': 'customerNo',
  'customer_no': 'customerNo',
  'CUSTOMER_NAME_E': 'customerNameE',
  'CUSTOMER NAME E': 'customerNameE',
  'Customer Name E': 'customerNameE',
  'CUSTOMER_NAME_A': 'customerNameA',
  'CUSTOMER NAME A': 'customerNameA',
  'Customer Name A': 'customerNameA',
  'Latitude': 'latitude',
  'LATITUDE': 'latitude',
  'latitude': 'latitude',
  'LAT': 'latitude',
  'Longitude': 'longitude',
  'LONGITUDE': 'longitude',
  'longitude': 'longitude',
  'LNG': 'longitude',
  'LON': 'longitude',
  'City': 'city',
  'CITY': 'city',
  'city': 'city',
  'Dynamic_City': 'dynamicCity',
  'DYNAMIC_CITY': 'dynamicCity',
  'DynamicCity': 'dynamicCity',
  'BRANCH': 'branch',
  'Branch': 'branch',
  'branch': 'branch',
  'New_Branch': 'newBranch',
  'NEW_BRANCH': 'newBranch',
  'NewBranch': 'newBranch',
  'REPEATING_VISIT_PER_MONTH': 'monthlyVisits',
  'Repeating Visit Per Month': 'monthlyVisits',
  'Monthly Visits': 'monthlyVisits',
  'Inactive': 'inactive',
  'INACTIVE': 'inactive',
  'inactive': 'inactive',
  'SALESMAN_NAME': 'salesmanName',
  'Salesman Name': 'salesmanName',
  'SALESMAN NAME': 'salesmanName',
  'Address': 'address',
  'ADDRESS': 'address',
  'address': 'address',
  'CustomerType': 'customerType',
  'CUSTOMER_TYPE': 'customerType',
  'Customer Type': 'customerType',
  'Supervisor': 'supervisor',
  'SUPERVISOR': 'supervisor',
  'supervisor': 'supervisor',
  'SalesManCategory': 'salesManCategory',
  'SALESMAN_CATEGORY': 'salesManCategory',
  'Salesman Category': 'salesManCategory',
};

function isValidKSACoord(lat: number, lng: number): boolean {
  return lat >= 16 && lat <= 33 && lng >= 34 && lng <= 56;
}

function parseRow(row: Record<string, unknown>): RawCustomer | null {
  const mapped: Partial<RawCustomer> = {};

  for (const [excelCol, value] of Object.entries(row)) {
    const key = COLUMN_MAP[excelCol.trim()];
    if (key) {
      (mapped as Record<string, unknown>)[key] = value;
    }
  }

  const lat = Number(mapped.latitude);
  const lng = Number(mapped.longitude);
  if (isNaN(lat) || isNaN(lng) || !isValidKSACoord(lat, lng)) return null;

  return {
    customerNo: String(mapped.customerNo ?? ''),
    customerNameE: String(mapped.customerNameE ?? ''),
    customerNameA: String(mapped.customerNameA ?? ''),
    latitude: lat,
    longitude: lng,
    city: String(mapped.city ?? mapped.dynamicCity ?? ''),
    dynamicCity: String(mapped.dynamicCity ?? ''),
    branch: String(mapped.branch ?? mapped.newBranch ?? ''),
    newBranch: String(mapped.newBranch ?? ''),
    monthlyVisits: Number(mapped.monthlyVisits) || 4,
    inactive: Number(mapped.inactive) === 1 || mapped.inactive === true,
    salesmanName: String(mapped.salesmanName ?? ''),
    address: String(mapped.address ?? ''),
    customerType: String(mapped.customerType ?? ''),
    supervisor: String(mapped.supervisor ?? ''),
    salesManCategory: String(mapped.salesManCategory ?? ''),
  };
}

export function DataImport({ onImport, importedCount, cities, branches, error, onError }: DataImportProps) {
  const { t } = useTranslation();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      onError(null);
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

          const customers: RawCustomer[] = [];
          for (const row of rows) {
            const parsed = parseRow(row);
            if (parsed) customers.push(parsed);
          }

          if (customers.length === 0) {
            onError(t('import.errors.noCoordinates'));
            return;
          }

          onImport(customers);
        } catch {
          onError(t('import.errors.parseError'));
        }
      };

      reader.onerror = () => onError(t('import.errors.parseError'));
      reader.readAsArrayBuffer(file);
    },
    [onImport, onError, t],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-h2 font-semibold">{t('import.title')}</h2>
      <p className="text-body text-muted-foreground">{t('import.description')}</p>

      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 transition-colors ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-body font-medium">{t('import.dropzoneText')}</p>
        <p className="mt-1 text-caption text-muted-foreground">{t('import.supportedFormats')}</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {importedCount > 0 && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle className="h-5 w-5" />
            <FileSpreadsheet className="h-5 w-5" />
            <span className="font-medium">{t('import.fileLoaded')}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t('import.customersFound', { count: importedCount })}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('import.citiesFound', { count: cities.length })}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('import.branchesFound', { count: branches.length })}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
