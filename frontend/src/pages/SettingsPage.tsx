import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import {
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
  Server,
  Key,
  Brain,
} from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { settingsApi } from '@/services/chat-api';

export default function SettingsPage() {
  const { t } = useTranslation();

  const providers = [
    { value: 'mock', label: t('settings.providers.mock') },
    { value: 'openai', label: t('settings.providers.openai') },
    { value: 'anthropic', label: t('settings.providers.anthropic') },
    { value: 'aliyun', label: t('settings.providers.aliyun') },
    { value: 'volcengine', label: t('settings.providers.volcengine') },
    { value: 'ollama', label: t('settings.providers.ollama') },
  ];

  const embeddingProviders = [
    { value: 'mock', label: t('settings.embeddingProviders.mock') },
    { value: 'local', label: t('settings.embeddingProviders.local') },
    { value: 'api', label: t('settings.embeddingProviders.api') },
  ];
  const [form, setForm] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  const updateMutation = useToastMutation({
    mutationFn: (data: Record<string, unknown>) => settingsApi.update(data),
    successMessage: t('common.saveSuccess'),
    errorMessage: t('common.saveFailed'),
    invalidateKeys: [['settings']],
  });

  const testMutation = useMutation({
    mutationFn: () => settingsApi.testConnection(),
    onSuccess: (res) => {
      setTestResult({
        success: !!res?.success,
        message: res?.success
          ? `${t('settings.testSuccess')}: ${res.response}`
          : `${t('settings.testFailed')}: ${res?.error}`,
      });
    },
    onError: (err) => {
      setTestResult({ success: false, message: String(err) });
    },
  });

  useEffect(() => {
    if (data) {
      const d = data as Record<string, string>;
      setForm({
        llm_provider: d.llm_provider ?? 'mock',
        llm_temperature: String(d.llm_temperature ?? '0.7'),
        llm_max_tokens: String(d.llm_max_tokens ?? '4096'),
        openai_api_key: d.openai_api_key ?? '',
        openai_model: d.openai_model ?? '',
        anthropic_api_key: d.anthropic_api_key ?? '',
        anthropic_model: d.anthropic_model ?? '',
        aliyun_api_key: d.aliyun_api_key ?? '',
        aliyun_model: d.aliyun_model ?? '',
        volcengine_api_key: d.volcengine_api_key ?? '',
        volcengine_model: d.volcengine_model ?? '',
        ollama_base_url: d.ollama_base_url ?? '',
        ollama_model: d.ollama_model ?? '',
        embedding_provider: d.embedding_provider ?? 'local',
        embedding_model: d.embedding_model ?? '',
      });
    }
  }, [data]);

  const handleSave = () => {
    const payload: Record<string, unknown> = { ...form };
    payload.llm_temperature = parseFloat(form.llm_temperature ?? '0.7');
    payload.llm_max_tokens = parseInt(form.llm_max_tokens ?? '4096', 10);
    updateMutation.mutate(payload);
  };

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const currentProvider = form.llm_provider ?? 'mock';

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingState message={t('common.loading')} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('settings.subtitle')}
            </p>
          </div>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="gap-1.5"
          >
            {updateMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : updateMutation.isSuccess ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <Save className="size-4" />
            )}
            {t('common.save')}
          </Button>
        </div>

        {/* LLM Provider */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="size-5" />
              {t('settings.llmConfig')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">{t('settings.provider')}</label>
                <Select
                  value={currentProvider}
                  onValueChange={(v) => updateField('llm_provider', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">{t('settings.temperature')}</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={form.llm_temperature ?? '0.7'}
                  onChange={(e) => updateField('llm_temperature', e.target.value)}
                />
              </div>
            </div>

            <Separator />

            {currentProvider === 'openai' && (
              <ProviderFields
                prefix="openai"
                form={form}
                onChange={updateField}
                modelPlaceholder="gpt-4o-mini"
              />
            )}
            {currentProvider === 'anthropic' && (
              <ProviderFields
                prefix="anthropic"
                form={form}
                onChange={updateField}
                modelPlaceholder="claude-sonnet-4-20250514"
              />
            )}
            {currentProvider === 'aliyun' && (
              <ProviderFields
                prefix="aliyun"
                form={form}
                onChange={updateField}
                modelPlaceholder="qwen3.5-plus"
              />
            )}
            {currentProvider === 'volcengine' && (
              <ProviderFields
                prefix="volcengine"
                form={form}
                onChange={updateField}
                modelPlaceholder="doubao-seed-1-6-flash-250828"
              />
            )}
            {currentProvider === 'ollama' && (
              <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  <Server className="mr-1 inline size-3.5" />
                  {t('settings.serverUrl')}
                </label>
                  <Input
                    value={form.ollama_base_url ?? ''}
                    onChange={(e) => updateField('ollama_base_url', e.target.value)}
                    placeholder="http://localhost:11434"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('settings.modelName')}</label>
                  <Input
                    value={form.ollama_model ?? ''}
                    onChange={(e) => updateField('ollama_model', e.target.value)}
                    placeholder="llama3"
                  />
                </div>
              </div>
            )}
            {currentProvider === 'mock' && (
              <p className="text-sm text-muted-foreground">
                {t('settings.mockDesc')}
              </p>
            )}

            <Separator />

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setTestResult(null);
                  testMutation.mutate();
                }}
                disabled={testMutation.isPending}
                className="gap-1.5"
              >
                {testMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Zap className="size-4" />
                )}
                {t('settings.testConnection')}
              </Button>
              {testResult && (
                <Badge variant={testResult.success ? 'default' : 'destructive'} className="gap-1">
                  {testResult.success ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <XCircle className="size-3" />
                  )}
                  {testResult.message.slice(0, 60)}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Embedding */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-5" />
              {t('settings.embeddingConfig')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t('settings.embeddingProvider')}
                </label>
                <Select
                  value={form.embedding_provider ?? 'local'}
                  onValueChange={(v) => updateField('embedding_provider', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {embeddingProviders.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">{t('settings.modelName')}</label>
                <Input
                  value={form.embedding_model ?? ''}
                  onChange={(e) => updateField('embedding_model', e.target.value)}
                  placeholder="BAAI/bge-m3"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          {t('settings.envHint')}
        </p>
      </div>
    </div>
  );
}

function ProviderFields({
  prefix,
  form,
  onChange,
  modelPlaceholder,
}: {
  prefix: string;
  form: Record<string, string>;
  onChange: (key: string, value: string) => void;
  modelPlaceholder: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          <Key className="mr-1 inline size-3.5" />
          {t('settings.apiKey')}
        </label>
        <Input
          type="password"
          value={form[`${prefix}_api_key`] ?? ''}
          onChange={(e) => onChange(`${prefix}_api_key`, e.target.value)}
          placeholder="sk-..."
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">{t('settings.modelName')}</label>
        <Input
          value={form[`${prefix}_model`] ?? ''}
          onChange={(e) => onChange(`${prefix}_model`, e.target.value)}
          placeholder={modelPlaceholder}
        />
      </div>
    </div>
  );
}
