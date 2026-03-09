import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function Settings() {
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r: any) => r.data),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Settings</h1>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">LLM Configuration</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Provider', value: data?.llm_provider },
                { label: 'Aliyun API Key', value: data?.aliyun_api_key },
                { label: 'Aliyun Model', value: data?.aliyun_model },
                { label: 'Volcengine API Key', value: data?.volcengine_api_key },
                { label: 'Volcengine Model', value: data?.volcengine_model },
              ].map((item) => (
                <div key={item.label}>
                  <div className="text-sm text-muted-foreground">{item.label}</div>
                  <div className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono">
                    {item.value || '-'}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">System</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: 'Data Directory', value: data?.data_dir },
                { label: 'Embedding Model', value: data?.embedding_model },
                { label: 'Reranker Model', value: data?.reranker_model },
                { label: 'GPU Devices', value: data?.cuda_visible_devices },
              ].map((item) => (
                <div key={item.label}>
                  <div className="text-sm text-muted-foreground">{item.label}</div>
                  <div className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono">
                    {item.value || '-'}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            To update settings, edit the <code className="rounded bg-secondary px-1">.env</code> file and restart the server.
          </p>
        </div>
      )}
    </div>
  );
}
