import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from '@/components/layout/AppShell';
import PlaygroundPage from '@/pages/PlaygroundPage';
import KnowledgeBasesPage from '@/pages/KnowledgeBasesPage';
import ChatHistoryPage from '@/pages/ChatHistoryPage';
import SettingsPage from '@/pages/SettingsPage';
import ProjectDetail from '@/pages/ProjectDetail';
import ProjectOverview from '@/pages/project/ProjectOverview';
import PapersPage from '@/pages/project/PapersPage';
import KeywordsPage from '@/pages/project/KeywordsPage';
import SearchPage from '@/pages/project/SearchPage';
import RAGChatPage from '@/pages/project/RAGChatPage';
import WritingPage from '@/pages/project/WritingPage';
import TasksPage from '@/pages/project/TasksPage';

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
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
