import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  AlertTriangle,
  Settings,
  FileSpreadsheet,
  Tags,
  Layers,
  Users,
  ChevronRight,
  Upload,
  Building2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  /* --- Store --- */
  const skipDistributor = useTradeSpendStore((s) => s.skipDistributorApproval);
  const setSkipDistributorApproval = useTradeSpendStore((s) => s.setSkipDistributorApproval);

  const spendTypes = useTradeSpendStore((s) => s.spendTypes);
  const addSpendType = useTradeSpendStore((s) => s.addSpendType);
  const updateSpendType = useTradeSpendStore((s) => s.updateSpendType);
  const deleteSpendType = useTradeSpendStore((s) => s.deleteSpendType);

  const classifications = useTradeSpendStore((s) => s.classifications);
  const addClassification = useTradeSpendStore((s) => s.addClassification);
  const deleteClassification = useTradeSpendStore((s) => s.deleteClassification);

  const savedMappings = useTradeSpendStore((s) => s.savedMappings);
  const deleteMappingConfig = useTradeSpendStore((s) => s.deleteMappingConfig);

  const customers = useTradeSpendStore((s) => s.customers);

  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const distributors = useTradeSpendStore((s) => s.distributors);
  const addDistributor = useTradeSpendStore((s) => s.addDistributor);
  const updateDistributor = useTradeSpendStore((s) => s.updateDistributor);
  const deleteDistributor = useTradeSpendStore((s) => s.deleteDistributor);

  const canManageDistributors = currentUser?.roles.some(
    (r) => r === 'roshen_approver' || r === 'admin',
  );

  /* --- Distributors local state --- */
  const [newDistName, setNewDistName] = useState('');
  const [newDistCode, setNewDistCode] = useState('');
  const [editingDistId, setEditingDistId] = useState<string | null>(null);
  const [editingDistName, setEditingDistName] = useState('');
  const [editingDistCode, setEditingDistCode] = useState('');
  const [deletingDistId, setDeletingDistId] = useState<string | null>(null);

  /* --- Spend Types local state --- */
  const [newSpendTypeName, setNewSpendTypeName] = useState('');
  const [editingSpendTypeId, setEditingSpendTypeId] = useState<string | null>(null);
  const [editingSpendTypeName, setEditingSpendTypeName] = useState('');
  const [deletingSpendTypeId, setDeletingSpendTypeId] = useState<string | null>(null);

  /* --- Classifications local state --- */
  const [newClassification, setNewClassification] = useState('');
  const [deletingClassification, setDeletingClassification] = useState<string | null>(null);

  /* --- Mappings local state --- */
  const [deletingMapping, setDeletingMapping] = useState<string | null>(null);

  /* ---- Spend Type handlers ---- */

  function handleAddSpendType() {
    const name = newSpendTypeName.trim();
    if (!name) return;
    addSpendType(name);
    setNewSpendTypeName('');
  }

  function startEditSpendType(id: string, currentName: string) {
    setEditingSpendTypeId(id);
    setEditingSpendTypeName(currentName);
  }

  function saveEditSpendType() {
    if (!editingSpendTypeId || !editingSpendTypeName.trim()) return;
    updateSpendType(editingSpendTypeId, editingSpendTypeName.trim());
    setEditingSpendTypeId(null);
    setEditingSpendTypeName('');
  }

  function cancelEditSpendType() {
    setEditingSpendTypeId(null);
    setEditingSpendTypeName('');
  }

  function confirmDeleteSpendType(id: string) {
    deleteSpendType(id);
    setDeletingSpendTypeId(null);
  }

  /* ---- Classification handlers ---- */

  function handleAddClassification() {
    const name = newClassification.trim();
    if (!name) return;
    if (classifications.includes(name)) return;
    addClassification(name);
    setNewClassification('');
  }

  function isClassificationInUse(name: string): boolean {
    return customers.some((c) => c.classification === name);
  }

  function confirmDeleteClassification(name: string) {
    deleteClassification(name);
    setDeletingClassification(null);
  }

  /* ---- Distributor handlers ---- */

  function handleAddDistributor() {
    const name = newDistName.trim();
    const code = newDistCode.trim().toUpperCase();
    if (!name || !code) return;
    addDistributor({ name, code, active: true });
    setNewDistName('');
    setNewDistCode('');
  }

  function startEditDistributor(id: string, currentName: string, currentCode: string) {
    setEditingDistId(id);
    setEditingDistName(currentName);
    setEditingDistCode(currentCode);
  }

  function saveEditDistributor() {
    if (!editingDistId || !editingDistName.trim() || !editingDistCode.trim()) return;
    updateDistributor(editingDistId, {
      name: editingDistName.trim(),
      code: editingDistCode.trim().toUpperCase(),
    });
    setEditingDistId(null);
    setEditingDistName('');
    setEditingDistCode('');
  }

  function cancelEditDistributor() {
    setEditingDistId(null);
    setEditingDistName('');
    setEditingDistCode('');
  }

  function confirmDeleteDistributor(id: string) {
    deleteDistributor(id);
    setDeletingDistId(null);
  }

  function toggleDistributorActive(id: string, currentActive: boolean) {
    updateDistributor(id, { active: !currentActive });
  }

  /* ---- Mapping handlers ---- */

  function confirmDeleteMapping(name: string) {
    deleteMappingConfig(name);
    setDeletingMapping(null);
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="heading-2">
          {t('settings.title', 'Settings & Field Management')}
        </h1>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate('/trade-spend/users')}
          className="flex items-center gap-3 rounded-xl border bg-card p-3 text-start shadow-sm active:shadow-none transition-shadow"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950">
            <Users className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold">{t('nav.users')}</p>
            <p className="text-[10px] text-muted-foreground">Manage & roles</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={() => navigate('/trade-spend/upload')}
          className="flex items-center gap-3 rounded-xl border bg-card p-3 text-start shadow-sm active:shadow-none transition-shadow"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950">
            <Upload className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold">{t('nav.dataUpload')}</p>
            <p className="text-[10px] text-muted-foreground">Upload data</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* ============================================================ */}
      {/*  Section 0: Workflow Configuration                           */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="heading-2">Workflow Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Trade Marketing Approval</p>
              <p className="text-xs text-muted-foreground">
                {skipDistributor
                  ? 'Disabled — requests go directly from Manager to Roshen'
                  : 'Enabled — requests pass through Trade Marketing first'}
              </p>
            </div>
            <button
              onClick={() => setSkipDistributorApproval(!skipDistributor)}
              className={`relative h-6 w-11 rounded-full transition-colors ${skipDistributor ? 'bg-muted' : 'bg-primary'}`}
            >
              <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${skipDistributor ? 'translate-x-0.5' : 'translate-x-[22px]'}`} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/*  Section: Distributors (roshen_approver / admin only)        */}
      {/* ============================================================ */}
      {canManageDistributors && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Distributors
              <Badge variant="secondary" className="ms-auto text-xs font-normal">
                {distributors.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {distributors.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No distributors defined.
              </p>
            )}

            {distributors.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                {editingDistId === d.id ? (
                  /* Inline edit mode */
                  <>
                    <Input
                      value={editingDistName}
                      onChange={(e) => setEditingDistName(e.target.value)}
                      className="h-8 flex-1 text-sm"
                      placeholder="Name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEditDistributor();
                        if (e.key === 'Escape') cancelEditDistributor();
                      }}
                    />
                    <Input
                      value={editingDistCode}
                      onChange={(e) => setEditingDistCode(e.target.value)}
                      className="h-8 w-20 text-sm"
                      placeholder="Code"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEditDistributor();
                        if (e.key === 'Escape') cancelEditDistributor();
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-success"
                      onClick={saveEditDistributor}
                      title="Save"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground"
                      onClick={cancelEditDistributor}
                      title="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : deletingDistId === d.id ? (
                  /* Delete confirmation */
                  <>
                    <span className="flex-1 text-sm text-destructive font-medium">
                      Are you sure?
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => confirmDeleteDistributor(d.id)}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setDeletingDistId(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  /* Normal display */
                  <>
                    <span className="text-sm font-medium flex-1">{d.name}</span>
                    <span className="text-xs text-muted-foreground">{d.code}</span>
                    <Badge variant={d.active ? 'default' : 'secondary'}>
                      {d.active ? 'Active' : 'Inactive'}
                    </Badge>
                    <button
                      onClick={() => toggleDistributorActive(d.id, d.active)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${d.active ? 'bg-primary' : 'bg-muted'}`}
                      title={d.active ? 'Deactivate' : 'Activate'}
                    >
                      <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${d.active ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => startEditDistributor(d.id, d.name, d.code)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeletingDistId(d.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}

            {/* Add new distributor */}
            <div className="flex items-center gap-2 pt-2">
              <Input
                value={newDistName}
                onChange={(e) => setNewDistName(e.target.value)}
                placeholder="Distributor name..."
                className="h-9 flex-1 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddDistributor();
                }}
              />
              <Input
                value={newDistCode}
                onChange={(e) => setNewDistCode(e.target.value)}
                placeholder="Code"
                className="h-9 w-24 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddDistributor();
                }}
              />
              <Button
                size="sm"
                className="h-9 gap-1.5"
                onClick={handleAddDistributor}
                disabled={!newDistName.trim() || !newDistCode.trim()}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================ */}
      {/*  Section 1: Spend Types                                      */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags className="h-4 w-4" />
            {t('settings.spendTypes', 'Spend Types')}
            <Badge variant="secondary" className="ms-auto text-xs font-normal">
              {spendTypes.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Existing spend types */}
          {spendTypes.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('settings.noSpendTypes', 'No spend types defined.')}
            </p>
          )}

          {spendTypes.map((st) => (
            <div
              key={st.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
            >
              {editingSpendTypeId === st.id ? (
                /* Inline edit mode */
                <>
                  <Input
                    value={editingSpendTypeName}
                    onChange={(e) => setEditingSpendTypeName(e.target.value)}
                    className="h-8 flex-1 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEditSpendType();
                      if (e.key === 'Escape') cancelEditSpendType();
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-success"
                    onClick={saveEditSpendType}
                    title={t('common.save', 'Save')}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground"
                    onClick={cancelEditSpendType}
                    title={t('common.cancel', 'Cancel')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : deletingSpendTypeId === st.id ? (
                /* Delete confirmation */
                <>
                  <span className="flex-1 text-sm text-destructive font-medium">
                    {t('common.areYouSure', 'Are you sure?')}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => confirmDeleteSpendType(st.id)}
                  >
                    {t('common.confirm', 'Confirm')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setDeletingSpendTypeId(null)}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </>
              ) : (
                /* Normal display */
                <>
                  <span className="flex-1 text-sm font-medium text-foreground">
                    {st.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => startEditSpendType(st.id, st.name)}
                    title={t('common.edit', 'Edit')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeletingSpendTypeId(st.id)}
                    title={t('common.delete', 'Delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}

          {/* Add new spend type */}
          <div className="flex items-center gap-2 pt-2">
            <Input
              value={newSpendTypeName}
              onChange={(e) => setNewSpendTypeName(e.target.value)}
              placeholder={t('settings.newSpendType', 'New spend type name...')}
              className="h-9 flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddSpendType();
              }}
            />
            <Button
              size="sm"
              className="h-9 gap-1.5"
              onClick={handleAddSpendType}
              disabled={!newSpendTypeName.trim()}
            >
              <Plus className="h-4 w-4" />
              {t('common.add', 'Add')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/*  Section 2: Classifications                                  */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            {t('settings.classifications', 'Classifications')}
            <Badge variant="secondary" className="ms-auto text-xs font-normal">
              {classifications.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {classifications.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('settings.noClassifications', 'No classifications defined.')}
            </p>
          )}

          {classifications.map((cls) => {
            const inUse = isClassificationInUse(cls);
            return (
              <div
                key={cls}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                {deletingClassification === cls ? (
                  /* Delete confirmation */
                  <>
                    <span className="flex-1 text-sm text-destructive font-medium">
                      {t('common.areYouSure', 'Are you sure?')}
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => confirmDeleteClassification(cls)}
                    >
                      {t('common.confirm', 'Confirm')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setDeletingClassification(null)}
                    >
                      {t('common.cancel', 'Cancel')}
                    </Button>
                  </>
                ) : (
                  /* Normal display */
                  <>
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {cls}
                    </span>
                    {inUse && (
                      <span
                        className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                        title={t(
                          'settings.classificationInUse',
                          'In use by customers',
                        )}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {t('settings.inUse', 'In use')}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (inUse) {
                          /* still allow delete but show confirmation */
                          setDeletingClassification(cls);
                        } else {
                          setDeletingClassification(cls);
                        }
                      }}
                      title={t('common.delete', 'Delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}

          {/* Add new classification */}
          <div className="flex items-center gap-2 pt-2">
            <Input
              value={newClassification}
              onChange={(e) => setNewClassification(e.target.value)}
              placeholder={t(
                'settings.newClassification',
                'New classification name...',
              )}
              className="h-9 flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddClassification();
              }}
            />
            <Button
              size="sm"
              className="h-9 gap-1.5"
              onClick={handleAddClassification}
              disabled={
                !newClassification.trim() ||
                classifications.includes(newClassification.trim())
              }
            >
              <Plus className="h-4 w-4" />
              {t('common.add', 'Add')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/*  Section 3: Saved Column Mappings                            */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            {t('settings.columnMappings', 'Saved Column Mappings')}
            <Badge variant="secondary" className="ms-auto text-xs font-normal">
              {savedMappings.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {savedMappings.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t(
                'settings.noMappings',
                'No saved column mappings. Create one during data upload.',
              )}
            </p>
          )}

          {savedMappings.map((m) => (
            <div
              key={m.name}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
            >
              {deletingMapping === m.name ? (
                /* Delete confirmation */
                <>
                  <span className="flex-1 text-sm text-destructive font-medium">
                    {t('common.areYouSure', 'Are you sure?')}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => confirmDeleteMapping(m.name)}
                  >
                    {t('common.confirm', 'Confirm')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setDeletingMapping(null)}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </>
              ) : (
                /* Normal display */
                <>
                  <span className="flex-1 text-sm font-medium text-foreground">
                    {m.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeletingMapping(m.name)}
                    title={t('common.delete', 'Delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
