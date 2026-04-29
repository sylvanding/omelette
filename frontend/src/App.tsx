import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingState } from '@/components/ui/loading-state';
import AppShell from '@/components/layout/AppShell';

import PlaygroundPage from '@/pages/PlaygroundPage';
const KnowledgeBasesPage = lazy(() => import('@/pages/KnowledgeBasesPage'));
const ChatHistoryPage = lazy(() => import('@/pages/ChatHistoryPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const PapersPage = lazy(() => import('@/pages/project/PapersPage'));
const WritingPage = lazy(() => import('@/pages/project/WritingPage'));
const TasksPage = lazy(() => import('@/pages/project/TasksPage'));
const DiscoveryPage = lazy(() => import('@/pages/project/DiscoveryPage'));
const PDFReaderPage = lazy(() => import('@/pages/project/PDFReaderPage'));
const AnalyticsPage = lazy(() => import('@/pages/project/AnalyticsPage'));
const TimelinePage = lazy(() => import('@/pages/project/TimelinePage'));

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<PlaygroundPage key="playground" />} />
            <Route path="chat/:conversationId" element={<PlaygroundPage key="playground" />} />
            <Route path="knowledge-bases" element={
              <ErrorBoundary><Suspense fallback={<LoadingState />}><KnowledgeBasesPage /></Suspense></ErrorBoundary>
            } />
            <Route path="history" element={
              <ErrorBoundary><Suspense fallback={<LoadingState />}><ChatHistoryPage /></Suspense></ErrorBoundary>
            } />
            <Route path="settings" element={
              <ErrorBoundary><Suspense fallback={<LoadingState />}><SettingsPage /></Suspense></ErrorBoundary>
            } />
            <Route path="tasks" element={
              <ErrorBoundary><Suspense fallback={<LoadingState />}><TasksPage /></Suspense></ErrorBoundary>
            } />
            <Route path="projects/:projectId" element={
              <ErrorBoundary><Suspense fallback={<LoadingState />}><ProjectDetail /></Suspense></ErrorBoundary>
            }>
              <Route index element={<PapersPage />} />
              <Route path="papers" element={<PapersPage />} />
              <Route path="papers/:paperId/read" element={<PDFReaderPage />} />
              <Route path="discovery" element={<DiscoveryPage />} />
              <Route path="writing" element={<WritingPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="timeline" element={<TimelinePage />} />
              <Route path="keywords" element={<Navigate to="../discovery" replace />} />
              <Route path="search" element={<Navigate to="../discovery" replace />} />
              <Route path="subscriptions" element={<Navigate to="../discovery" replace />} />
              <Route path="rag" element={<Navigate to="/" replace />} />
              <Route path="tasks" element={<Navigate to="/tasks" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
