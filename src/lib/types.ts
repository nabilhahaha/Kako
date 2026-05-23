export type UserRole = 'admin' | 'manager' | 'supervisor' | 'merchandiser' | 'data_team';

export interface AppUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  email: string;
  phone: string;
  city: string;
  supervisorId?: string;
  managerId?: string;
  isActive: boolean;
}

export type Channel = 'Supermarket' | 'Grocery' | 'Wholesale' | 'Key Account' | 'Mini Market';

export type CustomerStatus = 'Active' | 'Inactive' | 'Suspended';

export interface Customer {
  id: string;
  customerCode: string;
  customerName: string;
  channel: Channel;
  city: string;
  route: string;
  salesmanId: string;
  supervisorId: string;
  latitude: number;
  longitude: number;
  crNumber: string;
  vatNumber: string;
  nationalAddress: string;
  phone: string;
  status: CustomerStatus;
}

export type VisitPurpose =
  | 'Regular Visit'
  | 'Merchandising'
  | 'Collection'
  | 'Order'
  | 'Market Survey'
  | 'Data Update'
  | 'Out of Location Request';

export type VisitStatus = 'Completed' | 'In Progress' | 'Missed' | 'Out of Location';

export interface Visit {
  id: string;
  customerId: string;
  userId: string;
  purpose: VisitPurpose;
  status: VisitStatus;
  notes: string;
  photoUrl?: string;
  userLatitude: number;
  userLongitude: number;
  customerLatitude: number;
  customerLongitude: number;
  distance: number;
  withinRadius: boolean;
  createdAt: string;
}

export type RequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface OutOfLocationRequest {
  id: string;
  visitId: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  userId: string;
  userName: string;
  actualLatitude: number;
  actualLongitude: number;
  registeredLatitude: number;
  registeredLongitude: number;
  distance: number;
  reason: string;
  photoProof?: string;
  status: RequestStatus;
  managerComment: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export type DataUpdateType =
  | 'CR Number'
  | 'VAT Number'
  | 'National Address'
  | 'Phone Number'
  | 'Customer Name'
  | 'GPS Location'
  | 'Channel';

export interface DataUpdateRequest {
  id: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  userId: string;
  userName: string;
  updateType: DataUpdateType;
  oldValue: string;
  newValue: string;
  attachment?: string;
  notes: string;
  status: RequestStatus;
  approverRole: UserRole;
  approverComment: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface ApprovalRouting {
  updateType: DataUpdateType;
  approverRole: UserRole;
}

export interface AppSettings {
  allowedGpsRadius: number;
  visitPhotoRequired: boolean;
  mandatoryNotes: boolean;
  visitPurposes: VisitPurpose[];
  cities: string[];
  routes: string[];
  approvalRouting: ApprovalRouting[];
}

export type AuditAction =
  | 'visit_submitted'
  | 'request_created'
  | 'request_approved'
  | 'request_rejected'
  | 'customer_gps_updated'
  | 'customer_data_changed'
  | 'customer_created'
  | 'user_login'
  | 'settings_changed';

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  role: UserRole;
  action: AuditAction;
  entity: string;
  entityId: string;
  oldValue: string;
  newValue: string;
  status: string;
}
