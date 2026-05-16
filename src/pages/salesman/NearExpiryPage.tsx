import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { NearExpiryForm } from '@/components/near-expiry/NearExpiryForm';

export function NearExpiryPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader
        title="تسجيل منتج قارب على الانتهاء"
        description="سيُراجع التسجيل من قبل المشرف قبل اعتماده"
        back="/salesman"
      />
      <Card className="p-5">
        <NearExpiryForm onSuccess={() => navigate('/salesman', { replace: true })} />
      </Card>
    </div>
  );
}
