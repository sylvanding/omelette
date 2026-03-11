import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, BookOpen, FileText, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { projectApi } from '@/services/api';
import type { Project } from '@/types';

export default function KnowledgeBasesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectApi.list(1, 100),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      projectApi.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreate(false);
      setName('');
      setDesc('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => projectApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const projects: Project[] = data?.data?.items ?? [];
  const filtered = search
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.description?.toLowerCase().includes(search.toLowerCase()),
      )
    : projects;

  const handleCreate = () => {
    if (!name.trim()) return;
    createMutation.mutate({ name: name.trim(), description: desc.trim() || undefined });
  };

  const handleDelete = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(t('kb.confirmDelete', { name: project.name }))) {
      deleteMutation.mutate(project.id);
    }
  };

  return (
    <div className="h-full p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('kb.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('kb.subtitle')}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="size-4" />
            {t('kb.new')}
          </Button>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('kb.searchPlaceholder')}
              className="pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            {t('common.loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <BookOpen className="mx-auto mb-3 size-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">
              {search ? t('kb.noMatch') : t('kb.empty')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {search ? t('kb.noMatchDesc') : t('kb.emptyDesc')}
            </p>
            {!search && (
              <Button onClick={() => setShowCreate(true)} className="mt-4 gap-1.5">
                <Plus className="size-4" />
                {t('kb.new')}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  to={`/projects/${project.id}`}
                  className="group relative block rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md"
                >
                  <button
                    onClick={(e) => handleDelete(e, project)}
                    disabled={deleteMutation.isPending}
                    className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>

                  <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                    <BookOpen className="size-5 text-primary" />
                  </div>

                  <h3 className="font-semibold">{project.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {project.description || t('kb.noDesc')}
                  </p>

                  <div className="mt-4 flex gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <FileText className="size-3" />
                      {t('kb.paperCount', { count: project.paper_count })}
                    </Badge>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('kb.createTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">{t('kb.name')}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('kb.namePlaceholder')}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">{t('kb.description')}</label>
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={t('kb.descPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || createMutation.isPending}
            >
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
