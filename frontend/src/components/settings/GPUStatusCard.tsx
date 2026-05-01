import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { Cpu, HardDrive, Loader2, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/lib/query-keys';
import { gpuApi } from '@/services/api';

export default function GPUStatusCard() {
  const { data: gpuStatus, isLoading, refetch } = useQuery({
    queryKey: queryKeys.gpu.status,
    queryFn: gpuApi.status,
    refetchInterval: 10000,
  });

  const unloadMutation = useToastMutation({
    mutationFn: gpuApi.unload,
    successMessage: 'GPU models unloaded',
    errorMessage: 'Failed to unload GPU models',
    onSuccess: () => refetch(),
  });

  const models = (gpuStatus?.models as Record<string, unknown>) ?? {};
  const mineru = (gpuStatus?.mineru as Record<string, unknown>) ?? {};
  const memory = (gpuStatus?.gpu_memory as Array<Record<string, unknown>>) ?? [];

  const formatBytes = (mb: number | undefined) => {
    if (mb == null) return 'N/A';
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Cpu className="size-5" />
            GPU Status
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <Loader2 className={`mr-1 size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* GPU Memory */}
        {memory.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">GPU Memory</h4>
            {memory.map((gpu) => (
              <div key={gpu.gpu_id as string} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="size-4 text-muted-foreground" />
                    <span className="font-mono text-sm">GPU {String(gpu.gpu_id)}</span>
                  </div>
                  <Badge variant="outline">
                    {formatBytes(gpu.used_mb as number)} / {formatBytes(gpu.total_mb as number)}
                  </Badge>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${((gpu.used_mb as number) / (gpu.total_mb as number)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No GPU detected or CUDA not available
          </div>
        )}

        {/* Loaded Models */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Loaded Models</h4>
          {Object.keys(models).length > 0 ? (
            <div className="space-y-1">
              {Object.entries(models).map(([name, model]) => (
                <div key={name} className="flex items-center justify-between rounded-lg border p-2">
                  <span className="font-mono text-sm">{name}</span>
                  <Badge variant="secondary">{(model as Record<string, unknown>).status ?? 'loaded'}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No models loaded</p>
          )}
        </div>

        {/* MinerU Status */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">MinerU</h4>
          <div className="flex items-center gap-2">
            <Badge variant={mineru.status === 'running' ? 'default' : 'secondary'}>
              {mineru.status ?? 'inactive'}
            </Badge>
            {mineru.pid && <span className="text-sm text-muted-foreground">PID: {String(mineru.pid)}</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => unloadMutation.mutate()}
            disabled={unloadMutation.isPending || Object.keys(models).length === 0}
            className="gap-1.5"
          >
            <Power className="size-3.5" />
            Unload All Models
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
