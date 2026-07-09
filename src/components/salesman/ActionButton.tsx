import * as React from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ActionState = 'idle' | 'loading' | 'success' | 'error';

export interface ActionButtonProps extends Omit<ButtonProps, 'onClick'> {
  /**
   * Click handler. If it returns a promise, the button shows a loading state
   * until it settles, then a brief success/error flash. Concurrent presses are
   * ignored (double-submit guard).
   */
  onClick?: () => void | Promise<unknown>;
  loadingText?: string;
  /** Show a success tick after the action resolves. */
  feedback?: boolean;
}

/**
 * Touch-friendly button with explicit pressed / loading / disabled /
 * success / error states. Pressed state comes from `active:scale` so every
 * tap is acknowledged instantly; loading and result states are driven by the
 * (optionally async) onClick.
 */
export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ onClick, loadingText, feedback = true, disabled, className, children, ...props }, ref) => {
    const [state, setState] = React.useState<ActionState>('idle');
    const busy = React.useRef(false);

    const handle = React.useCallback(async () => {
      if (busy.current || !onClick) return;
      busy.current = true;
      try {
        const r = onClick();
        if (r instanceof Promise) {
          setState('loading');
          await r;
          if (feedback) {
            setState('success');
            setTimeout(() => setState('idle'), 900);
          } else {
            setState('idle');
          }
        }
      } catch {
        setState('error');
        setTimeout(() => setState('idle'), 1400);
      } finally {
        busy.current = false;
      }
    }, [onClick, feedback]);

    const isLoading = state === 'loading';

    return (
      <Button
        ref={ref}
        type="button"
        onClick={handle}
        aria-busy={isLoading}
        disabled={disabled || isLoading}
        className={cn(
          'select-none transition-transform active:scale-[0.97]',
          state === 'success' && 'bg-success text-success-foreground hover:bg-success',
          state === 'error' && 'bg-destructive text-destructive-foreground hover:bg-destructive',
          className,
        )}
        {...props}
      >
        {isLoading && <Loader2 className="animate-spin" />}
        {state === 'success' && <Check />}
        {state === 'error' && <X />}
        <span className="truncate">
          {isLoading && loadingText ? loadingText : children}
        </span>
      </Button>
    );
  },
);
ActionButton.displayName = 'ActionButton';
