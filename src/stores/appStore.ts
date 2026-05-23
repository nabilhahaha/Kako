import { create } from 'zustand';
import type {
  Customer, Visit, OutOfLocationRequest, DataUpdateRequest,
  AuditLog, AppSettings, AuditAction, UserRole,
} from '@/lib/types';
import {
  mockCustomers, mockVisits, mockOutOfLocationRequests,
  mockDataUpdateRequests, mockAuditLogs, mockSettings,
} from '@/data/mockData';

interface AppState {
  customers: Customer[];
  visits: Visit[];
  oolRequests: OutOfLocationRequest[];
  dataUpdateRequests: DataUpdateRequest[];
  auditLogs: AuditLog[];
  settings: AppSettings;
  darkMode: boolean;

  toggleDarkMode: () => void;
  addCustomer: (c: Customer) => void;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  addVisit: (v: Visit) => void;
  addOolRequest: (r: OutOfLocationRequest) => void;
  approveOolRequest: (id: string, comment: string, reviewerId: string) => void;
  rejectOolRequest: (id: string, comment: string, reviewerId: string) => void;
  addDataUpdateRequest: (r: DataUpdateRequest) => void;
  approveDataUpdateRequest: (id: string, comment: string, reviewerId: string) => void;
  rejectDataUpdateRequest: (id: string, comment: string, reviewerId: string) => void;
  addAuditLog: (entry: Omit<AuditLog, 'id' | 'timestamp'>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

let auditCounter = 100;

export const useAppStore = create<AppState>((set, get) => ({
  customers: [...mockCustomers],
  visits: [...mockVisits],
  oolRequests: [...mockOutOfLocationRequests],
  dataUpdateRequests: [...mockDataUpdateRequests],
  auditLogs: [...mockAuditLogs],
  settings: { ...mockSettings },
  darkMode: false,

  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

  addCustomer: (c) => set((s) => ({ customers: [c, ...s.customers] })),

  updateCustomer: (id, patch) =>
    set((s) => ({
      customers: s.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  addVisit: (v) => set((s) => ({ visits: [v, ...s.visits] })),

  addOolRequest: (r) => set((s) => ({ oolRequests: [r, ...s.oolRequests] })),

  approveOolRequest: (id, comment, reviewerId) =>
    set((s) => ({
      oolRequests: s.oolRequests.map((r) =>
        r.id === id
          ? { ...r, status: 'Approved' as const, managerComment: comment, reviewedAt: new Date().toISOString(), reviewedBy: reviewerId }
          : r,
      ),
    })),

  rejectOolRequest: (id, comment, reviewerId) =>
    set((s) => ({
      oolRequests: s.oolRequests.map((r) =>
        r.id === id
          ? { ...r, status: 'Rejected' as const, managerComment: comment, reviewedAt: new Date().toISOString(), reviewedBy: reviewerId }
          : r,
      ),
    })),

  addDataUpdateRequest: (r) => set((s) => ({ dataUpdateRequests: [r, ...s.dataUpdateRequests] })),

  approveDataUpdateRequest: (id, comment, reviewerId) => {
    const state = get();
    const req = state.dataUpdateRequests.find((r) => r.id === id);
    if (!req) return;

    const updatedRequests = state.dataUpdateRequests.map((r) =>
      r.id === id
        ? { ...r, status: 'Approved' as const, approverComment: comment, reviewedAt: new Date().toISOString(), reviewedBy: reviewerId }
        : r,
    );

    let updatedCustomers = state.customers;
    if (req.updateType === 'GPS Location') {
      const [lat, lng] = req.newValue.split(',').map((v) => parseFloat(v.trim()));
      if (!isNaN(lat) && !isNaN(lng)) {
        updatedCustomers = state.customers.map((c) =>
          c.id === req.customerId ? { ...c, latitude: lat, longitude: lng } : c,
        );
      }
    } else if (req.updateType === 'CR Number') {
      updatedCustomers = state.customers.map((c) =>
        c.id === req.customerId ? { ...c, crNumber: req.newValue } : c,
      );
    } else if (req.updateType === 'VAT Number') {
      updatedCustomers = state.customers.map((c) =>
        c.id === req.customerId ? { ...c, vatNumber: req.newValue } : c,
      );
    } else if (req.updateType === 'National Address') {
      updatedCustomers = state.customers.map((c) =>
        c.id === req.customerId ? { ...c, nationalAddress: req.newValue } : c,
      );
    } else if (req.updateType === 'Phone Number') {
      updatedCustomers = state.customers.map((c) =>
        c.id === req.customerId ? { ...c, phone: req.newValue } : c,
      );
    } else if (req.updateType === 'Customer Name') {
      updatedCustomers = state.customers.map((c) =>
        c.id === req.customerId ? { ...c, customerName: req.newValue } : c,
      );
    } else if (req.updateType === 'Channel') {
      updatedCustomers = state.customers.map((c) =>
        c.id === req.customerId ? { ...c, channel: req.newValue as Customer['channel'] } : c,
      );
    }

    set({ dataUpdateRequests: updatedRequests, customers: updatedCustomers });
  },

  rejectDataUpdateRequest: (id, comment, reviewerId) =>
    set((s) => ({
      dataUpdateRequests: s.dataUpdateRequests.map((r) =>
        r.id === id
          ? { ...r, status: 'Rejected' as const, approverComment: comment, reviewedAt: new Date().toISOString(), reviewedBy: reviewerId }
          : r,
      ),
    })),

  addAuditLog: (entry) => {
    auditCounter++;
    const log: AuditLog = {
      ...entry,
      id: `al_${auditCounter}`,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({ auditLogs: [log, ...s.auditLogs] }));
  },

  updateSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),
}));
