import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import type { Project } from '@/types';

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then((r: any) => r.data),
  });

  const projects: Project[] = data?.items || [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">Manage your literature research projects</p>
        </div>
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          + New Project
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <div className="text-4xl mb-4">🍳</div>
          <h2 className="text-lg font-semibold text-foreground mb-2">No projects yet</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first project to start managing scientific literature.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="group rounded-xl border border-border bg-card p-5 transition-all hover:shadow-md hover:border-primary/30"
            >
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {project.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{project.description || 'No description'}</p>
              <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                <span>📄 {project.paper_count} papers</span>
                <span>🏷️ {project.keyword_count} keywords</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
