'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Pencil } from 'lucide-react';

interface PromptOptions {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  /** 'text' | 'password' | 'number' — controls the input type. */
  type?: 'text' | 'password' | 'number';
}

type PromptFn = (options: PromptOptions) => Promise<string | null>;

const PromptContext = createContext<PromptFn | null>(null);

export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error('usePrompt must be used within PromptProvider');
  return ctx;
}

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<PromptOptions | null>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const prompt = useCallback<PromptFn>((opts) => {
    setOptions(opts);
    setValue(opts.defaultValue ?? '');
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(v: string | null) {
    resolver.current?.(v);
    resolver.current = null;
    setOptions(null);
    setValue('');
  }

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => settle(null)}
        >
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Pencil className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold">{options.title}</h3>
                  {options.message && (
                    <p className="mt-1 text-sm text-muted-foreground">{options.message}</p>
                  )}
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  settle(value);
                }}
                className="space-y-3"
              >
                {options.label && (
                  <label className="text-xs text-muted-foreground">{options.label}</label>
                )}
                <Input
                  type={options.type ?? 'text'}
                  value={value}
                  placeholder={options.placeholder}
                  dir={options.type === 'number' || options.type === 'password' ? 'ltr' : undefined}
                  autoFocus
                  onChange={(e) => setValue(e.target.value)}
                />
                <div className="flex justify-start gap-2">
                  <Button type="submit">{options.confirmText ?? 'تأكيد'}</Button>
                  <Button type="button" variant="outline" onClick={() => settle(null)}>
                    {options.cancelText ?? 'إلغاء'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </PromptContext.Provider>
  );
}
