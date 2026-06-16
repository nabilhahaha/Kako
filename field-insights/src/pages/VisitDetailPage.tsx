import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lightbulb, AlertTriangle, CheckSquare, CalendarClock, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useVisit, completeVisit } from '@/lib/data/visits';
import {
  createOpportunity, createIssue, createAction, createFollowUp,
  useDvapFramework, saveDvap,
} from '@/lib/data/capture';

type Panel = 'opp' | 'issue' | 'action' | 'follow' | 'dvap' | null;

const ISSUE_TYPES = ['out_of_stock', 'pricing_issue', 'distribution_issue', 'visibility_issue', 'customer_complaint', 'competitor_threat'];

export function VisitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const visit = useVisit(id);
  const dvap = useDvapFramework();
  const [panel, setPanel] = useState<Panel>(null);

  // shared form state
  const [text1, setText1] = useState('');
  const [text2, setText2] = useState('');
  const [num1, setNum1] = useState('');
  const [sel1, setSel1] = useState('');
  const [dvapScores, setDvapScores] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState('');
  const [outcome, setOutcome] = useState('');

  if (!id) return null;
  const ctx = { visitId: id, customerId: visit?.customer_id ?? null };

  function reset() {
    setText1(''); setText2(''); setNum1(''); setSel1(''); setPanel(null);
  }

  async function submit() {
    try {
      if (panel === 'opp') {
        if (!text1.trim()) return toast.error('Title required');
        await createOpportunity(ctx, { title: text1.trim(), estimated_value: num1 ? Number(num1) : null, priority: sel1 || 'medium' });
      } else if (panel === 'issue') {
        if (!text1.trim()) return toast.error('Title required');
        await createIssue(ctx, { issue_type: sel1 || 'out_of_stock', severity: text2 || 'medium', title: text1.trim() });
      } else if (panel === 'action') {
        if (!text1.trim()) return toast.error('Action required');
        await createAction(ctx, { description: text1.trim(), target_date: text2 || null });
      } else if (panel === 'follow') {
        if (!text1.trim()) return toast.error('Title required');
        await createFollowUp(ctx, { title: text1.trim(), type: sel1 || 'next_visit', due_date: text2 || null });
      }
      toast.success('Saved (syncing)');
      reset();
    } catch {
      toast.error('Could not save');
    }
  }

  async function submitDvap() {
    if (!dvap.data) return;
    const { overall, band } = await saveDvap(ctx, dvap.data, dvapScores);
    toast.success(overall != null ? `DVAP ${overall} (${band ?? '—'})` : 'DVAP saved');
    setDvapScores({});
    setPanel(null);
  }

  async function end() {
    await completeVisit(ctx.visitId, summary.trim(), outcome.trim());
    toast.success('Visit completed');
    navigate('/visits');
  }

  const quick: { key: Panel; icon: typeof Lightbulb; label: string }[] = [
    { key: 'opp', icon: Lightbulb, label: 'Opportunity' },
    { key: 'issue', icon: AlertTriangle, label: 'Issue' },
    { key: 'action', icon: CheckSquare, label: 'Action' },
    { key: 'follow', icon: CalendarClock, label: 'Follow-up' },
    { key: 'dvap', icon: ClipboardCheck, label: 'DVAP' },
  ];

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold">{visit?.customer_name ?? 'Visit'}</h1>
        <p className="text-sm text-muted-foreground">
          {visit?.visit_type?.replace(/_/g, ' ')} · {visit?.status}
          {visit?.sync_status === 'pending' && ' · pending sync'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {quick.map(({ key, icon: Icon, label }) => (
          <button
            key={label}
            onClick={() => setPanel(panel === key ? null : key)}
            className="flex flex-col items-center gap-1.5 rounded-lg bg-secondary/60 p-3 text-center text-xs font-medium fi-tap"
          >
            <Icon className="size-5 text-primary" />
            {label}
          </button>
        ))}
      </div>

      {panel === 'opp' && (
        <div className="fi-card flex flex-col gap-2 p-3">
          <Input placeholder="Opportunity title" value={text1} onChange={(e) => setText1(e.target.value)} />
          <Input type="number" inputMode="decimal" placeholder="Estimated value" value={num1} onChange={(e) => setNum1(e.target.value)} />
          <Select value={sel1} onChange={(e) => setSel1(e.target.value)}>
            <option value="medium">Medium</option><option value="low">Low</option>
            <option value="high">High</option><option value="critical">Critical</option>
          </Select>
          <Button onClick={() => void submit()}>Add opportunity</Button>
        </div>
      )}

      {panel === 'issue' && (
        <div className="fi-card flex flex-col gap-2 p-3">
          <Input placeholder="Issue title" value={text1} onChange={(e) => setText1(e.target.value)} />
          <Select value={sel1} onChange={(e) => setSel1(e.target.value)}>
            {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </Select>
          <Select value={text2} onChange={(e) => setText2(e.target.value)}>
            <option value="medium">Medium</option><option value="low">Low</option>
            <option value="high">High</option><option value="critical">Critical</option>
          </Select>
          <Button onClick={() => void submit()}>Report issue</Button>
        </div>
      )}

      {panel === 'action' && (
        <div className="fi-card flex flex-col gap-2 p-3">
          <Input placeholder="Action" value={text1} onChange={(e) => setText1(e.target.value)} />
          <Input type="date" value={text2} onChange={(e) => setText2(e.target.value)} />
          <Button onClick={() => void submit()}>Add action</Button>
        </div>
      )}

      {panel === 'follow' && (
        <div className="fi-card flex flex-col gap-2 p-3">
          <Input placeholder="Follow-up title" value={text1} onChange={(e) => setText1(e.target.value)} />
          <Select value={sel1} onChange={(e) => setSel1(e.target.value)}>
            <option value="next_visit">Next visit</option><option value="callback">Callback</option>
            <option value="task">Task</option><option value="escalation">Escalation</option>
          </Select>
          <Input type="date" value={text2} onChange={(e) => setText2(e.target.value)} />
          <Button onClick={() => void submit()}>Schedule follow-up</Button>
        </div>
      )}

      {panel === 'dvap' && (
        <div className="fi-card flex flex-col gap-3 p-3">
          {!dvap.data && <p className="text-sm text-muted-foreground">Loading DVAP framework…</p>}
          {dvap.data?.dimensions.map((d) => (
            <label key={d.key} className="text-sm font-medium">
              <span className="flex justify-between">
                <span>{d.label}</span>
                <span className="text-muted-foreground">{dvapScores[d.key] ?? 0}</span>
              </span>
              <input
                type="range" min={0} max={100} step={5}
                value={dvapScores[d.key] ?? 0}
                onChange={(e) => setDvapScores((s) => ({ ...s, [d.key]: Number(e.target.value) }))}
                className="mt-1 w-full"
              />
            </label>
          ))}
          {dvap.data && <Button onClick={() => void submitDvap()}>Save DVAP</Button>}
        </div>
      )}

      <div className="fi-card flex flex-col gap-2 p-3">
        <h2 className="text-sm font-semibold">Close visit</h2>
        <Textarea placeholder="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
        <Textarea placeholder="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        <Button variant="accent" onClick={() => void end()}>End visit</Button>
      </div>
    </div>
  );
}
