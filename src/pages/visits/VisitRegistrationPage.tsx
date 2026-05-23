import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Store,
  Navigation,
  FileText,
  ClipboardCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import type { Customer, VisitPurpose } from '@/lib/types';
import { cn, generateId } from '@/lib/utils';
import { isWithinRadius, mockCurrentLocation } from '@/lib/gps';
import { PageHeader } from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const STEPS = [
  { label: 'Customer', icon: Store },
  { label: 'GPS', icon: Navigation },
  { label: 'Details', icon: FileText },
  { label: 'Review', icon: ClipboardCheck },
];

export function VisitRegistrationPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { customers, addVisit, addOolRequest, addAuditLog, settings } = useAppStore();

  const [step, setStep] = useState(0);
  const [search, setSearch] = useState('');

  // Step 1
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Step 2
  const [gpsCaptured, setGpsCaptured] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsResult, setGpsResult] = useState<{ within: boolean; distance: number } | null>(null);
  const [oolReason, setOolReason] = useState('');

  // Step 3
  const [purpose, setPurpose] = useState<VisitPurpose | ''>('');
  const [notes, setNotes] = useState('');
  const [photoCaptured, setPhotoCaptured] = useState(false);

  // Filtered customers based on role
  const assignedCustomers = useMemo(() => {
    if (!user) return [];
    switch (user.role) {
      case 'merchandiser':
        return customers.filter((c) => c.salesmanId === user.id);
      case 'supervisor':
        return customers.filter((c) => c.supervisorId === user.id);
      default:
        return customers;
    }
  }, [customers, user]);

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return assignedCustomers;
    const q = search.toLowerCase();
    return assignedCustomers.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        c.customerCode.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.route.toLowerCase().includes(q),
    );
  }, [assignedCustomers, search]);

  const isOutsideRadius = gpsResult ? !gpsResult.within : false;

  const availablePurposes = useMemo(() => {
    let purposes = settings.visitPurposes;
    if (!isOutsideRadius) {
      purposes = purposes.filter((p) => p !== 'Out of Location Request');
    }
    return purposes;
  }, [settings.visitPurposes, isOutsideRadius]);

  // Capture GPS
  const handleCaptureGps = () => {
    if (!selectedCustomer) return;
    // Simulate: randomly within or outside radius
    const withinChance = Math.random() > 0.3; // 70% within
    const coords = mockCurrentLocation(selectedCustomer.latitude, selectedCustomer.longitude, withinChance);
    setUserCoords(coords);
    const result = isWithinRadius(coords.lat, coords.lng, selectedCustomer.latitude, selectedCustomer.longitude, settings.allowedGpsRadius);
    setGpsResult(result);
    setGpsCaptured(true);

    // If within radius and purpose was OOL, reset purpose
    if (result.within && purpose === 'Out of Location Request') {
      setPurpose('');
    }
    // If outside radius, auto-set purpose
    if (!result.within) {
      setPurpose('Out of Location Request');
    }
  };

  // Step validation
  const canProceed = (s: number): boolean => {
    switch (s) {
      case 0:
        return selectedCustomer !== null;
      case 1:
        if (!gpsCaptured || !gpsResult) return false;
        if (isOutsideRadius && !oolReason.trim()) return false;
        return true;
      case 2: {
        if (!purpose) return false;
        if (settings.visitPhotoRequired && !photoCaptured) return false;
        return true;
      }
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < 3 && canProceed(step)) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    // Reset GPS when changing customer
    setGpsCaptured(false);
    setUserCoords(null);
    setGpsResult(null);
    setOolReason('');
    setPurpose('');
  };

  const handleSubmit = () => {
    if (!user || !selectedCustomer || !userCoords || !gpsResult || !purpose) return;

    const visitId = generateId('v');
    const visitStatus = isOutsideRadius ? 'Out of Location' as const : 'Completed' as const;

    const customer = selectedCustomer;

    addVisit({
      id: visitId,
      customerId: customer.id,
      userId: user.id,
      purpose: purpose as VisitPurpose,
      status: visitStatus,
      notes,
      photoUrl: photoCaptured ? 'photo_captured.jpg' : undefined,
      userLatitude: userCoords.lat,
      userLongitude: userCoords.lng,
      customerLatitude: customer.latitude,
      customerLongitude: customer.longitude,
      distance: gpsResult.distance,
      withinRadius: gpsResult.within,
      createdAt: new Date().toISOString(),
    });

    addAuditLog({
      userId: user.id,
      userName: user.fullName,
      role: user.role,
      action: 'visit_submitted',
      entity: 'Visit',
      entityId: visitId,
      oldValue: '',
      newValue: `${purpose} - ${customer.customerCode}`,
      status: visitStatus,
    });

    if (isOutsideRadius) {
      const oolId = generateId('ool');
      addOolRequest({
        id: oolId,
        visitId,
        customerId: customer.id,
        customerCode: customer.customerCode,
        customerName: customer.customerName,
        userId: user.id,
        userName: user.fullName,
        actualLatitude: userCoords.lat,
        actualLongitude: userCoords.lng,
        registeredLatitude: customer.latitude,
        registeredLongitude: customer.longitude,
        distance: gpsResult.distance,
        reason: oolReason,
        status: 'Pending',
        managerComment: '',
        createdAt: new Date().toISOString(),
      });

      addAuditLog({
        userId: user.id,
        userName: user.fullName,
        role: user.role,
        action: 'request_created',
        entity: 'Out of Location Request',
        entityId: oolId,
        oldValue: '',
        newValue: `OOL Request for ${customer.customerCode}`,
        status: 'Pending',
      });
    }

    toast.success('Visit registered successfully');
    navigate('/visits');
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-24 md:pb-6">
      <PageHeader title="Register Visit" subtitle="Record a new customer visit" />

      {/* Step Progress Indicator */}
      <div className="flex items-center justify-between px-0 sm:px-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isCompleted = i < step;
          return (
            <div key={s.label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors sm:h-10 sm:w-10',
                    isActive && 'border-purple-600 bg-purple-600 text-white',
                    isCompleted && 'border-green-500 bg-green-500 text-white',
                    !isActive && !isCompleted && 'border-gray-300 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500',
                  )}
                >
                  {isCompleted ? <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" /> : <Icon className="h-4 w-4 sm:h-5 sm:w-5" />}
                </div>
                <span
                  className={cn(
                    'text-[10px] font-medium sm:text-xs',
                    isActive && 'text-purple-600 dark:text-purple-400',
                    isCompleted && 'text-green-600 dark:text-green-400',
                    !isActive && !isCompleted && 'text-gray-400 dark:text-gray-500',
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-1 mt-[-1rem] h-0.5 flex-1 sm:mx-2',
                    i < step ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
        {/* Step 1: Select Customer */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Select Customer</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search by name, code, city, or route..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="max-h-[400px] space-y-2 overflow-y-auto sm:max-h-[400px]">
              {filteredCustomers.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No customers found</p>
              ) : (
                filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCustomer(c)}
                    className={cn(
                      'w-full rounded-lg border p-4 text-left transition-all hover:shadow-md min-h-[64px]',
                      selectedCustomer?.id === c.id
                        ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-500/20 dark:bg-purple-900/20'
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 dark:text-white">{c.customerName}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{c.customerCode}</p>
                      </div>
                      {selectedCustomer?.id === c.id && (
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-purple-600" />
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-700">{c.channel}</span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-700">{c.city}</span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-700">{c.route}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Step 2: Customer Details & GPS */}
        {step === 1 && selectedCustomer && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Customer Details & GPS</h2>

            {/* Customer info card */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
              <p className="font-semibold text-gray-900 dark:text-white">{selectedCustomer.customerName}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{selectedCustomer.customerCode}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{selectedCustomer.channel}</span>
                <span>&bull;</span>
                <span>{selectedCustomer.city}</span>
                <span>&bull;</span>
                <span>{selectedCustomer.route}</span>
              </div>
            </div>

            {/* Capture GPS button */}
            <Button onClick={handleCaptureGps} className="w-full gap-2 min-h-[52px] text-base" size="lg" variant={gpsCaptured ? 'outline' : 'default'}>
              <MapPin className="h-5 w-5" />
              {gpsCaptured ? 'Recapture GPS' : 'Capture GPS'}
            </Button>

            {gpsCaptured && userCoords && gpsResult && (
              <div className="space-y-4">
                {/* GPS Coordinates */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Your Location</p>
                    <p className="mt-1 font-mono text-sm text-gray-900 dark:text-white">
                      {userCoords.lat.toFixed(6)}, {userCoords.lng.toFixed(6)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Customer Location</p>
                    <p className="mt-1 font-mono text-sm text-gray-900 dark:text-white">
                      {selectedCustomer.latitude.toFixed(6)}, {selectedCustomer.longitude.toFixed(6)}
                    </p>
                  </div>
                </div>

                {/* Distance & Status */}
                <div
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4',
                    gpsResult.within
                      ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                      : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20',
                  )}
                >
                  {gpsResult.within ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                  )}
                  <div className="flex-1">
                    <p
                      className={cn(
                        'font-semibold',
                        gpsResult.within
                          ? 'text-green-800 dark:text-green-300'
                          : 'text-red-800 dark:text-red-300',
                      )}
                    >
                      {gpsResult.within ? 'Within Allowed Radius' : 'Outside Allowed Radius'}
                    </p>
                    <p
                      className={cn(
                        'text-sm',
                        gpsResult.within
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-700 dark:text-red-400',
                      )}
                    >
                      Distance: {gpsResult.distance}m (Max allowed: {settings.allowedGpsRadius}m)
                    </p>
                  </div>
                </div>

                {/* Out of Location section */}
                {isOutsideRadius && (
                  <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                        Out of Location - Justification Required
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id="ool-submit"
                        checked
                        readOnly
                        className="h-4 w-4 text-purple-600"
                      />
                      <label htmlFor="ool-submit" className="text-sm font-medium text-gray-900 dark:text-white">
                        Submit as Out of Location
                      </label>
                    </div>

                    <div>
                      <Label htmlFor="ool-reason">Reason *</Label>
                      <Textarea
                        id="ool-reason"
                        placeholder="Explain why you are outside the allowed radius..."
                        value={oolReason}
                        onChange={(e) => setOolReason(e.target.value)}
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Visit Details */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Visit Details</h2>

            <div>
              <Label htmlFor="visit-purpose">Visit Purpose *</Label>
              <Select
                id="visit-purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as VisitPurpose)}
                className="mt-1"
                disabled={isOutsideRadius && purpose === 'Out of Location Request'}
              >
                <option value="">Select purpose...</option>
                {availablePurposes.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              {isOutsideRadius && purpose === 'Out of Location Request' && (
                <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                  Auto-set to &quot;Out of Location Request&quot; because you are outside the allowed radius
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="visit-notes">Notes</Label>
              <Textarea
                id="visit-notes"
                placeholder="Add any notes about this visit..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Label>Photo</Label>
                {settings.visitPhotoRequired && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    Required
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant={photoCaptured ? 'outline' : 'default'}
                className="mt-1 w-full gap-2 min-h-[48px]"
                size="lg"
                onClick={() => setPhotoCaptured(true)}
              >
                <Camera className="h-5 w-5" />
                {photoCaptured ? 'Photo Captured' : 'Capture Photo'}
              </Button>
              {photoCaptured && (
                <p className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Photo captured successfully
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Review & Submit */}
        {step === 3 && selectedCustomer && gpsResult && userCoords && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Review & Submit</h2>

            <div className="space-y-3">
              {/* Customer */}
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Customer</p>
                <p className="mt-1 font-semibold text-gray-900 dark:text-white">{selectedCustomer.customerName}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedCustomer.customerCode} &bull; {selectedCustomer.channel} &bull; {selectedCustomer.city}
                </p>
              </div>

              {/* GPS */}
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">GPS</p>
                <div className="mt-1 flex items-center gap-2">
                  {gpsResult.within ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="text-sm text-gray-900 dark:text-white">
                    {gpsResult.distance}m {gpsResult.within ? '(Within radius)' : `(Outside - Max: ${settings.allowedGpsRadius}m)`}
                  </span>
                </div>
                {isOutsideRadius && oolReason && (
                  <p className="mt-2 text-sm text-orange-700 dark:text-orange-400">
                    OOL Reason: {oolReason}
                  </p>
                )}
              </div>

              {/* Visit Info */}
              <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Visit Details</p>
                <div className="mt-1 space-y-1">
                  <p className="text-sm text-gray-900 dark:text-white">
                    <span className="font-medium">Purpose:</span> {purpose}
                  </p>
                  <p className="text-sm text-gray-900 dark:text-white">
                    <span className="font-medium">Status:</span>{' '}
                    {isOutsideRadius ? 'Out of Location' : 'Completed'}
                  </p>
                  {notes && (
                    <p className="text-sm text-gray-900 dark:text-white">
                      <span className="font-medium">Notes:</span> {notes}
                    </p>
                  )}
                  <p className="text-sm text-gray-900 dark:text-white">
                    <span className="font-medium">Photo:</span> {photoCaptured ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
            </div>

            <Button onClick={handleSubmit} className="w-full gap-2 min-h-[52px] text-base" size="lg">
              <CheckCircle2 className="h-5 w-5" />
              Submit Visit
            </Button>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={step === 0}
          className="gap-1 min-h-[44px] min-w-[100px]"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        {step < 3 && (
          <Button
            onClick={handleNext}
            disabled={!canProceed(step)}
            className="gap-1 min-h-[44px] min-w-[100px]"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
