'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Loader2, RefreshCw, Download, CheckCircle2, AlertTriangle } from 'lucide-react';

// Shape returned by the Rust `check_for_update` command (src-tauri/src/updater.rs
// → UpdateInfo). Field names are serde-default (snake_case preserved).
interface UpdateInfo {
  current_version: string;
  channel: string;
  available: boolean;
  version: string | null;
  release_notes: string | null;
  pub_date: string | null;
  is_major: boolean;
  must_update: boolean;
  blocked_reason: string | null;
}

type Channel = 'stable' | 'beta';

// We talk to our own Rust commands via the Tauri global (matching the existing
// activate-form pattern) rather than importing @tauri-apps/api at module scope —
// these pages are server-rendered by the bundled Next server and the global is
// only present inside the desktop shell.
interface TauriGlobal {
  core?: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
  event?: { listen<T>(event: string, cb: (e: { payload: T }) => void): Promise<() => void> };
}

function tauri(): TauriGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
}

/** Tiny, safe markdown renderer for release notes (headings, bullets, bold).
 *  No HTML injection — everything is rendered as React text nodes. */
function ReleaseNotes({ md }: { md: string }) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="my-1 list-disc space-y-0.5 ps-5">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      flush();
      out.push(
        <p key={`h-${out.length}`} className="mt-2 font-semibold">
          {inline(line.replace(/^#{1,6}\s/, ''))}
        </p>,
      );
    } else if (/^[-*]\s/.test(line)) {
      bullets.push(line.replace(/^[-*]\s/, ''));
    } else if (line.trim() === '') {
      flush();
    } else {
      flush();
      out.push(
        <p key={`p-${out.length}`} className="my-1">
          {inline(line)}
        </p>,
      );
    }
  }
  flush();
  return <div className="text-sm leading-relaxed">{out}</div>;
}

export function UpdatesManager() {
  const { t } = useI18n();
  const [inApp, setInApp] = useState<boolean | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('—');
  const [channel, setChannel] = useState<Channel>('stable');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  const runCheck = useCallback(async (ch: Channel) => {
    const inv = tauri()?.core?.invoke;
    if (!inv) return;
    setChecking(true);
    try {
      const result = await inv<UpdateInfo>('check_for_update', { channel: ch });
      setInfo(result);
    } catch (e) {
      toast.error(t('settings.updates.checkFailed'));
      // Offline boxes legitimately fail the network check — keep it quiet in logs.
      console.warn('update check failed', e);
    } finally {
      setChecking(false);
    }
  }, [t]);

  // Initial load: detect the shell, read version + persisted channel, then check.
  useEffect(() => {
    const inv = tauri()?.core?.invoke;
    if (!inv) {
      setInApp(false);
      return;
    }
    setInApp(true);
    (async () => {
      try {
        const [ver, ch] = await Promise.all([
          inv<string>('get_current_version'),
          inv<string>('get_channel'),
        ]);
        setCurrentVersion(ver);
        const c: Channel = ch === 'beta' ? 'beta' : 'stable';
        setChannel(c);
        await runCheck(c);
      } catch (e) {
        console.warn('updater init failed', e);
      }
    })();
    // Surface the launch-time silent check result if it fired before mount.
    let unlisten: (() => void) | undefined;
    tauri()?.event?.listen<UpdateInfo>('update-available', (e) => setInfo(e.payload)).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
  }, [runCheck]);

  async function onChannelChange(next: Channel) {
    const inv = tauri()?.core?.invoke;
    if (!inv) return;
    setChannel(next);
    setInfo(null);
    try {
      await inv('set_channel', { channel: next });
      toast.success(t('settings.updates.channelSaved'));
      await runCheck(next);
    } catch (e) {
      toast.error(t('settings.updates.channelSaveFailed'));
      console.warn('set_channel failed', e);
    }
  }

  async function onInstall() {
    const inv = tauri()?.core?.invoke;
    if (!inv) return;
    setInstalling(true);
    try {
      // Does not return on success — the shell relaunches into the new build.
      await inv('install_update');
    } catch (e) {
      setInstalling(false);
      toast.error(t('settings.updates.installFailed'));
      console.warn('install_update failed', e);
    }
  }

  if (inApp === false) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t('settings.updates.notInApp')}
        </CardContent>
      </Card>
    );
  }

  const hasUpdate = !!info?.available;

  return (
    <div className="max-w-2xl space-y-4">
      {info?.must_update && (
        <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>{t('settings.updates.mustUpdate')}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 p-4">
          {/* Versions */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">{t('settings.updates.currentVersion')}</p>
              <p className="font-mono text-sm" dir="ltr">{currentVersion}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('settings.updates.latestVersion')}</p>
              <p className="font-mono text-sm" dir="ltr">
                {checking ? '…' : info?.version ?? currentVersion}
              </p>
            </div>
            <div>
              {checking ? (
                <Badge variant="secondary"><Loader2 className="me-1 h-3 w-3 animate-spin" />{t('settings.updates.checking')}</Badge>
              ) : hasUpdate ? (
                <Badge className="bg-cyan-600">{t('settings.updates.updateAvailable')}</Badge>
              ) : (
                <Badge variant="secondary"><CheckCircle2 className="me-1 h-3 w-3" />{t('settings.updates.upToDate')}</Badge>
              )}
            </div>
          </div>

          {info?.blocked_reason && (
            <p className="text-xs text-muted-foreground">{info.blocked_reason}</p>
          )}

          {/* Channel switcher */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t('settings.updates.channel')}</label>
            <Select
              value={channel}
              onChange={(e) => onChannelChange(e.target.value as Channel)}
              disabled={checking || installing}
              className="max-w-xs"
            >
              <option value="stable">{t('settings.updates.channelStable')}</option>
              <option value="beta">{t('settings.updates.channelBeta')}</option>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => runCheck(channel)} disabled={checking || installing}>
              {checking ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RefreshCw className="me-2 h-4 w-4" />}
              {t('settings.updates.checkNow')}
            </Button>
            <Button onClick={onInstall} disabled={!hasUpdate || installing}>
              {installing ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Download className="me-2 h-4 w-4" />}
              {installing ? t('settings.updates.installing') : t('settings.updates.install')}
            </Button>
          </div>

          {hasUpdate && info?.is_major && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              {t('settings.updates.majorBackupNote')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Release notes */}
      {hasUpdate && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-semibold">{t('settings.updates.releaseNotes')}</p>
            {info?.release_notes ? (
              <ReleaseNotes md={info.release_notes} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('settings.updates.noNotes')}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
