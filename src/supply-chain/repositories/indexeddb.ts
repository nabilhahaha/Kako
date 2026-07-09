/**
 * IndexedDB-backed implementation of the repository interfaces. This is the
 * default DataStore. Swapping storage engines means writing one more file like
 * this and changing the export in ./index.
 */
import { CONFIG_SINGLETON_ID, type ValidationConfig } from '../domain/config';
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
import {
  dbBulkPut,
  dbClearAll,
  dbDelete,
  dbGet,
  dbGetAll,
  dbGetByIndex,
  dbPut,
  STORES,
  type StoreName,
} from './db';
import type {
  AuditRepository,
  ConfigRepository,
  CrudRepository,
  DataStore,
  DeliveryNoteLineRepository,
  DeliveryNoteRepository,
  ExceptionRepository,
  InvoiceLineRepository,
  InvoiceRepository,
  PiLineRepository,
  PiRepository,
  ValidationResultRepository,
} from './types';

class BaseRepo<T extends { id: string }> implements CrudRepository<T> {
  constructor(protected store: StoreName) {}
  getAll() {
    return dbGetAll<T>(this.store);
  }
  getById(id: string) {
    return dbGet<T>(this.store, id);
  }
  save(entity: T) {
    return dbPut<T>(this.store, entity);
  }
  saveMany(entities: T[]) {
    return dbBulkPut<T>(this.store, entities);
  }
  remove(id: string) {
    return dbDelete(this.store, id);
  }
  protected byIndex(index: string, value: string) {
    return dbGetByIndex<T>(this.store, index, value);
  }
}

class PiRepoImpl extends BaseRepo<PI> implements PiRepository {
  constructor() {
    super(STORES.pis);
  }
  async findByNumber(piNumber: string) {
    const all = await this.getAll();
    return all.find((p) => p.piNumber === piNumber);
  }
}

class PiLineRepoImpl extends BaseRepo<PiLine> implements PiLineRepository {
  constructor() {
    super(STORES.piLines);
  }
  byPi(piId: string) {
    return this.byIndex('piId', piId);
  }
}

class DnRepoImpl extends BaseRepo<DeliveryNote> implements DeliveryNoteRepository {
  constructor() {
    super(STORES.deliveryNotes);
  }
  byPi(piId: string) {
    return this.byIndex('piId', piId);
  }
}

class DnLineRepoImpl
  extends BaseRepo<DeliveryNoteLine>
  implements DeliveryNoteLineRepository
{
  constructor() {
    super(STORES.deliveryNoteLines);
  }
  byPi(piId: string) {
    return this.byIndex('piId', piId);
  }
}

class InvoiceRepoImpl extends BaseRepo<Invoice> implements InvoiceRepository {
  constructor() {
    super(STORES.invoices);
  }
  byPi(piId: string) {
    return this.byIndex('piId', piId);
  }
}

class InvoiceLineRepoImpl
  extends BaseRepo<InvoiceLine>
  implements InvoiceLineRepository
{
  constructor() {
    super(STORES.invoiceLines);
  }
  byInvoice(invoiceId: string) {
    return this.byIndex('invoiceId', invoiceId);
  }
}

class ExceptionRepoImpl
  extends BaseRepo<ExceptionRecord>
  implements ExceptionRepository
{
  constructor() {
    super(STORES.exceptions);
  }
  byPi(piId: string) {
    return this.byIndex('piId', piId);
  }
}

class ValidationResultRepoImpl
  extends BaseRepo<ValidationResult>
  implements ValidationResultRepository
{
  constructor() {
    super(STORES.validationResults);
  }
  byPi(piId: string) {
    return this.byIndex('piId', piId);
  }
}

class AuditRepoImpl extends BaseRepo<AuditLogEntry> implements AuditRepository {
  constructor() {
    super(STORES.auditLogs);
  }
}

class ConfigRepoImpl implements ConfigRepository {
  async get() {
    const row = await dbGet<{ id: string; value: ValidationConfig }>(
      STORES.config,
      CONFIG_SINGLETON_ID,
    );
    return row?.value;
  }
  async set(config: ValidationConfig) {
    await dbPut(STORES.config, { id: CONFIG_SINGLETON_ID, value: config });
    return config;
  }
}

export class IndexedDbDataStore implements DataStore {
  pis = new PiRepoImpl();
  piLines = new PiLineRepoImpl();
  deliveryNotes = new DnRepoImpl();
  deliveryNoteLines = new DnLineRepoImpl();
  invoices = new InvoiceRepoImpl();
  invoiceLines = new InvoiceLineRepoImpl();
  exceptions = new ExceptionRepoImpl();
  validationResults = new ValidationResultRepoImpl();
  audit = new AuditRepoImpl();
  config = new ConfigRepoImpl();

  async resetAll() {
    await dbClearAll();
  }
}
