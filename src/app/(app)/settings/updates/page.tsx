import { requireAnyPermission } from '@/lib/erp/guards';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { UpdatesManager } from './updates-manager';

// Settings ▸ Updates — Offline Edition auto-update control. Admin-only. All the
// real work happens client-side against the Tauri shell (check_for_update /
// install_update / get|set_channel); outside the desktop app the manager shows a
// "not running in the desktop app" notice. See docs/offline/auto-update.md.
export default async function UpdatesPage() {
  // Generic settings-admin gate only — the auto-updater is platform-level and
  // must not depend on any industry module permission.
  await requireAnyPermission(['settings.users']);
  const { t } = await getT();

  return (
    <div>
      <PageHeader
        title={t('settings.updates.title')}
        description={t('settings.updates.description')}
      />
      <UpdatesManager />
    </div>
  );
}
