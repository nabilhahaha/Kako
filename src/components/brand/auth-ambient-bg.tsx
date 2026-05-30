import { cn } from '@/lib/utils';

/** The ambient brand background (gradient + aurora + dot grid + vignette) shared
 *  by the auth screens. Absolutely positioned; sits behind content. */
export function AuthAmbientBg({
  className,
  gradient = 'linear-gradient(135deg, #7c5cff 0%, #4f46e5 45%, #3730a3 100%)',
}: {
  className?: string;
  gradient?: string;
}) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="absolute inset-0" style={{ background: gradient }} />
      <div className="ams-aura absolute -top-24 -end-16 h-96 w-96 rounded-full blur-3xl" style={{ background: 'rgba(34,211,238,0.30)' }} />
      <div className="ams-aura-2 absolute -bottom-20 -start-10 h-[30rem] w-[30rem] rounded-full blur-3xl" style={{ background: 'rgba(255,255,255,0.10)' }} />
      <div className="ams-aura absolute end-1/3 top-1/3 h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(99,102,241,0.35)' }} />
      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 0%, transparent 40%, rgba(0,0,0,0.25) 100%)' }} />
    </div>
  );
}
