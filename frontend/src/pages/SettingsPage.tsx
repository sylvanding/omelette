import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

const providers = [
  { value: 'mock', label: 'Mock (测试)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'aliyun', label: '阿里云百炼' },
  { value: 'volcengine', label: '火山引擎' },
  { value: 'ollama', label: 'Ollama (本地)' },
];

const embeddingProviders = [
  { value: 'mock', label: 'Mock (测试)' },
  { value: 'local', label: '本地 GPU/CPU' },
  { value: 'api', label: 'API' },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => settingsApi.testConnection(),
    onSuccess: (res) => {
      const d = res?.data;
      setTestResult({
        success: !!d?.success,
        message: d?.success ? `连接成功：${d.response}` : `连接失败：${d?.error}`,
      });
    },
    onError: (err) => {
      setTestResult({ success: false, message: String(err) });
    },
  });

  useEffect(() => {
    if (data?.data) {
      const d = data.data as Record<string, string>;
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
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" />
        加载设置...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">设置</h1>
            <p className="text-sm text-muted-foreground">
              配置 LLM 模型、Embedding 和系统参数
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
            保存
          </Button>
        </div>

        {/* LLM Provider */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="size-5" />
              LLM 模型配置
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">模型提供商</label>
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
                <label className="mb-1.5 block text-sm font-medium">温度</label>
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
                    服务地址
                  </label>
                  <Input
                    value={form.ollama_base_url ?? ''}
                    onChange={(e) => updateField('ollama_base_url', e.target.value)}
                    placeholder="http://localhost:11434"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">模型名称</label>
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
                Mock 模式将返回预设测试数据，无需配置。
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
                测试连接
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
              Embedding 配置
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Embedding 提供商
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
                <label className="mb-1.5 block text-sm font-medium">模型名称</label>
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
          也可以通过编辑 <code className="rounded bg-muted px-1">.env</code>{' '}
          文件来配置，前端设置优先级更高。
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
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          <Key className="mr-1 inline size-3.5" />
          API Key
        </label>
        <Input
          type="password"
          value={form[`${prefix}_api_key`] ?? ''}
          onChange={(e) => onChange(`${prefix}_api_key`, e.target.value)}
          placeholder="sk-..."
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">模型名称</label>
        <Input
          value={form[`${prefix}_model`] ?? ''}
          onChange={(e) => onChange(`${prefix}_model`, e.target.value)}
          placeholder={modelPlaceholder}
        />
      </div>
    </div>
  );
}
