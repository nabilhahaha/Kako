import type {
  AppUser, Customer, Visit, OutOfLocationRequest, DataUpdateRequest,
  AuditLog, AppSettings, UserRole,
} from '@/lib/types';

export const mockUsers: AppUser[] = [
  { id: 'u1', username: 'admin', fullName: 'Ahmed Al-Rashid', role: 'admin', email: 'admin@ffpro.com', phone: '+966501000001', city: 'Riyadh', isActive: true },
  { id: 'u2', username: 'manager', fullName: 'Khalid Al-Dosari', role: 'manager', email: 'khalid@ffpro.com', phone: '+966501000002', city: 'Riyadh', managerId: 'u1', isActive: true },
  { id: 'u3', username: 'manager2', fullName: 'Omar Al-Harbi', role: 'manager', email: 'omar@ffpro.com', phone: '+966501000003', city: 'Jeddah', managerId: 'u1', isActive: true },
  { id: 'u4', username: 'supervisor1', fullName: 'Faisal Al-Otaibi', role: 'supervisor', email: 'faisal@ffpro.com', phone: '+966501000004', city: 'Riyadh', managerId: 'u2', isActive: true },
  { id: 'u5', username: 'supervisor2', fullName: 'Nasser Al-Qahtani', role: 'supervisor', email: 'nasser@ffpro.com', phone: '+966501000005', city: 'Riyadh', managerId: 'u2', isActive: true },
  { id: 'u6', username: 'supervisor3', fullName: 'Tariq Al-Shehri', role: 'supervisor', email: 'tariq@ffpro.com', phone: '+966501000006', city: 'Jeddah', managerId: 'u3', isActive: true },
  { id: 'u7', username: 'supervisor4', fullName: 'Majed Al-Zahrani', role: 'supervisor', email: 'majed@ffpro.com', phone: '+966501000007', city: 'Dammam', managerId: 'u3', isActive: true },
  { id: 'u8', username: 'supervisor5', fullName: 'Sultan Al-Ghamdi', role: 'supervisor', email: 'sultan@ffpro.com', phone: '+966501000008', city: 'Makkah', managerId: 'u2', isActive: true },
  { id: 'u9', username: 'merch1', fullName: 'Youssef Al-Malki', role: 'merchandiser', email: 'youssef@ffpro.com', phone: '+966501000009', city: 'Riyadh', supervisorId: 'u4', managerId: 'u2', isActive: true },
  { id: 'u10', username: 'merch2', fullName: 'Abdullah Al-Mutairi', role: 'merchandiser', email: 'abdullah@ffpro.com', phone: '+966501000010', city: 'Riyadh', supervisorId: 'u4', managerId: 'u2', isActive: true },
  { id: 'u11', username: 'merch3', fullName: 'Hassan Al-Tamimi', role: 'merchandiser', email: 'hassan@ffpro.com', phone: '+966501000011', city: 'Riyadh', supervisorId: 'u5', managerId: 'u2', isActive: true },
  { id: 'u12', username: 'merch4', fullName: 'Bader Al-Subaie', role: 'merchandiser', email: 'bader@ffpro.com', phone: '+966501000012', city: 'Jeddah', supervisorId: 'u6', managerId: 'u3', isActive: true },
  { id: 'u13', username: 'merch5', fullName: 'Fahad Al-Anazi', role: 'merchandiser', email: 'fahad@ffpro.com', phone: '+966501000013', city: 'Jeddah', supervisorId: 'u6', managerId: 'u3', isActive: true },
  { id: 'u14', username: 'merch6', fullName: 'Saad Al-Shamrani', role: 'merchandiser', email: 'saad@ffpro.com', phone: '+966501000014', city: 'Dammam', supervisorId: 'u7', managerId: 'u3', isActive: true },
  { id: 'u15', username: 'merch7', fullName: 'Waleed Al-Juhani', role: 'merchandiser', email: 'waleed@ffpro.com', phone: '+966501000015', city: 'Dammam', supervisorId: 'u7', managerId: 'u3', isActive: true },
  { id: 'u16', username: 'merch8', fullName: 'Rami Al-Harthy', role: 'merchandiser', email: 'rami@ffpro.com', phone: '+966501000016', city: 'Makkah', supervisorId: 'u8', managerId: 'u2', isActive: true },
  { id: 'u17', username: 'merch9', fullName: 'Mazen Al-Dossary', role: 'merchandiser', email: 'mazen@ffpro.com', phone: '+966501000017', city: 'Riyadh', supervisorId: 'u5', managerId: 'u2', isActive: true },
  { id: 'u18', username: 'merch10', fullName: 'Zaid Al-Ahmadi', role: 'merchandiser', email: 'zaid@ffpro.com', phone: '+966501000018', city: 'Makkah', supervisorId: 'u8', managerId: 'u2', isActive: true },
  { id: 'u19', username: 'datateam', fullName: 'Sami Al-Rashidi', role: 'data_team', email: 'sami@ffpro.com', phone: '+966501000019', city: 'Riyadh', isActive: true },
  { id: 'u20', username: 'datateam2', fullName: 'Hani Al-Balawi', role: 'data_team', email: 'hani@ffpro.com', phone: '+966501000020', city: 'Riyadh', isActive: true },
];

export const mockCustomers: Customer[] = [
  { id: 'c1', customerCode: 'CUS-001', customerName: 'Panda Supermarket - Olaya', channel: 'Supermarket', city: 'Riyadh', route: 'RIY-01', salesmanId: 'u9', supervisorId: 'u4', latitude: 24.7136, longitude: 46.6753, crNumber: '1010234567', vatNumber: '300012345600003', nationalAddress: 'RRRD2929, Olaya, Riyadh 12241', phone: '+966112345001', status: 'Active' },
  { id: 'c2', customerCode: 'CUS-002', customerName: 'Tamimi Markets - Tahlia', channel: 'Key Account', city: 'Riyadh', route: 'RIY-01', salesmanId: 'u9', supervisorId: 'u4', latitude: 24.6980, longitude: 46.6850, crNumber: '1010234568', vatNumber: '300012345600004', nationalAddress: 'RRRD3030, Tahlia, Riyadh 12252', phone: '+966112345002', status: 'Active' },
  { id: 'c3', customerCode: 'CUS-003', customerName: 'Al-Othaim Mall Market', channel: 'Supermarket', city: 'Riyadh', route: 'RIY-02', salesmanId: 'u10', supervisorId: 'u4', latitude: 24.7400, longitude: 46.6530, crNumber: '1010234569', vatNumber: '300012345600005', nationalAddress: 'RRRD4040, Al-Rabwa, Riyadh 12345', phone: '+966112345003', status: 'Active' },
  { id: 'c4', customerCode: 'CUS-004', customerName: 'Seoudi Grocery - Exit 5', channel: 'Grocery', city: 'Riyadh', route: 'RIY-02', salesmanId: 'u10', supervisorId: 'u4', latitude: 24.7250, longitude: 46.7100, crNumber: '1010234570', vatNumber: '300012345600006', nationalAddress: 'RRRD5050, Al-Nakheel, Riyadh 12384', phone: '+966112345004', status: 'Active' },
  { id: 'c5', customerCode: 'CUS-005', customerName: 'Abdullah Wholesale Center', channel: 'Wholesale', city: 'Riyadh', route: 'RIY-03', salesmanId: 'u11', supervisorId: 'u5', latitude: 24.6900, longitude: 46.7200, crNumber: '1010234571', vatNumber: '300012345600007', nationalAddress: 'RRRD6060, Al-Batha, Riyadh 12445', phone: '+966112345005', status: 'Active' },
  { id: 'c6', customerCode: 'CUS-006', customerName: 'Al-Raya Mini Market', channel: 'Mini Market', city: 'Riyadh', route: 'RIY-03', salesmanId: 'u11', supervisorId: 'u5', latitude: 24.6820, longitude: 46.6950, crNumber: '1010234572', vatNumber: '300012345600008', nationalAddress: 'RRRD7070, Al-Malaz, Riyadh 12836', phone: '+966112345006', status: 'Active' },
  { id: 'c7', customerCode: 'CUS-007', customerName: 'Danube Hypermarket - Jeddah', channel: 'Key Account', city: 'Jeddah', route: 'JED-01', salesmanId: 'u12', supervisorId: 'u6', latitude: 21.5433, longitude: 39.1728, crNumber: '4030234567', vatNumber: '300012345600009', nationalAddress: 'JJJD1010, Al-Hamra, Jeddah 21412', phone: '+966122345001', status: 'Active' },
  { id: 'c8', customerCode: 'CUS-008', customerName: 'Bin Dawood Supermarket', channel: 'Supermarket', city: 'Jeddah', route: 'JED-01', salesmanId: 'u12', supervisorId: 'u6', latitude: 21.5200, longitude: 39.1900, crNumber: '4030234568', vatNumber: '300012345600010', nationalAddress: 'JJJD2020, Al-Rawdah, Jeddah 21432', phone: '+966122345002', status: 'Active' },
  { id: 'c9', customerCode: 'CUS-009', customerName: 'Jeddah Fresh Grocery', channel: 'Grocery', city: 'Jeddah', route: 'JED-02', salesmanId: 'u13', supervisorId: 'u6', latitude: 21.5600, longitude: 39.1500, crNumber: '4030234569', vatNumber: '300012345600011', nationalAddress: 'JJJD3030, Al-Safa, Jeddah 21453', phone: '+966122345003', status: 'Active' },
  { id: 'c10', customerCode: 'CUS-010', customerName: 'Al-Sadhan Market - Jeddah', channel: 'Mini Market', city: 'Jeddah', route: 'JED-02', salesmanId: 'u13', supervisorId: 'u6', latitude: 21.4800, longitude: 39.2000, crNumber: '4030234570', vatNumber: '300012345600012', nationalAddress: 'JJJD4040, Al-Faiha, Jeddah 21474', phone: '+966122345004', status: 'Inactive' },
  { id: 'c11', customerCode: 'CUS-011', customerName: 'Eastern Province Wholesale', channel: 'Wholesale', city: 'Dammam', route: 'DMM-01', salesmanId: 'u14', supervisorId: 'u7', latitude: 26.3927, longitude: 49.9777, crNumber: '2050234567', vatNumber: '300012345600013', nationalAddress: 'DDMD1010, Al-Faisaliah, Dammam 31411', phone: '+966132345001', status: 'Active' },
  { id: 'c12', customerCode: 'CUS-012', customerName: 'Lulu Hypermarket - Dammam', channel: 'Key Account', city: 'Dammam', route: 'DMM-01', salesmanId: 'u14', supervisorId: 'u7', latitude: 26.4100, longitude: 50.0800, crNumber: '2050234568', vatNumber: '300012345600014', nationalAddress: 'DDMD2020, Al-Shati, Dammam 31425', phone: '+966132345002', status: 'Active' },
  { id: 'c13', customerCode: 'CUS-013', customerName: 'Farm Superstores - Dammam', channel: 'Supermarket', city: 'Dammam', route: 'DMM-02', salesmanId: 'u15', supervisorId: 'u7', latitude: 26.4300, longitude: 50.1100, crNumber: '2050234569', vatNumber: '300012345600015', nationalAddress: 'DDMD3030, Corniche, Dammam 31436', phone: '+966132345003', status: 'Active' },
  { id: 'c14', customerCode: 'CUS-014', customerName: 'Al-Jazirah Mini Mart', channel: 'Mini Market', city: 'Dammam', route: 'DMM-02', salesmanId: 'u15', supervisorId: 'u7', latitude: 26.4000, longitude: 50.0500, crNumber: '2050234570', vatNumber: '300012345600016', nationalAddress: 'DDMD4040, Al-Nuzha, Dammam 31447', phone: '+966132345004', status: 'Active' },
  { id: 'c15', customerCode: 'CUS-015', customerName: 'Makkah Central Grocery', channel: 'Grocery', city: 'Makkah', route: 'MAK-01', salesmanId: 'u16', supervisorId: 'u8', latitude: 21.4225, longitude: 39.8262, crNumber: '5720234567', vatNumber: '300012345600017', nationalAddress: 'MMMD1010, Al-Aziziyah, Makkah 21955', phone: '+966125345001', status: 'Active' },
  { id: 'c16', customerCode: 'CUS-016', customerName: 'Carrefour - Makkah', channel: 'Key Account', city: 'Makkah', route: 'MAK-01', salesmanId: 'u16', supervisorId: 'u8', latitude: 21.4100, longitude: 39.8400, crNumber: '5720234568', vatNumber: '300012345600018', nationalAddress: 'MMMD2020, Al-Shoqiyah, Makkah 21966', phone: '+966125345002', status: 'Active' },
  { id: 'c17', customerCode: 'CUS-017', customerName: 'Riyadh Wholesale Hub', channel: 'Wholesale', city: 'Riyadh', route: 'RIY-03', salesmanId: 'u17', supervisorId: 'u5', latitude: 24.7500, longitude: 46.7350, crNumber: '1010234573', vatNumber: '300012345600019', nationalAddress: 'RRRD8080, Industrial Area, Riyadh 12456', phone: '+966112345007', status: 'Active' },
  { id: 'c18', customerCode: 'CUS-018', customerName: 'Makkah Fresh Mini Market', channel: 'Mini Market', city: 'Makkah', route: 'MAK-02', salesmanId: 'u18', supervisorId: 'u8', latitude: 21.4350, longitude: 39.8100, crNumber: '5720234569', vatNumber: '300012345600020', nationalAddress: 'MMMD3030, Al-Naseem, Makkah 21977', phone: '+966125345003', status: 'Active' },
  { id: 'c19', customerCode: 'CUS-019', customerName: 'Al-Madinah Supermarket', channel: 'Supermarket', city: 'Riyadh', route: 'RIY-02', salesmanId: 'u17', supervisorId: 'u5', latitude: 24.7000, longitude: 46.7400, crNumber: '1010234574', vatNumber: '300012345600021', nationalAddress: 'RRRD9090, Al-Sulay, Riyadh 12467', phone: '+966112345008', status: 'Suspended' },
  { id: 'c20', customerCode: 'CUS-020', customerName: 'Makkah Grand Wholesale', channel: 'Wholesale', city: 'Makkah', route: 'MAK-02', salesmanId: 'u18', supervisorId: 'u8', latitude: 21.4450, longitude: 39.8050, crNumber: '5720234570', vatNumber: '300012345600022', nationalAddress: 'MMMD4040, Al-Rusaifah, Makkah 21988', phone: '+966125345004', status: 'Active' },
];

function d(daysAgo: number, h = 9, m = 0): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - daysAgo);
  dt.setHours(h, m, 0, 0);
  return dt.toISOString();
}

export const mockVisits: Visit[] = [
  { id: 'v1', customerId: 'c1', userId: 'u9', purpose: 'Regular Visit', status: 'Completed', notes: 'Shelves well stocked', userLatitude: 24.7137, userLongitude: 46.6754, customerLatitude: 24.7136, customerLongitude: 46.6753, distance: 15, withinRadius: true, createdAt: d(0, 9, 30) },
  { id: 'v2', customerId: 'c2', userId: 'u9', purpose: 'Merchandising', status: 'Completed', notes: 'New display installed', userLatitude: 24.6981, userLongitude: 46.6851, customerLatitude: 24.6980, customerLongitude: 46.6850, distance: 12, withinRadius: true, createdAt: d(0, 11, 0) },
  { id: 'v3', customerId: 'c3', userId: 'u10', purpose: 'Order', status: 'Completed', notes: 'Monthly reorder placed', userLatitude: 24.7401, userLongitude: 46.6531, customerLatitude: 24.7400, customerLongitude: 46.6530, distance: 18, withinRadius: true, createdAt: d(0, 10, 15) },
  { id: 'v4', customerId: 'c4', userId: 'u10', purpose: 'Regular Visit', status: 'Missed', notes: 'Store closed', userLatitude: 24.7250, userLongitude: 46.7100, customerLatitude: 24.7250, customerLongitude: 46.7100, distance: 0, withinRadius: true, createdAt: d(0, 14, 0) },
  { id: 'v5', customerId: 'c5', userId: 'u11', purpose: 'Collection', status: 'Completed', notes: 'Payment collected SAR 15,000', userLatitude: 24.6901, userLongitude: 46.7201, customerLatitude: 24.6900, customerLongitude: 46.7200, distance: 14, withinRadius: true, createdAt: d(0, 9, 0) },
  { id: 'v6', customerId: 'c7', userId: 'u12', purpose: 'Regular Visit', status: 'Out of Location', notes: 'Customer relocated temporarily', userLatitude: 21.5500, userLongitude: 39.1800, customerLatitude: 21.5433, customerLongitude: 39.1728, distance: 950, withinRadius: false, createdAt: d(0, 10, 30) },
  { id: 'v7', customerId: 'c8', userId: 'u12', purpose: 'Merchandising', status: 'Completed', notes: 'Promo display set up', userLatitude: 21.5201, userLongitude: 39.1901, customerLatitude: 21.5200, customerLongitude: 39.1900, distance: 11, withinRadius: true, createdAt: d(0, 13, 0) },
  { id: 'v8', customerId: 'c11', userId: 'u14', purpose: 'Order', status: 'Completed', notes: 'Bulk order for Ramadan', userLatitude: 26.3928, userLongitude: 49.9778, customerLatitude: 26.3927, customerLongitude: 49.9777, distance: 16, withinRadius: true, createdAt: d(0, 8, 45) },
  { id: 'v9', customerId: 'c15', userId: 'u16', purpose: 'Market Survey', status: 'Completed', notes: 'Competitor pricing survey', userLatitude: 21.4226, userLongitude: 39.8263, customerLatitude: 21.4225, customerLongitude: 39.8262, distance: 13, withinRadius: true, createdAt: d(0, 11, 30) },
  { id: 'v10', customerId: 'c6', userId: 'u11', purpose: 'Regular Visit', status: 'Completed', notes: 'Stock level check done', userLatitude: 24.6821, userLongitude: 46.6951, customerLatitude: 24.6820, customerLongitude: 46.6950, distance: 10, withinRadius: true, createdAt: d(1, 9, 30) },
  { id: 'v11', customerId: 'c9', userId: 'u13', purpose: 'Data Update', status: 'Completed', notes: 'Updated phone number', userLatitude: 21.5601, userLongitude: 39.1501, customerLatitude: 21.5600, customerLongitude: 39.1500, distance: 9, withinRadius: true, createdAt: d(1, 10, 0) },
  { id: 'v12', customerId: 'c12', userId: 'u14', purpose: 'Regular Visit', status: 'Out of Location', notes: 'GPS inaccurate in mall parking', userLatitude: 26.4200, userLongitude: 50.0900, customerLatitude: 26.4100, customerLongitude: 50.0800, distance: 1400, withinRadius: false, createdAt: d(1, 14, 0) },
  { id: 'v13', customerId: 'c16', userId: 'u16', purpose: 'Merchandising', status: 'Completed', notes: 'Shelf space expanded', userLatitude: 21.4101, userLongitude: 39.8401, customerLatitude: 21.4100, customerLongitude: 39.8400, distance: 8, withinRadius: true, createdAt: d(1, 11, 0) },
  { id: 'v14', customerId: 'c17', userId: 'u17', purpose: 'Collection', status: 'Completed', notes: 'Collected SAR 8,500', userLatitude: 24.7501, userLongitude: 46.7351, customerLatitude: 24.7500, customerLongitude: 46.7350, distance: 20, withinRadius: true, createdAt: d(1, 13, 30) },
  { id: 'v15', customerId: 'c13', userId: 'u15', purpose: 'Regular Visit', status: 'Missed', notes: 'Traffic delay, store closed early', userLatitude: 26.4300, userLongitude: 50.1100, customerLatitude: 26.4300, customerLongitude: 50.1100, distance: 0, withinRadius: true, createdAt: d(2, 15, 0) },
  { id: 'v16', customerId: 'c1', userId: 'u9', purpose: 'Order', status: 'Completed', notes: 'Weekly restocking order', userLatitude: 24.7137, userLongitude: 46.6754, customerLatitude: 24.7136, customerLongitude: 46.6753, distance: 12, withinRadius: true, createdAt: d(2, 9, 0) },
  { id: 'v17', customerId: 'c14', userId: 'u15', purpose: 'Regular Visit', status: 'Completed', notes: 'Product placement optimized', userLatitude: 26.4001, userLongitude: 50.0501, customerLatitude: 26.4000, customerLongitude: 50.0500, distance: 17, withinRadius: true, createdAt: d(2, 10, 0) },
  { id: 'v18', customerId: 'c18', userId: 'u18', purpose: 'Regular Visit', status: 'Completed', notes: 'Good product movement', userLatitude: 21.4351, userLongitude: 39.8101, customerLatitude: 21.4350, customerLongitude: 39.8100, distance: 9, withinRadius: true, createdAt: d(3, 9, 30) },
  { id: 'v19', customerId: 'c20', userId: 'u18', purpose: 'Market Survey', status: 'Completed', notes: 'Competitor analysis completed', userLatitude: 21.4451, userLongitude: 39.8051, customerLatitude: 21.4450, customerLongitude: 39.8050, distance: 14, withinRadius: true, createdAt: d(3, 11, 0) },
  { id: 'v20', customerId: 'c2', userId: 'u9', purpose: 'Regular Visit', status: 'Completed', notes: 'Promo materials delivered', userLatitude: 24.6981, userLongitude: 46.6851, customerLatitude: 24.6980, customerLongitude: 46.6850, distance: 10, withinRadius: true, createdAt: d(4, 10, 0) },
  { id: 'v21', customerId: 'c7', userId: 'u12', purpose: 'Order', status: 'Completed', notes: 'Quarterly order placed', userLatitude: 21.5434, userLongitude: 39.1729, customerLatitude: 21.5433, customerLongitude: 39.1728, distance: 13, withinRadius: true, createdAt: d(4, 9, 30) },
  { id: 'v22', customerId: 'c3', userId: 'u10', purpose: 'Merchandising', status: 'Completed', notes: 'Planogram compliance check', userLatitude: 24.7401, userLongitude: 46.6531, customerLatitude: 24.7400, customerLongitude: 46.6530, distance: 11, withinRadius: true, createdAt: d(5, 10, 0) },
  { id: 'v23', customerId: 'c10', userId: 'u13', purpose: 'Regular Visit', status: 'Missed', notes: 'Customer unavailable', userLatitude: 21.4800, userLongitude: 39.2000, customerLatitude: 21.4800, customerLongitude: 39.2000, distance: 0, withinRadius: true, createdAt: d(5, 14, 30) },
  { id: 'v24', customerId: 'c5', userId: 'u11', purpose: 'Regular Visit', status: 'Out of Location', notes: 'New warehouse location', userLatitude: 24.6950, userLongitude: 46.7300, customerLatitude: 24.6900, customerLongitude: 46.7200, distance: 1200, withinRadius: false, createdAt: d(6, 9, 0) },
  { id: 'v25', customerId: 'c19', userId: 'u17', purpose: 'Regular Visit', status: 'Completed', notes: 'Stock audit completed', userLatitude: 24.7001, userLongitude: 46.7401, customerLatitude: 24.7000, customerLongitude: 46.7400, distance: 15, withinRadius: true, createdAt: d(6, 11, 0) },
];

export const mockOutOfLocationRequests: OutOfLocationRequest[] = [
  { id: 'ool1', visitId: 'v6', customerId: 'c7', customerCode: 'CUS-007', customerName: 'Danube Hypermarket - Jeddah', userId: 'u12', userName: 'Bader Al-Subaie', actualLatitude: 21.5500, actualLongitude: 39.1800, registeredLatitude: 21.5433, registeredLongitude: 39.1728, distance: 950, reason: 'Customer temporarily relocated to new wing of mall during renovation', status: 'Pending', managerComment: '', createdAt: d(0, 10, 35) },
  { id: 'ool2', visitId: 'v12', customerId: 'c12', customerCode: 'CUS-012', customerName: 'Lulu Hypermarket - Dammam', userId: 'u14', userName: 'Saad Al-Shamrani', actualLatitude: 26.4200, actualLongitude: 50.0900, registeredLatitude: 26.4100, registeredLongitude: 50.0800, distance: 1400, reason: 'GPS signal weak in underground parking area', status: 'Approved', managerComment: 'Known GPS issue at this location. Approved.', createdAt: d(1, 14, 5), reviewedAt: d(1, 16, 0), reviewedBy: 'u3' },
  { id: 'ool3', visitId: 'v24', customerId: 'c5', customerCode: 'CUS-005', customerName: 'Abdullah Wholesale Center', userId: 'u11', userName: 'Hassan Al-Tamimi', actualLatitude: 24.6950, actualLongitude: 46.7300, registeredLatitude: 24.6900, registeredLongitude: 46.7200, distance: 1200, reason: 'Customer moved to a new warehouse address. GPS needs update.', status: 'Rejected', managerComment: 'Please coordinate with data team to update customer address first.', createdAt: d(6, 9, 5), reviewedAt: d(6, 11, 0), reviewedBy: 'u2' },
  { id: 'ool4', visitId: 'v6', customerId: 'c9', customerCode: 'CUS-009', customerName: 'Jeddah Fresh Grocery', userId: 'u13', userName: 'Fahad Al-Anazi', actualLatitude: 21.5650, actualLongitude: 39.1550, registeredLatitude: 21.5600, registeredLongitude: 39.1500, distance: 700, reason: 'Customer entrance moved due to road construction', status: 'Pending', managerComment: '', createdAt: d(0, 15, 20) },
];

export const mockDataUpdateRequests: DataUpdateRequest[] = [
  { id: 'dur1', customerId: 'c5', customerCode: 'CUS-005', customerName: 'Abdullah Wholesale Center', userId: 'u11', userName: 'Hassan Al-Tamimi', updateType: 'GPS Location', oldValue: '24.6900, 46.7200', newValue: '24.6950, 46.7300', notes: 'Customer relocated to new warehouse', status: 'Pending', approverRole: 'manager', approverComment: '', createdAt: d(1) },
  { id: 'dur2', customerId: 'c9', customerCode: 'CUS-009', customerName: 'Jeddah Fresh Grocery', userId: 'u13', userName: 'Fahad Al-Anazi', updateType: 'Phone Number', oldValue: '+966122345003', newValue: '+966122345099', notes: 'New manager phone number', status: 'Approved', approverRole: 'data_team', approverComment: 'Verified with customer', createdAt: d(3), reviewedAt: d(2), reviewedBy: 'u19' },
  { id: 'dur3', customerId: 'c12', customerCode: 'CUS-012', customerName: 'Lulu Hypermarket - Dammam', userId: 'u14', userName: 'Saad Al-Shamrani', updateType: 'CR Number', oldValue: '2050234568', newValue: '2050234999', notes: 'CR renewed with new number', status: 'Pending', approverRole: 'data_team', approverComment: '', createdAt: d(0) },
  { id: 'dur4', customerId: 'c16', customerCode: 'CUS-016', customerName: 'Carrefour - Makkah', userId: 'u16', userName: 'Rami Al-Harthy', updateType: 'National Address', oldValue: 'MMMD2020, Al-Shoqiyah, Makkah 21966', newValue: 'MMMD2025, Al-Shoqiyah District, Makkah 21966', notes: 'Address format updated per new standard', status: 'Pending', approverRole: 'data_team', approverComment: '', createdAt: d(0) },
  { id: 'dur5', customerId: 'c1', customerCode: 'CUS-001', customerName: 'Panda Supermarket - Olaya', userId: 'u9', userName: 'Youssef Al-Malki', updateType: 'Channel', oldValue: 'Supermarket', newValue: 'Key Account', notes: 'Upgraded to Key Account status', status: 'Rejected', approverRole: 'admin', approverComment: 'Does not meet Key Account volume threshold', createdAt: d(5), reviewedAt: d(4), reviewedBy: 'u1' },
  { id: 'dur6', customerId: 'c3', customerCode: 'CUS-003', customerName: 'Al-Othaim Mall Market', userId: 'u10', userName: 'Abdullah Al-Mutairi', updateType: 'VAT Number', oldValue: '300012345600005', newValue: '300012345600055', notes: 'VAT certificate renewed', status: 'Pending', approverRole: 'data_team', approverComment: '', createdAt: d(0) },
];

export const mockAuditLogs: AuditLog[] = [
  { id: 'al1', timestamp: d(0, 9, 30), userId: 'u9', userName: 'Youssef Al-Malki', role: 'merchandiser', action: 'visit_submitted', entity: 'Visit', entityId: 'v1', oldValue: '', newValue: 'Regular Visit - CUS-001', status: 'Completed' },
  { id: 'al2', timestamp: d(0, 10, 35), userId: 'u12', userName: 'Bader Al-Subaie', role: 'merchandiser', action: 'request_created', entity: 'Out of Location Request', entityId: 'ool1', oldValue: '', newValue: 'OOL Request for CUS-007', status: 'Pending' },
  { id: 'al3', timestamp: d(1, 16, 0), userId: 'u3', userName: 'Omar Al-Harbi', role: 'manager', action: 'request_approved', entity: 'Out of Location Request', entityId: 'ool2', oldValue: 'Pending', newValue: 'Approved', status: 'Approved' },
  { id: 'al4', timestamp: d(6, 11, 0), userId: 'u2', userName: 'Khalid Al-Dosari', role: 'manager', action: 'request_rejected', entity: 'Out of Location Request', entityId: 'ool3', oldValue: 'Pending', newValue: 'Rejected', status: 'Rejected' },
  { id: 'al5', timestamp: d(2), userId: 'u19', userName: 'Sami Al-Rashidi', role: 'data_team', action: 'request_approved', entity: 'Data Update Request', entityId: 'dur2', oldValue: 'Pending', newValue: 'Approved', status: 'Approved' },
  { id: 'al6', timestamp: d(2), userId: 'u19', userName: 'Sami Al-Rashidi', role: 'data_team', action: 'customer_data_changed', entity: 'Customer', entityId: 'c9', oldValue: '+966122345003', newValue: '+966122345099', status: 'Applied' },
  { id: 'al7', timestamp: d(4), userId: 'u1', userName: 'Ahmed Al-Rashid', role: 'admin', action: 'request_rejected', entity: 'Data Update Request', entityId: 'dur5', oldValue: 'Pending', newValue: 'Rejected', status: 'Rejected' },
  { id: 'al8', timestamp: d(0, 8, 0), userId: 'u1', userName: 'Ahmed Al-Rashid', role: 'admin', action: 'user_login', entity: 'User', entityId: 'u1', oldValue: '', newValue: 'Login', status: 'Success' },
  { id: 'al9', timestamp: d(0, 8, 5), userId: 'u2', userName: 'Khalid Al-Dosari', role: 'manager', action: 'user_login', entity: 'User', entityId: 'u2', oldValue: '', newValue: 'Login', status: 'Success' },
  { id: 'al10', timestamp: d(0, 8, 10), userId: 'u9', userName: 'Youssef Al-Malki', role: 'merchandiser', action: 'user_login', entity: 'User', entityId: 'u9', oldValue: '', newValue: 'Login', status: 'Success' },
];

export const mockSettings: AppSettings = {
  allowedGpsRadius: 200,
  visitPhotoRequired: true,
  mandatoryNotes: false,
  visitPurposes: ['Regular Visit', 'Merchandising', 'Collection', 'Order', 'Market Survey', 'Data Update', 'Out of Location Request'],
  cities: ['Riyadh', 'Jeddah', 'Dammam', 'Makkah', 'Madinah'],
  routes: ['RIY-01', 'RIY-02', 'RIY-03', 'JED-01', 'JED-02', 'DMM-01', 'DMM-02', 'MAK-01', 'MAK-02'],
  approvalRouting: [
    { updateType: 'GPS Location', approverRole: 'manager' },
    { updateType: 'CR Number', approverRole: 'data_team' },
    { updateType: 'VAT Number', approverRole: 'data_team' },
    { updateType: 'National Address', approverRole: 'data_team' },
    { updateType: 'Phone Number', approverRole: 'data_team' },
    { updateType: 'Customer Name', approverRole: 'data_team' },
    { updateType: 'Channel', approverRole: 'admin' },
  ],
};

export const roleCredentials: Record<string, { username: string; role: UserRole }> = {
  admin: { username: 'admin', role: 'admin' },
  manager: { username: 'manager', role: 'manager' },
  supervisor: { username: 'supervisor1', role: 'supervisor' },
  merchandiser: { username: 'merch1', role: 'merchandiser' },
  data_team: { username: 'datateam', role: 'data_team' },
};
