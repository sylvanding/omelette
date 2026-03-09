import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Project } from '@/types';

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then((r: any) => r.data),
    enabled: !!projectId,
  });

  const project: Project | undefined = data;

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  }

  if (!project) {
    return <div className="py-20 text-center text-muted-foreground">Project not found</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
        <p className="text-sm text-muted-foreground">{project.description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Papers', value: project.paper_count, icon: '📄' },
          { label: 'Keywords', value: project.keyword_count, icon: '🏷️' },
          { label: 'Domain', value: project.domain || '-', icon: '🔬' },
          { label: 'Created', value: new Date(project.created_at).toLocaleDateString(), icon: '📅' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-sm text-muted-foreground">{stat.label}</div>
            <div className="text-lg font-semibold text-foreground">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
        <p>Module pages (Keywords, Search, Papers, RAG, Writing) will be implemented in subsequent phases.</p>
      </div>
    </div>
  );
}
