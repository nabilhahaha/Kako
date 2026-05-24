import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';

export function SyncStatusBar() {
  const { isOnline, isSyncing, pendingCount, syncAll } = useOfflineSync();

  // When offline
  if (!isOnline) {
    return (
      <div
        dir="rtl"
        className="flex h-10 items-center justify-center gap-2 bg-amber-500 px-4 text-sm font-medium text-white"
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>أنت غير متصل بالإنترنت. البيانات ستُحفظ محلياً.</span>
      </div>
    );
  }

  // When syncing
  if (isSyncing) {
    return (
      <div
        dir="rtl"
        className="flex h-10 items-center justify-center gap-2 bg-blue-500 px-4 text-sm font-medium text-white"
      >
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
        <span>جاري المزامنة...</span>
      </div>
    );
  }

  // When has pending items and online
  if (pendingCount > 0) {
    return (
      <div
        dir="rtl"
        className="flex h-10 items-center justify-center gap-2 bg-gray-100 px-4 text-sm text-gray-700"
      >
        <Wifi className="h-4 w-4 shrink-0 text-gray-400" />
        <span>
          {pendingCount} عناصر في انتظار المزامنة
        </span>
        <button
          onClick={syncAll}
          className="mr-2 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          مزامنة الآن
        </button>
      </div>
    );
  }

  // When all synced - hidden
  return null;
}
