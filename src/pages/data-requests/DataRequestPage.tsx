import { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  Upload,
  ArrowRight,
  Clock,
  User,
  Filter,
  Send,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { ROLE_LABELS } from '@/lib/permissions';
import { generateId, formatDateTime } from '@/lib/utils';
import type {
  DataUpdateType,
  RequestStatus,
  Customer,
} from '@/lib/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const UPDATE_TYPES: DataUpdateType[] = [
  'CR Number',
  'VAT Number',
  'National Address',
  'Phone Number',
  'Customer Name',
  'GPS Location',
  'Channel',
];

function getOldValue(customer: Customer, updateType: DataUpdateType): string {
  switch (updateType) {
    case 'CR Number':
      return customer.crNumber;
    case 'VAT Number':
      return customer.vatNumber;
    case 'National Address':
      return customer.nationalAddress;
    case 'Phone Number':
      return customer.phone;
    case 'Customer Name':
      return customer.customerName;
    case 'GPS Location':
      return `${customer.latitude}, ${customer.longitude}`;
    case 'Channel':
      return customer.channel;
    default:
      return '';
  }
}

export function DataRequestPage() {
  const user = useAuthStore((s) => s.user);
  const {
    customers,
    dataUpdateRequests,
    settings,
    addDataUpdateRequest,
    addAuditLog,
  } = useAppStore();

  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [updateType, setUpdateType] = useState<DataUpdateType | ''>('');
  const [newValue, setNewValue] = useState('');
  const [notes, setNotes] = useState('');

  // My requests filter
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'All'>('All');

  if (!user) return null;

  // Role-based customer access
  const accessibleCustomers = useMemo(() => {
    if (user.role === 'merchandiser') {
      return customers.filter((c) => c.salesmanId === user.id);
    }
    if (user.role === 'supervisor') {
      return customers.filter((c) => c.supervisorId === user.id);
    }
    // admin, manager, data_team see all
    return customers;
  }, [customers, user]);

  // Filter customers by search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return accessibleCustomers;
    const q = customerSearch.toLowerCase();
    return accessibleCustomers.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        c.customerCode.toLowerCase().includes(q),
    );
  }, [accessibleCustomers, customerSearch]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const oldValue = useMemo(() => {
    if (!selectedCustomer || !updateType) return '';
    return getOldValue(selectedCustomer, updateType);
  }, [selectedCustomer, updateType]);

  const approverRole = useMemo(() => {
    if (!updateType) return null;
    const routing = settings.approvalRouting.find((r) => r.updateType === updateType);
    return routing?.approverRole ?? null;
  }, [updateType, settings.approvalRouting]);

  // My requests
  const myRequests = useMemo(() => {
    let list = dataUpdateRequests;

    // Merchandiser/supervisor see only their own; admin/manager/data_team see all
    if (user.role === 'merchandiser' || user.role === 'supervisor') {
      list = list.filter((r) => r.userId === user.id);
    }

    if (statusFilter !== 'All') {
      list = list.filter((r) => r.status === statusFilter);
    }

    return list;
  }, [dataUpdateRequests, user, statusFilter]);

  // Submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer || !updateType || !newValue.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!approverRole) {
      toast.error('No approval routing configured for this update type');
      return;
    }

    const id = generateId('dur');

    addDataUpdateRequest({
      id,
      customerId: selectedCustomer.id,
      customerCode: selectedCustomer.customerCode,
      customerName: selectedCustomer.customerName,
      userId: user.id,
      userName: user.fullName,
      updateType,
      oldValue,
      newValue: newValue.trim(),
      notes: notes.trim(),
      status: 'Pending',
      approverRole,
      approverComment: '',
      createdAt: new Date().toISOString(),
    });

    addAuditLog({
      userId: user.id,
      userName: user.fullName,
      role: user.role,
      action: 'request_created',
      entity: 'Data Update Request',
      entityId: id,
      oldValue: '',
      newValue: `${updateType} update for ${selectedCustomer.customerCode}`,
      status: 'Pending',
    });

    toast.success('Data update request submitted successfully');

    // Reset form
    setSelectedCustomerId('');
    setCustomerSearch('');
    setUpdateType('');
    setNewValue('');
    setNotes('');
  };

  const statusOptions: (RequestStatus | 'All')[] = ['All', 'Pending', 'Approved', 'Rejected'];

  return (
    <div>
      <PageHeader
        title="Data Update Requests"
        subtitle="Request updates to customer data"
      />

      <div className="space-y-8">
        {/* ─── Create New Request ─── */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            Create New Request
          </h2>
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              {/* Customer selection */}
              <div className="sm:col-span-2">
                <Label htmlFor="customer-search">Customer</Label>
                <div className="relative mt-1.5">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="customer-search"
                    placeholder="Search by name or code..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      if (selectedCustomerId) {
                        setSelectedCustomerId('');
                        setUpdateType('');
                        setNewValue('');
                      }
                    }}
                    className="pl-10"
                  />
                </div>
                {customerSearch && !selectedCustomerId && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
                    {filteredCustomers.length === 0 ? (
                      <p className="p-3 text-sm text-gray-500 dark:text-gray-400">
                        No customers found
                      </p>
                    ) : (
                      filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                          onClick={() => {
                            setSelectedCustomerId(c.id);
                            setCustomerSearch(`${c.customerCode} - ${c.customerName}`);
                            setUpdateType('');
                            setNewValue('');
                          }}
                        >
                          <span className="font-medium text-gray-900 dark:text-white">
                            {c.customerCode}
                          </span>
                          <span className="text-gray-600 dark:text-gray-300">
                            {c.customerName}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {selectedCustomer && (
                  <p className="mt-1.5 text-xs text-green-600 dark:text-green-400">
                    Selected: {selectedCustomer.customerCode} - {selectedCustomer.customerName}
                  </p>
                )}
              </div>

              {/* Update Type */}
              <div>
                <Label htmlFor="update-type">Update Type</Label>
                <Select
                  id="update-type"
                  value={updateType}
                  onChange={(e) => {
                    setUpdateType(e.target.value as DataUpdateType | '');
                    setNewValue('');
                  }}
                  className="mt-1.5"
                  disabled={!selectedCustomerId}
                >
                  <option value="">Select update type...</option>
                  {UPDATE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Old Value (auto-populated, read-only) */}
              <div>
                <Label htmlFor="old-value">Current Value</Label>
                <Input
                  id="old-value"
                  value={oldValue}
                  readOnly
                  disabled
                  className="mt-1.5 bg-gray-50 dark:bg-gray-700/50"
                  placeholder="Select customer and update type"
                />
              </div>

              {/* New Value */}
              <div className="sm:col-span-2">
                <Label htmlFor="new-value">New Value</Label>
                <Input
                  id="new-value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={
                    updateType === 'GPS Location'
                      ? 'e.g., 24.7136, 46.6753'
                      : 'Enter new value...'
                  }
                  className="mt-1.5"
                  disabled={!updateType}
                />
              </div>

              {/* Notes */}
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Provide reason for the update..."
                  className="mt-1.5"
                />
              </div>

              {/* Attachment placeholder */}
              <div>
                <Label>Attachment</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-1.5 w-full"
                  disabled
                >
                  <Upload className="h-4 w-4" />
                  Upload File (Coming Soon)
                </Button>
              </div>

              {/* Routed to display */}
              <div>
                <Label>Routed To</Label>
                <div className="mt-1.5 flex h-11 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm dark:border-gray-700 dark:bg-gray-700/50">
                  {approverRole ? (
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {ROLE_LABELS[approverRole]}
                    </span>
                  ) : (
                    <span className="text-gray-400">
                      Select update type to see approver
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="mt-6">
              <Button
                type="submit"
                disabled={!selectedCustomerId || !updateType || !newValue.trim()}
              >
                <Send className="h-4 w-4" />
                Submit Request
              </Button>
            </div>
          </form>
        </section>

        {/* ─── My Requests ─── */}
        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {user.role === 'merchandiser' || user.role === 'supervisor'
                ? 'My Requests'
                : 'All Requests'}
            </h2>
            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 text-gray-400" />
              <Select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as RequestStatus | 'All')
                }
                className="w-40"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s === 'All' ? 'All Statuses' : s}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {myRequests.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="No Requests"
              description="No data update requests found matching your filters."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {myRequests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {req.customerName}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {req.customerCode}
                      </p>
                    </div>
                    <StatusBadge status={req.status} />
                  </div>

                  <div className="mb-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                    <div className="flex items-center gap-2">
                      {req.updateType === 'GPS Location' ? (
                        <MapPin className="h-4 w-4 text-blue-500" />
                      ) : (
                        <FileText className="h-4 w-4 text-gray-400" />
                      )}
                      <span>
                        Type:{' '}
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {req.updateType}
                        </span>
                      </span>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          Old:
                        </span>
                        <span className="break-all text-xs text-red-600 dark:text-red-400">
                          {req.oldValue}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          New:
                        </span>
                        <span className="break-all text-xs text-green-600 dark:text-green-400">
                          {req.newValue}
                        </span>
                      </div>
                    </div>

                    {req.notes && (
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 text-gray-400" />
                        <span>{req.notes}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span>
                        Requested by:{' '}
                        <span className="font-medium">{req.userName}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span>{formatDateTime(req.createdAt)}</span>
                    </div>
                  </div>

                  {req.status !== 'Pending' && (
                    <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                      <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Approver Comment
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-200">
                        {req.approverComment || '(No comment)'}
                      </p>
                      {req.reviewedAt && (
                        <p className="mt-1 text-xs text-gray-400">
                          Reviewed on {formatDateTime(req.reviewedAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
