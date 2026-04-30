import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { queryKeys } from '@/lib/query-keys';
import { apiKeysApi } from '@/services/api';
import type { APIKeyScope } from '@/types';

export default function APIKeysSettings() {
  const { t } = useTranslation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScope, setNewKeyScope] = useState<APIKeyScope>('read');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: queryKeys.apiKeys.all,
    queryFn: apiKeysApi.list,
  });

  const createMutation = useToastMutation({
    mutationFn: (data: { name: string; scope: APIKeyScope }) =>
      apiKeysApi.create(data),
    successMessage: t('apiKeys.createSuccess'),
    errorMessage: t('apiKeys.createFailed'),
    invalidateKeys: [queryKeys.apiKeys.all],
    onSuccess: (result) => {
      setCreatedKey(result.key);
      setShowCreateDialog(false);
      setNewKeyName('');
      setNewKeyScope('read');
    },
  });

  const revokeMutation = useToastMutation({
    mutationFn: (keyId: number) => apiKeysApi.revoke(keyId),
    successMessage: t('apiKeys.revokeSuccess'),
    errorMessage: t('apiKeys.revokeFailed'),
    invalidateKeys: [queryKeys.apiKeys.all],
  });

  const deleteMutation = useToastMutation({
    mutationFn: (keyId: number) => apiKeysApi.delete(keyId),
    successMessage: t('apiKeys.deleteSuccess'),
    errorMessage: t('apiKeys.deleteFailed'),
    invalidateKeys: [queryKeys.apiKeys.all],
  });

  const handleCreate = () => {
    if (!newKeyName.trim()) return;
    createMutation.mutate({ name: newKeyName.trim(), scope: newKeyScope });
  };

  const handleCopy = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scopeBadgeVariant = (scope: APIKeyScope) => {
    switch (scope) {
      case 'admin': return 'destructive';
      case 'write': return 'default';
      default: return 'secondary';
    }
  };

  const formatLastUsed = (dateStr: string | null) => {
    if (!dateStr) return t('apiKeys.neverUsed');
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return t('apiKeys.usedRecently');
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Key className="size-5" />
            {t('apiKeys.title')}
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setShowCreateDialog(true)}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            {t('apiKeys.generate')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : keys.length === 0 ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{t('apiKeys.noKeys')}</p>
            <p>{t('apiKeys.noKeysDesc')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    <Badge variant={scopeBadgeVariant(key.scope)}>
                      <Shield className="mr-1 size-3" />
                      {key.scope}
                    </Badge>
                    {!key.is_active && (
                      <Badge variant="outline" className="text-muted-foreground">
                        {t('apiKeys.revoked')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      {key.key_prefix}...
                    </code>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatLastUsed(key.last_used_at)}
                    </span>
                    <span>{new Date(key.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {key.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeMutation.mutate(key.id)}
                      disabled={revokeMutation.isPending}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Shield className="mr-1 size-3.5" />
                      {t('apiKeys.revoke')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(key.id)}
                    disabled={deleteMutation.isPending}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="mr-1 size-3.5" />
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('apiKeys.generateTitle')}</DialogTitle>
            <DialogDescription>
              {t('apiKeys.generateDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t('apiKeys.keyName')}
              </label>
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder={t('apiKeys.keyNamePlaceholder')}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t('apiKeys.scope')}
              </label>
              <Select value={newKeyScope} onValueChange={(v) => setNewKeyScope(v as APIKeyScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">{t('apiKeys.scopeRead')}</SelectItem>
                  <SelectItem value="write">{t('apiKeys.scopeWrite')}</SelectItem>
                  <SelectItem value="admin">{t('apiKeys.scopeAdmin')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`apiKeys.scopeReadDesc`)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!newKeyName.trim() || createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Key className="mr-1 size-4" />
              )}
              {t('apiKeys.generate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Created Key Dialog */}
      <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-500" />
              {t('apiKeys.keyCreated')}
            </DialogTitle>
            <DialogDescription>
              <AlertTriangle className="mr-1 inline size-4 text-amber-500" />
              {t('apiKeys.keyWarning')}
            </DialogDescription>
          </DialogHeader>
          {createdKey && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted p-3">
                <code className="break-all text-sm">{createdKey}</code>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(createdKey)}
                className="gap-1.5"
              >
                {copied ? (
                  <CheckCircle2 className="size-4 text-green-500" />
                ) : (
                  <Copy className="size-4" />
                )}
                {copied ? t('common.copied') : t('common.copy')}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
