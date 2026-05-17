import { useLang } from '../App.jsx';

// Visual 3-dot stepper: Salesman → TM → Roshen.
export default function DecisionStepper({ submission }) {
  const { tr } = useLang();
  const s = submission;

  const salesmanDone = true;
  const tmDone = !!s.tmDecision;
  const closedAtTM = s.status === 'closed_no_action';
  const roshenDone = !!s.roshenDecision;

  const steps = [
    { label: tr.salesman, done: salesmanDone, color: '#16a34a' },
    {
      label: tr.tradeMarketing,
      done: tmDone,
      color: tmDone ? (closedAtTM ? '#6b7280' : '#16a34a') : '#d97706',
    },
    {
      label: tr.roshenManager,
      done: roshenDone,
      color: roshenDone ? '#16a34a' : closedAtTM ? '#d1d5db' : '#2563eb',
      muted: closedAtTM,
    },
  ];

  return (
    <div className="flex items-center gap-1 w-full">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
              style={{ background: step.color, opacity: step.muted ? 0.5 : 1 }}
              aria-hidden
            >
              {step.done ? '✓' : i + 1}
            </div>
            <span
              className="text-[10px] font-semibold mt-1 text-center"
              style={{ color: step.muted ? '#9ca3af' : '#374151', maxWidth: 80 }}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className="flex-1 h-0.5 mx-1 -mt-3.5"
              style={{
                background: step.done && !step.muted ? '#16a34a' : '#e5e7eb',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
