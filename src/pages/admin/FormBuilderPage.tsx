import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DynamicFormBuilder } from '@/components/admin/DynamicFormBuilder';

const FORM_TABS = [
  { key: 'visit_form', label: 'نموذج الزيارة' },
  { key: 'competitor_form', label: 'نموذج المنافسين' },
  { key: 'customer_form', label: 'نموذج العملاء' },
] as const;

type FormTabKey = (typeof FORM_TABS)[number]['key'];

export function FormBuilderPage() {
  const [selectedTab, setSelectedTab] = useState<FormTabKey>('visit_form');

  const currentTab = FORM_TABS.find((t) => t.key === selectedTab)!;

  return (
    <div className="space-y-5">
      <PageHeader
        title="إدارة النماذج"
        description="إنشاء وتعديل الحقول الديناميكية لكل نموذج"
        back="/admin"
      />

      {/* Tab selector */}
      <Card className="p-2">
        <div className="flex gap-1">
          {FORM_TABS.map((tab) => (
            <Button
              key={tab.key}
              variant={selectedTab === tab.key ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedTab(tab.key)}
              className="flex-1"
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </Card>

      {/* Form builder for the selected tab */}
      <DynamicFormBuilder
        key={selectedTab}
        formKey={selectedTab}
        formTitle={currentTab.label}
      />
    </div>
  );
}
