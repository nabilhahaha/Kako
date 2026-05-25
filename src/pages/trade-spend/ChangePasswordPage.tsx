import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';

export function ChangePasswordPage() {
  useTranslation();
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const updateUser = useTradeSpendStore((s) => s.updateUser);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!currentUser) return null;

  const handleSubmit = () => {
    setError('');
    setSuccess(false);

    if (currentPw !== currentUser.password) {
      setError('Current password is incorrect');
      return;
    }
    if (newPw.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPw !== confirmPw) {
      setError('Passwords do not match');
      return;
    }

    updateUser(currentUser.id, { password: newPw });
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setSuccess(true);
  };

  return (
    <div className="space-y-4">
      <h1 className="heading-1">Change Password</h1>

      <Card className="max-w-md">
        <CardHeader className="pb-3">
          <CardTitle className="heading-3 flex items-center gap-2">
            <Lock className="h-4 w-4" />
            {currentUser.display_name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-lg bg-success/10 p-2.5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Password changed successfully
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Current Password</label>
            <div className="relative">
              <Input
                type={showCurrent ? 'text' : 'password'}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="h-10 pe-10"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">New Password</label>
            <div className="relative">
              <Input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="h-10 pe-10"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Confirm New Password</label>
            <Input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="h-10"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <Button onClick={handleSubmit} className="w-full h-10 bg-maroon hover:opacity-90">
            Change Password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
