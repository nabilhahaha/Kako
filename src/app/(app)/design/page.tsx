'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { Plus, Check, Trash2 } from 'lucide-react';

/** ── Design System showcase (/design) ──────────────────────────────────────
 *  Living reference for the VANTORA design language — deep navy + premium cyan,
 *  token-driven, RTL/LTR + light/dark via the global theme. Future modules
 *  should compose these primitives so the platform stays visually consistent.
 *  Toggle theme + language from the top bar to see both modes. */

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="space-y-1">
      <div className={`h-14 rounded-lg border ${className}`} />
      <div className="text-xs text-muted-foreground">{name}</div>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Design System" description="VANTORA — deep navy + premium cyan. Token-driven, RTL/LTR, light/dark." />

      {/* Palette */}
      <Card><CardContent className="p-6 space-y-4">
        <h2 className="text-base font-semibold">Palette</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <Swatch name="primary (navy)" className="bg-primary" />
          <Swatch name="accent (cyan)" className="bg-accent" />
          <Swatch name="success" className="bg-success" />
          <Swatch name="warning" className="bg-warning" />
          <Swatch name="destructive" className="bg-destructive" />
          <Swatch name="info" className="bg-info" />
          <Swatch name="secondary" className="bg-secondary" />
          <Swatch name="muted" className="bg-muted" />
          <Swatch name="card / border" className="bg-card" />
        </div>
      </CardContent></Card>

      {/* Typography */}
      <Card><CardContent className="p-6 space-y-3">
        <h2 className="text-base font-semibold">Typography</h2>
        <div className="space-y-1">
          <p className="text-2xl font-bold">Powerful like an ERP — قويّ كنظام ERP</p>
          <p className="text-lg font-semibold">Simple like a modern SaaS — بسيط كمنتج حديث</p>
          <p className="text-sm text-muted-foreground">Body / muted — نص ثانوي</p>
          <p className="tabular-nums text-sm">Tabular figures: 1,234,567.89</p>
        </div>
      </CardContent></Card>

      {/* Buttons */}
      <Card><CardContent className="p-6 space-y-4">
        <h2 className="text-base font-semibold">Buttons</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary <Plus className="h-4 w-4" /></Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive"><Trash2 className="h-4 w-4" /> Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button disabled>Disabled</Button>
        </div>
      </CardContent></Card>

      {/* Badges */}
      <Card><CardContent className="p-6 space-y-3">
        <h2 className="text-base font-semibold">Badges & status</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="success"><Check className="me-1 h-3 w-3" />Active</Badge>
          <Badge variant="warning">Pending</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="destructive">Rejected</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </CardContent></Card>

      {/* Form controls */}
      <Card><CardContent className="p-6 space-y-4">
        <h2 className="text-base font-semibold">Form controls</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="d1">Text</Label><Input id="d1" placeholder="Type here…" /></div>
          <div className="space-y-1.5"><Label htmlFor="d2">Number</Label><Input id="d2" type="number" dir="ltr" placeholder="0" /></div>
          <div className="space-y-1.5">
            <Label htmlFor="d3">Select</Label>
            <Select id="d3">
              <option>Option A</option><option>Option B</option>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Focus any control to see the cyan focus ring (keyboard-accessible).</p>
      </CardContent></Card>

      {/* Surfaces */}
      <Card><CardContent className="p-6 space-y-3">
        <h2 className="text-base font-semibold">Surfaces</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4"><div className="font-medium">Card / border</div><div className="text-sm text-muted-foreground">Neutral surface</div></div>
          <div className="rounded-lg bg-secondary p-4"><div className="font-medium">Secondary</div><div className="text-sm text-muted-foreground">Subtle fill</div></div>
          <div className="rounded-lg bg-primary p-4 text-primary-foreground"><div className="font-medium">Primary</div><div className="text-sm opacity-90">Brand navy</div></div>
        </div>
      </CardContent></Card>
    </div>
  );
}
