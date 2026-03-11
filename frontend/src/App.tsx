import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingState } from '@/components/ui/loading-state';
import AppShell from '@/components/layout/AppShell';

const PlaygroundPage = lazy(() => import('@/pages/PlaygroundPage'));
const KnowledgeBasesPage = lazy(() => import('@/pages/KnowledgeBasesPage'));
const ChatHistoryPage = lazy(() => import('@/pages/ChatHistoryPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const PapersPage = lazy(() => import('@/pages/project/PapersPage'));
const WritingPage = lazy(() => import('@/pages/project/WritingPage'));
const TasksPage = lazy(() => import('@/pages/project/TasksPage'));
const DiscoveryPage = lazy(() => import('@/pages/project/DiscoveryPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Suspense fallback={<LoadingState className="h-screen" />}>
            <Routes>
              <Route path="/" element={<AppShell />}>
                <Route index element={<PlaygroundPage />} />
                <Route path="chat/:conversationId" element={<PlaygroundPage />} />
                <Route path="knowledge-bases" element={<KnowledgeBasesPage />} />
                <Route path="history" element={<ChatHistoryPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="tasks" element={<TasksPage />} />
                <Route path="projects/:projectId" element={<ProjectDetail />}>
                  <Route index element={<PapersPage />} />
                  <Route path="papers" element={<PapersPage />} />
                  <Route path="discovery" element={<DiscoveryPage />} />
                  <Route path="writing" element={<WritingPage />} />
                  <Route path="keywords" element={<Navigate to="../discovery" replace />} />
                  <Route path="search" element={<Navigate to="../discovery" replace />} />
                  <Route path="subscriptions" element={<Navigate to="../discovery" replace />} />
                  <Route path="rag" element={<Navigate to="/" replace />} />
                  <Route path="tasks" element={<Navigate to="/tasks" replace />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
