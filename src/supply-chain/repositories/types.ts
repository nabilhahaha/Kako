/**
 * Repository interfaces. Services depend only on these abstractions — never on
 * IndexedDB or any concrete engine. Provide an alternate implementation
 * (REST / Supabase) and wire it in ./index without changing anything else.
 */
import type { ValidationConfig } from '../domain/config';
import type {
  AuditLogEntry,
  DeliveryNote,
  DeliveryNoteLine,
  ExceptionRecord,
  Invoice,
  InvoiceLine,
  PI,
  PiLine,
  ValidationResult,
} from '../domain/models';

export interface CrudRepository<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  save(entity: T): Promise<T>;
  saveMany(entities: T[]): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface PiRepository extends CrudRepository<PI> {
  findByNumber(piNumber: string): Promise<PI | undefined>;
}
export interface PiLineRepository extends CrudRepository<PiLine> {
  byPi(piId: string): Promise<PiLine[]>;
}

export interface DeliveryNoteRepository extends CrudRepository<DeliveryNote> {
  byPi(piId: string): Promise<DeliveryNote[]>;
}
export interface DeliveryNoteLineRepository extends CrudRepository<DeliveryNoteLine> {
  byPi(piId: string): Promise<DeliveryNoteLine[]>;
}

export interface InvoiceRepository extends CrudRepository<Invoice> {
  byPi(piId: string): Promise<Invoice[]>;
}
export interface InvoiceLineRepository extends CrudRepository<InvoiceLine> {
  byInvoice(invoiceId: string): Promise<InvoiceLine[]>;
}

export interface ExceptionRepository extends CrudRepository<ExceptionRecord> {
  byPi(piId: string): Promise<ExceptionRecord[]>;
}

export interface ValidationResultRepository extends CrudRepository<ValidationResult> {
  byPi(piId: string): Promise<ValidationResult[]>;
}

export interface AuditRepository extends CrudRepository<AuditLogEntry> {}

export interface ConfigRepository {
  get(): Promise<ValidationConfig | undefined>;
  set(config: ValidationConfig): Promise<ValidationConfig>;
}

/** Aggregate of every repository, injected into services. */
export interface DataStore {
  pis: PiRepository;
  piLines: PiLineRepository;
  deliveryNotes: DeliveryNoteRepository;
  deliveryNoteLines: DeliveryNoteLineRepository;
  invoices: InvoiceRepository;
  invoiceLines: InvoiceLineRepository;
  exceptions: ExceptionRepository;
  validationResults: ValidationResultRepository;
  audit: AuditRepository;
  config: ConfigRepository;
  /** Wipe all operational data (used by Settings → Reset). */
  resetAll(): Promise<void>;
}
