import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useQueryClient } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { PERSIST_MAX_AGE, persister, queryClient } from '@/lib/queryClient'
import { syncOutbox } from '@/lib/sync'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { AdminScopeProvider } from '@/hooks/useAdminScope'
import { ThemeProvider } from '@/hooks/useTheme'
import { LocationProvider } from '@/hooks/useLocation'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from '@/components/ui/toast'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CustomersPage } from '@/pages/CustomersPage'
import { CustomerDetailPage } from '@/pages/CustomerDetailPage'
import { NewVisitPage } from '@/pages/NewVisitPage'
import { VisitDetailPage } from '@/pages/VisitDetailPage'
import { EditVisitPage } from '@/pages/EditVisitPage'
import { SearchPage } from '@/pages/SearchPage'
import { StatsPage } from '@/pages/StatsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ProfilePage } from '@/pages/ProfilePage'

// Leaflet + clustering is heavy; keep the map off the initial bundle.
const MapPage = lazy(() => import('@/pages/MapPage').then((m) => ({ default: m.MapPage })))
// The report engine pulls in jsPDF; keep it lazy so it stays out of startup.
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <div className="flex h-20 w-20 animate-pulse items-center justify-center rounded-[1.75rem] bg-accent shadow-fab">
        <MapPin className="h-9 w-9 text-white" />
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return children
}

/** Flushes the offline outbox on startup and whenever connectivity returns. */
function SyncManager() {
  const client = useQueryClient()
  const { session } = useAuth()
  useEffect(() => {
    if (!session) return
    syncOutbox(client)
    const onOnline = () => syncOutbox(client)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [session, client])
  return null
}

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        dehydrateOptions: {
          // The outbox holds Blobs which do not survive JSON serialization —
          // it lives in IndexedDB and must never be persisted from the cache.
          shouldDehydrateQuery: (query) =>
            query.state.status === 'success' && query.queryKey[0] !== 'outbox',
        },
      }}
    >
      <ThemeProvider>
        <AuthProvider>
          <LocationProvider>
          <BrowserRouter>
            <AdminScopeProvider>
            <SyncManager />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/customers/:id" element={<CustomerDetailPage />} />
                <Route path="/visits/new" element={<NewVisitPage />} />
                <Route path="/visits/:id" element={<VisitDetailPage />} />
                <Route path="/visits/:id/edit" element={<EditVisitPage />} />
                <Route
                  path="/map"
                  element={
                    <Suspense fallback={<Splash />}>
                      <MapPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <Suspense fallback={<Splash />}>
                      <ReportsPage />
                    </Suspense>
                  }
                />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
            <Toaster />
            </AdminScopeProvider>
          </BrowserRouter>
          </LocationProvider>
        </AuthProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  )
}
