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
const ProjectOverview = lazy(() => import('@/pages/project/ProjectOverview'));
const PapersPage = lazy(() => import('@/pages/project/PapersPage'));
const KeywordsPage = lazy(() => import('@/pages/project/KeywordsPage'));
const SearchPage = lazy(() => import('@/pages/project/SearchPage'));
const RAGChatPage = lazy(() => import('@/pages/project/RAGChatPage'));
const WritingPage = lazy(() => import('@/pages/project/WritingPage'));
const TasksPage = lazy(() => import('@/pages/project/TasksPage'));
const SubscriptionsPage = lazy(() => import('@/pages/project/SubscriptionsPage'));

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
                <Route path="knowledge-bases" element={<KnowledgeBasesPage />} />
                <Route path="history" element={<ChatHistoryPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="projects/:projectId" element={<ProjectDetail />}>
                  <Route index element={<ProjectOverview />} />
                  <Route path="papers" element={<PapersPage />} />
                  <Route path="keywords" element={<KeywordsPage />} />
                  <Route path="search" element={<SearchPage />} />
                  <Route path="rag" element={<RAGChatPage />} />
                  <Route path="writing" element={<WritingPage />} />
                  <Route path="tasks" element={<TasksPage />} />
                  <Route path="subscriptions" element={<SubscriptionsPage />} />
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
