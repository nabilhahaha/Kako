import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Upload,
  Download,
  Edit2,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { mockUsers } from '@/data/mockData';
import type { Customer, Channel, CustomerStatus } from '@/lib/types';
import { generateId, exportToCsv } from '@/lib/utils';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const CHANNELS: Channel[] = [
  'Supermarket',
  'Grocery',
  'Wholesale',
  'Key Account',
  'Mini Market',
];

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Makkah', 'Madinah'];

const STATUSES: CustomerStatus[] = ['Active', 'Inactive', 'Suspended'];

const PAGE_SIZE = 10;

const emptyForm: Omit<Customer, 'id'> = {
  customerCode: '',
  customerName: '',
  channel: 'Supermarket',
  city: 'Riyadh',
  route: '',
  salesmanId: '',
  supervisorId: '',
  latitude: 0,
  longitude: 0,
  crNumber: '',
  vatNumber: '',
  nationalAddress: '',
  phone: '',
  status: 'Active',
};

export function CustomerListPage() {
  const user = useAuthStore((s) => s.user);
  const { customers, addCustomer, updateCustomer, addAuditLog } = useAppStore();

  // Search & filter state
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Pagination
  const [page, setPage] = useState(1);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<Omit<Customer, 'id'>>(emptyForm);

  const isAdmin = user?.role === 'admin';
  const canEdit = isAdmin;

  // Merchandiser users for salesman dropdown
  const merchandisers = useMemo(
    () => mockUsers.filter((u) => u.role === 'merchandiser' && u.isActive),
    [],
  );

  // Supervisor users for supervisor dropdown
  const supervisors = useMemo(
    () => mockUsers.filter((u) => u.role === 'supervisor' && u.isActive),
    [],
  );

  // Role-based customer filtering
  const roleFilteredCustomers = useMemo(() => {
    if (!user) return [];
    switch (user.role) {
      case 'admin':
      case 'data_team':
        return customers;
      case 'manager': {
        // Get supervisor IDs under this manager
        const supervisorIds = mockUsers
          .filter((u) => u.managerId === user.id && u.role === 'supervisor')
          .map((u) => u.id);
        return customers.filter((c) => supervisorIds.includes(c.supervisorId));
      }
      case 'supervisor':
        return customers.filter((c) => c.supervisorId === user.id);
      case 'merchandiser':
        return customers.filter((c) => c.salesmanId === user.id);
      default:
        return [];
    }
  }, [user, customers]);

  // Search + filter
  const filteredCustomers = useMemo(() => {
    let result = roleFilteredCustomers;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.customerName.toLowerCase().includes(q) ||
          c.customerCode.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q),
      );
    }

    if (channelFilter !== 'All') {
      result = result.filter((c) => c.channel === channelFilter);
    }
    if (cityFilter !== 'All') {
      result = result.filter((c) => c.city === cityFilter);
    }
    if (statusFilter !== 'All') {
      result = result.filter((c) => c.status === statusFilter);
    }

    return result;
  }, [roleFilteredCustomers, search, channelFilter, cityFilter, statusFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedCustomers = filteredCustomers.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  // Reset page when filters change
  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };
  const handleChannelFilter = (val: string) => {
    setChannelFilter(val);
    setPage(1);
  };
  const handleCityFilter = (val: string) => {
    setCityFilter(val);
    setPage(1);
  };
  const handleStatusFilter = (val: string) => {
    setStatusFilter(val);
    setPage(1);
  };

  // Lookup salesman name
  const getSalesmanName = (salesmanId: string) => {
    const u = mockUsers.find((mu) => mu.id === salesmanId);
    return u?.fullName ?? '-';
  };

  // Open add dialog
  const openAddDialog = () => {
    setEditingCustomer(null);
    setForm({
      ...emptyForm,
      customerCode: `CUS-${String(customers.length + 1).padStart(3, '0')}`,
    });
    setDialogOpen(true);
  };

  // Open edit dialog
  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    const { id: _id, ...rest } = customer;
    setForm(rest);
    setDialogOpen(true);
  };

  // Form field updater
  const updateField = <K extends keyof Omit<Customer, 'id'>>(
    field: K,
    value: Omit<Customer, 'id'>[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Save handler
  const handleSave = () => {
    if (!user) return;

    if (!form.customerName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (!form.salesmanId) {
      toast.error('Please select a salesman');
      return;
    }
    if (!form.supervisorId) {
      toast.error('Please select a supervisor');
      return;
    }

    if (editingCustomer) {
      // Update
      updateCustomer(editingCustomer.id, form);
      addAuditLog({
        userId: user.id,
        userName: user.fullName,
        role: user.role,
        action: 'customer_data_changed',
        entity: 'Customer',
        entityId: editingCustomer.id,
        oldValue: editingCustomer.customerName,
        newValue: form.customerName,
        status: 'Updated',
      });
      toast.success('Customer updated successfully');
    } else {
      // Add
      const newCustomer: Customer = {
        ...form,
        id: generateId('c_'),
      };
      addCustomer(newCustomer);
      addAuditLog({
        userId: user.id,
        userName: user.fullName,
        role: user.role,
        action: 'customer_created',
        entity: 'Customer',
        entityId: newCustomer.id,
        oldValue: '',
        newValue: newCustomer.customerName,
        status: 'Created',
      });
      toast.success('Customer added successfully');
    }

    setDialogOpen(false);
  };

  // Export CSV
  const handleExportCsv = () => {
    const rows = filteredCustomers.map((c) => ({
      Code: c.customerCode,
      Name: c.customerName,
      Channel: c.channel,
      City: c.city,
      Route: c.route,
      Salesman: getSalesmanName(c.salesmanId),
      Status: c.status,
      Phone: c.phone,
      'CR Number': c.crNumber,
      'VAT Number': c.vatNumber,
      'National Address': c.nationalAddress,
      Latitude: c.latitude,
      Longitude: c.longitude,
    }));
    exportToCsv('customers', rows);
    toast.success('CSV exported');
  };

  // Upload placeholder
  const handleUploadExcel = () => {
    toast('Excel upload coming soon');
  };

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <PageHeader
        title="Customer Master Data"
        subtitle={`${filteredCustomers.length} customer${filteredCustomers.length !== 1 ? 's' : ''}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <>
                <Button size="sm" onClick={openAddDialog} className="min-h-[44px]">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Customer</span>
                </Button>
                <Button size="sm" variant="outline" onClick={handleUploadExcel} className="min-h-[44px]">
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline">Upload Excel</span>
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={handleExportCsv} className="min-h-[44px]">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by name, code, or city..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={channelFilter}
          onChange={(e) => handleChannelFilter(e.target.value)}
          className="sm:w-40"
        >
          <option value="All">All Channels</option>
          {CHANNELS.map((ch) => (
            <option key={ch} value={ch}>
              {ch}
            </option>
          ))}
        </Select>
        <Select
          value={cityFilter}
          onChange={(e) => handleCityFilter(e.target.value)}
          className="sm:w-36"
        >
          <option value="All">All Cities</option>
          {CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => handleStatusFilter(e.target.value)}
          className="sm:w-36"
        >
          <option value="All">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {/* Content */}
      {filteredCustomers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No customers found"
          description="Try adjusting your search or filters."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left dark:border-gray-700 dark:bg-gray-800/50">
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Code</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Name</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Channel</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">City</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Route</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Salesman</th>
                  <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                  {canEdit && (
                    <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-700/50 dark:hover:bg-gray-700/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">
                      {c.customerCode}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {c.customerName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.channel}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.city}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.route}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {getSalesmanName(c.salesmanId)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditDialog(c)}
                        >
                          <Edit2 className="h-4 w-4" />
                          Edit
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {paginatedCustomers.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="text-base font-medium text-gray-900 dark:text-white">
                      {c.customerName}
                    </p>
                    <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
                      {c.customerCode}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Channel: </span>
                    <span className="text-gray-700 dark:text-gray-300">{c.channel}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">City: </span>
                    <span className="text-gray-700 dark:text-gray-300">{c.city}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Route: </span>
                    <span className="text-gray-700 dark:text-gray-300">{c.route}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Salesman: </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {getSalesmanName(c.salesmanId)}
                    </span>
                  </div>
                </div>
                {canEdit && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      size="default"
                      variant="outline"
                      onClick={() => openEditDialog(c)}
                      className="min-h-[44px]"
                    >
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Page {safePage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-[44px] min-w-[44px]"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Prev</span>
                </Button>
                <Button
                  variant="outline"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="min-h-[44px] min-w-[44px]"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add / Edit Customer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? 'Edit Customer' : 'Add Customer'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Customer Code */}
            <div className="space-y-1.5">
              <Label htmlFor="customerCode">Customer Code</Label>
              <Input
                id="customerCode"
                value={form.customerCode}
                readOnly
                className="bg-gray-50 dark:bg-gray-700"
              />
            </div>

            {/* Customer Name */}
            <div className="space-y-1.5">
              <Label htmlFor="customerName">Customer Name *</Label>
              <Input
                id="customerName"
                value={form.customerName}
                onChange={(e) => updateField('customerName', e.target.value)}
                placeholder="Enter customer name"
              />
            </div>

            {/* Channel */}
            <div className="space-y-1.5">
              <Label htmlFor="channel">Channel</Label>
              <Select
                id="channel"
                value={form.channel}
                onChange={(e) => updateField('channel', e.target.value as Channel)}
              >
                {CHANNELS.map((ch) => (
                  <option key={ch} value={ch}>
                    {ch}
                  </option>
                ))}
              </Select>
            </div>

            {/* City */}
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Select
                id="city"
                value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
              >
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>

            {/* Route */}
            <div className="space-y-1.5">
              <Label htmlFor="route">Route</Label>
              <Input
                id="route"
                value={form.route}
                onChange={(e) => updateField('route', e.target.value)}
                placeholder="e.g. RIY-01"
              />
            </div>

            {/* Salesman */}
            <div className="space-y-1.5">
              <Label htmlFor="salesmanId">Salesman *</Label>
              <Select
                id="salesmanId"
                value={form.salesmanId}
                onChange={(e) => updateField('salesmanId', e.target.value)}
              >
                <option value="">Select salesman</option>
                {merchandisers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </Select>
            </div>

            {/* Supervisor */}
            <div className="space-y-1.5">
              <Label htmlFor="supervisorId">Supervisor *</Label>
              <Select
                id="supervisorId"
                value={form.supervisorId}
                onChange={(e) => updateField('supervisorId', e.target.value)}
              >
                <option value="">Select supervisor</option>
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </Select>
            </div>

            {/* GPS Latitude */}
            <div className="space-y-1.5">
              <Label htmlFor="latitude">GPS Latitude</Label>
              <Input
                id="latitude"
                type="number"
                step="any"
                value={form.latitude || ''}
                onChange={(e) =>
                  updateField('latitude', parseFloat(e.target.value) || 0)
                }
                placeholder="e.g. 24.7136"
              />
            </div>

            {/* GPS Longitude */}
            <div className="space-y-1.5">
              <Label htmlFor="longitude">GPS Longitude</Label>
              <Input
                id="longitude"
                type="number"
                step="any"
                value={form.longitude || ''}
                onChange={(e) =>
                  updateField('longitude', parseFloat(e.target.value) || 0)
                }
                placeholder="e.g. 46.6753"
              />
            </div>

            {/* CR Number */}
            <div className="space-y-1.5">
              <Label htmlFor="crNumber">CR Number</Label>
              <Input
                id="crNumber"
                value={form.crNumber}
                onChange={(e) => updateField('crNumber', e.target.value)}
                placeholder="Commercial Registration"
              />
            </div>

            {/* VAT Number */}
            <div className="space-y-1.5">
              <Label htmlFor="vatNumber">VAT Number</Label>
              <Input
                id="vatNumber"
                value={form.vatNumber}
                onChange={(e) => updateField('vatNumber', e.target.value)}
                placeholder="VAT registration number"
              />
            </div>

            {/* National Address */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="nationalAddress">National Address</Label>
              <Input
                id="nationalAddress"
                value={form.nationalAddress}
                onChange={(e) => updateField('nationalAddress', e.target.value)}
                placeholder="Full national address"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="+966..."
              />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                value={form.status}
                onChange={(e) =>
                  updateField('status', e.target.value as CustomerStatus)
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="min-h-[44px] w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleSave} className="min-h-[44px] w-full sm:w-auto">
              {editingCustomer ? 'Update Customer' : 'Add Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
