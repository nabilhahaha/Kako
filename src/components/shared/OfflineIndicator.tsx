import { useState } from 'react';
import { useOnlineStatus } from '@/hooks/useOfflineSync';
import { useSyncStatus } from '@/hooks/useOfflineSync';

export function OfflineIndicator() {
  const { isOnline } = useOnlineStatus();
  const { stats } = useSyncStatus();
  const [showTooltip, setShowTooltip] = useState(false);

  const pendingCount =
    (stats?.pendingVisits ?? 0) +
    (stats?.pendingPhotos ?? 0) +
    (stats?.queueSize ?? 0);

  const hasPending = pendingCount > 0;

  // Determine dot color and tooltip
  let dotColor: string;
  let tooltipText: string;

  if (!isOnline) {
    dotColor = 'bg-red-500';
    tooltipText = 'غير متصل بالإنترنت';
  } else if (hasPending) {
    dotColor = 'bg-yellow-400';
    tooltipText = `متصل - ${pendingCount} عناصر في انتظار المزامنة`;
  } else {
    dotColor = 'bg-green-500';
    tooltipText = 'متصل ومتزامن';
  }

  return (
    <div
      className="fixed bottom-20 left-4 z-50"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Tooltip */}
      {showTooltip && (
        <div
          dir="rtl"
          className="absolute bottom-8 left-0 whitespace-nowrap rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg"
        >
          {tooltipText}
          <div className="absolute -bottom-1 left-2 h-2 w-2 rotate-45 bg-gray-900" />
        </div>
      )}

      {/* Dot */}
      <div
        className={`h-3 w-3 rounded-full ${dotColor} shadow-md ring-2 ring-white cursor-pointer`}
        aria-label={tooltipText}
      >
        {/* Pulse animation when offline or pending */}
        {(!isOnline || hasPending) && (
          <div
            className={`absolute inset-0 h-3 w-3 animate-ping rounded-full ${dotColor} opacity-75`}
          />
        )}
      </div>
    </div>
  );
}
