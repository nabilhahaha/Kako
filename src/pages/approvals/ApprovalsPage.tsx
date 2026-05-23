import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  MapPin,
  Navigation,
  Clock,
  FileText,
  User,
  Filter,
  MapPinOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { mockUsers } from '@/data/mockData';
import { ROLE_LABELS } from '@/lib/permissions';
import { formatDateTime } from '@/lib/utils';
import type {
  OutOfLocationRequest,
  DataUpdateRequest,
  RequestStatus,
  DataUpdateType,
} from '@/lib/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

type ActionDialog = {
  type: 'approve' | 'reject';
  requestId: string;
  requestType: 'ool' | 'data';
} | null;

export function ApprovalsPage() {
  const user = useAuthStore((s) => s.user);
  const {
    oolRequests,
    dataUpdateRequests,
    approveOolRequest,
    rejectOolRequest,
    approveDataUpdateRequest,
    rejectDataUpdateRequest,
    addAuditLog,
  } = useAppStore();

  const [oolStatusFilter, setOolStatusFilter] = useState<RequestStatus | 'All'>('All');
  const [dataStatusFilter, setDataStatusFilter] = useState<RequestStatus | 'All'>('All');
  const [dataTypeFilter, setDataTypeFilter] = useState<DataUpdateType | 'All'>('All');
  const [actionDialog, setActionDialog] = useState<ActionDialog>(null);
  const [comment, setComment] = useState('');

  if (!user) return null;

  // ─── Role-based filtering ───
  const filteredOolRequests = useMemo(() => {
    let list = oolRequests;

    if (user.role === 'manager') {
      // Manager sees requests from their team members
      const teamUserIds = mockUsers
        .filter((u) => u.managerId === user.id || u.supervisorId === user.id)
        .map((u) => u.id);
      list = list.filter((r) => teamUserIds.includes(r.userId));
    } else if (user.role === 'data_team') {
      list = []; // Data team doesn't see OOL requests
    }
    // Admin sees all

    if (oolStatusFilter !== 'All') {
      list = list.filter((r) => r.status === oolStatusFilter);
    }

    return list;
  }, [oolRequests, user, oolStatusFilter]);

  const filteredDataRequests = useMemo(() => {
    let list = dataUpdateRequests;

    if (user.role === 'manager') {
      list = list.filter((r) => r.approverRole === 'manager');
    } else if (user.role === 'data_team') {
      list = list.filter((r) => r.approverRole === 'data_team');
    }
    // Admin sees all

    if (dataStatusFilter !== 'All') {
      list = list.filter((r) => r.status === dataStatusFilter);
    }
    if (dataTypeFilter !== 'All') {
      list = list.filter((r) => r.updateType === dataTypeFilter);
    }

    return list;
  }, [dataUpdateRequests, user, dataStatusFilter, dataTypeFilter]);

  const gpsRequests = useMemo(() => {
    return filteredDataRequests.filter((r) => r.updateType === 'GPS Location');
  }, [filteredDataRequests]);

  // ─── Action handlers ───
  const handleOpenDialog = (
    type: 'approve' | 'reject',
    requestId: string,
    requestType: 'ool' | 'data',
  ) => {
    setActionDialog({ type, requestId, requestType });
    setComment('');
  };

  const handleConfirmAction = () => {
    if (!actionDialog || !user) return;

    const { type, requestId, requestType } = actionDialog;

    if (requestType === 'ool') {
      if (type === 'approve') {
        approveOolRequest(requestId, comment, user.id);
        addAuditLog({
          userId: user.id,
          userName: user.fullName,
          role: user.role,
          action: 'request_approved',
          entity: 'Out of Location Request',
          entityId: requestId,
          oldValue: 'Pending',
          newValue: 'Approved',
          status: 'Approved',
        });
        toast.success('Request approved');
      } else {
        rejectOolRequest(requestId, comment, user.id);
        addAuditLog({
          userId: user.id,
          userName: user.fullName,
          role: user.role,
          action: 'request_rejected',
          entity: 'Out of Location Request',
          entityId: requestId,
          oldValue: 'Pending',
          newValue: 'Rejected',
          status: 'Rejected',
        });
        toast.success('Request rejected');
      }
    } else {
      const req = dataUpdateRequests.find((r) => r.id === requestId);
      if (type === 'approve') {
        approveDataUpdateRequest(requestId, comment, user.id);
        addAuditLog({
          userId: user.id,
          userName: user.fullName,
          role: user.role,
          action: 'request_approved',
          entity: 'Data Update Request',
          entityId: requestId,
          oldValue: 'Pending',
          newValue: 'Approved',
          status: 'Approved',
        });
        if (req) {
          addAuditLog({
            userId: user.id,
            userName: user.fullName,
            role: user.role,
            action: 'customer_data_changed',
            entity: 'Customer',
            entityId: req.customerId,
            oldValue: req.oldValue,
            newValue: req.newValue,
            status: 'Applied',
          });
        }
        toast.success('Request approved');
      } else {
        rejectDataUpdateRequest(requestId, comment, user.id);
        addAuditLog({
          userId: user.id,
          userName: user.fullName,
          role: user.role,
          action: 'request_rejected',
          entity: 'Data Update Request',
          entityId: requestId,
          oldValue: 'Pending',
          newValue: 'Rejected',
          status: 'Rejected',
        });
        toast.success('Request rejected');
      }
    }

    setActionDialog(null);
    setComment('');
  };

  const getReviewerName = (reviewerId?: string) => {
    if (!reviewerId) return '';
    const reviewer = mockUsers.find((u) => u.id === reviewerId);
    return reviewer?.fullName ?? reviewerId;
  };

  // ─── Render helpers ───
  const renderOolCard = (req: OutOfLocationRequest) => (
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
          <User className="h-4 w-4 text-gray-400" />
          <span>Requested by: <span className="font-medium">{req.userName}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-blue-500" />
          <span>
            Actual GPS: {req.actualLatitude.toFixed(4)}, {req.actualLongitude.toFixed(4)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-green-500" />
          <span>
            Registered GPS: {req.registeredLatitude.toFixed(4)},{' '}
            {req.registeredLongitude.toFixed(4)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <MapPinOff className="h-4 w-4 text-orange-500" />
          <span className="font-medium text-orange-600 dark:text-orange-400">
            {req.distance >= 1000
              ? `${(req.distance / 1000).toFixed(1)}km away`
              : `${req.distance}m away`}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 text-gray-400" />
          <span>{req.reason}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <span>{formatDateTime(req.createdAt)}</span>
        </div>
      </div>

      {req.status === 'Pending' ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => handleOpenDialog('approve', req.id, 'ool')}
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleOpenDialog('reject', req.id, 'ool')}
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        </div>
      ) : (
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
          <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            Manager Comment
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {req.managerComment || '(No comment)'}
          </p>
          {req.reviewedAt && (
            <p className="mt-1 text-xs text-gray-400">
              Reviewed by {getReviewerName(req.reviewedBy)} on{' '}
              {formatDateTime(req.reviewedAt)}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const renderDataCard = (req: DataUpdateRequest) => (
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
          <User className="h-4 w-4 text-gray-400" />
          <span>Requested by: <span className="font-medium">{req.userName}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <span>
            Update Type:{' '}
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {req.updateType}
            </span>
          </span>
        </div>
        <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Old:</span>
            <span className="break-all text-xs text-red-600 dark:text-red-400">
              {req.oldValue}
            </span>
          </div>
          <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">New:</span>
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
            Approver Role:{' '}
            <span className="font-medium">{ROLE_LABELS[req.approverRole]}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <span>{formatDateTime(req.createdAt)}</span>
        </div>
      </div>

      {req.status === 'Pending' ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => handleOpenDialog('approve', req.id, 'data')}
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleOpenDialog('reject', req.id, 'data')}
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        </div>
      ) : (
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
          <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            Approver Comment
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {req.approverComment || '(No comment)'}
          </p>
          {req.reviewedAt && (
            <p className="mt-1 text-xs text-gray-400">
              Reviewed by {getReviewerName(req.reviewedBy)} on{' '}
              {formatDateTime(req.reviewedAt)}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const renderGpsCard = (req: DataUpdateRequest) => (
    <div
      key={req.id}
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-blue-500" />
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {req.customerName}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {req.customerCode}
            </p>
          </div>
        </div>
        <StatusBadge status={req.status} />
      </div>

      <div className="mb-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-gray-400" />
          <span>Requested by: <span className="font-medium">{req.userName}</span></span>
        </div>
        <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-red-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Old GPS:
            </span>
            <span className="text-xs text-red-600 dark:text-red-400">{req.oldValue}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-green-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              New GPS:
            </span>
            <span className="text-xs text-green-600 dark:text-green-400">{req.newValue}</span>
          </div>
        </div>
        {req.notes && (
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 text-gray-400" />
            <span>{req.notes}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <span>{formatDateTime(req.createdAt)}</span>
        </div>
      </div>

      {req.status === 'Pending' ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => handleOpenDialog('approve', req.id, 'data')}
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleOpenDialog('reject', req.id, 'data')}
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        </div>
      ) : (
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
          <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            Approver Comment
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {req.approverComment || '(No comment)'}
          </p>
          {req.reviewedAt && (
            <p className="mt-1 text-xs text-gray-400">
              Reviewed by {getReviewerName(req.reviewedBy)} on{' '}
              {formatDateTime(req.reviewedAt)}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const statusOptions: (RequestStatus | 'All')[] = ['All', 'Pending', 'Approved', 'Rejected'];
  const updateTypeOptions: (DataUpdateType | 'All')[] = [
    'All',
    'CR Number',
    'VAT Number',
    'National Address',
    'Phone Number',
    'Customer Name',
    'GPS Location',
    'Channel',
  ];

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="Review and manage pending requests"
      />

      <Tabs defaultValue="ool">
        <TabsList className="mb-4 w-full sm:w-auto">
          <TabsTrigger value="ool">Out of Location</TabsTrigger>
          <TabsTrigger value="data">Data Updates</TabsTrigger>
          <TabsTrigger value="gps">GPS Corrections</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Out of Location Requests ─── */}
        <TabsContent value="ool">
          <div className="mb-4 flex items-center gap-3">
            <Filter className="h-4 w-4 text-gray-400" />
            <Select
              value={oolStatusFilter}
              onChange={(e) =>
                setOolStatusFilter(e.target.value as RequestStatus | 'All')
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

          {filteredOolRequests.length === 0 ? (
            <EmptyState
              icon={<MapPinOff className="h-12 w-12" />}
              title="No OOL Requests"
              description="There are no out-of-location requests matching your filters."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredOolRequests.map(renderOolCard)}
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 2: Data Update Requests ─── */}
        <TabsContent value="data">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-gray-400" />
            <Select
              value={dataStatusFilter}
              onChange={(e) =>
                setDataStatusFilter(e.target.value as RequestStatus | 'All')
              }
              className="w-40"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s === 'All' ? 'All Statuses' : s}
                </option>
              ))}
            </Select>
            <Select
              value={dataTypeFilter}
              onChange={(e) =>
                setDataTypeFilter(e.target.value as DataUpdateType | 'All')
              }
              className="w-48"
            >
              {updateTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t === 'All' ? 'All Types' : t}
                </option>
              ))}
            </Select>
          </div>

          {filteredDataRequests.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="No Data Update Requests"
              description="There are no data update requests matching your filters."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDataRequests.map(renderDataCard)}
            </div>
          )}
        </TabsContent>

        {/* ─── Tab 3: GPS Corrections ─── */}
        <TabsContent value="gps">
          {gpsRequests.length === 0 ? (
            <EmptyState
              icon={<MapPin className="h-12 w-12" />}
              title="No GPS Corrections"
              description="There are no GPS correction requests matching your filters."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gpsRequests.map(renderGpsCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Approve / Reject Dialog ─── */}
      <Dialog
        open={actionDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialog(null);
            setComment('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === 'approve' ? 'Approve Request' : 'Reject Request'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="action-comment">Comment</Label>
            <Textarea
              id="action-comment"
              placeholder={
                actionDialog?.type === 'approve'
                  ? 'Add an approval comment (optional)...'
                  : 'Provide a reason for rejection...'
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionDialog(null);
                setComment('');
              }}
            >
              Cancel
            </Button>
            {actionDialog?.type === 'approve' ? (
              <Button
                className="bg-green-600 text-white hover:bg-green-700"
                onClick={handleConfirmAction}
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirm Approve
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleConfirmAction}>
                <XCircle className="h-4 w-4" />
                Confirm Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
