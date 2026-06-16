import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalVisit } from '@/lib/db';
import { enqueue } from '@/lib/sync';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/stores/session';
import { uuid } from '@/lib/uuid';

export interface NewVisitInput {
  customerId: string | null;
  customerName: string | null;
  visitType: string;
  objective: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

// Create a visit OFFLINE-FIRST: persist locally + enqueue. Returns the id
// immediately so the UI can proceed in well under a second.
export async function createVisit(input: NewVisitInput): Promise<string> {
  const profile = useSession.getState().profile;
  const id = uuid();
  const now = new Date().toISOString();
  const local: LocalVisit = {
    id,
    customer_id: input.customerId,
    customer_name: input.customerName,
    location_id: null,
    visit_type: input.visitType,
    status: 'in_progress',
    objective: input.objective,
    summary: null,
    outcome: null,
    start_latitude: input.latitude,
    start_longitude: input.longitude,
    gps_accuracy_m: input.accuracy,
    started_at: now,
    ended_at: null,
    area_id: profile?.areaId ?? null,
    region_id: profile?.regionId ?? null,
    sync_status: 'pending',
    updatedAt: now,
  };
  await db.visits.put(local);
  await enqueue('visits', 'insert', {
    id,
    customer_id: input.customerId,
    user_id: profile?.userId,
    visit_type: input.visitType,
    status: 'in_progress',
    objective: input.objective,
    start_latitude: input.latitude,
    start_longitude: input.longitude,
    gps_accuracy_m: input.accuracy,
    started_at: now,
    area_id: profile?.areaId ?? null,
    region_id: profile?.regionId ?? null,
  });
  return id;
}

export async function completeVisit(id: string, summary: string, outcome: string): Promise<void> {
  const now = new Date().toISOString();
  await db.visits.update(id, { status: 'completed', summary, outcome, ended_at: now, updatedAt: now });
  await enqueue('visits', 'update', { id, status: 'completed', summary, outcome, ended_at: now });
}

export function useLocalVisits() {
  return useLiveQuery(() => db.visits.orderBy('updatedAt').reverse().toArray(), [], []);
}

export function useVisit(id: string | undefined) {
  return useLiveQuery(async () => (id ? db.visits.get(id) : undefined), [id]);
}

export interface CustomerOption {
  id: string;
  name: string;
}

export function useCustomers() {
  return useQuery({
    queryKey: ['customers', 'options'],
    queryFn: async (): Promise<CustomerOption[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('customers')
        .select('id, name')
        .is('deleted_at', null)
        .order('name')
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}
