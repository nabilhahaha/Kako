'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** Style the confirm button as destructive. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => settle(false)}
        >
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${options.destructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{options.title}</h3>
                  {options.message && (
                    <p className="mt-1 text-sm text-muted-foreground">{options.message}</p>
                  )}
                </div>
              </div>
              <div className="flex justify-start gap-2">
                <Button
                  variant={options.destructive ? 'destructive' : 'default'}
                  onClick={() => settle(true)}
                  autoFocus
                >
                  {options.confirmText ?? 'تأكيد'}
                </Button>
                <Button variant="outline" onClick={() => settle(false)}>
                  {options.cancelText ?? 'إلغاء'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
