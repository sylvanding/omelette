import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import ProjectDetail from '@/pages/ProjectDetail';
import ProjectOverview from '@/pages/project/ProjectOverview';
import PapersPage from '@/pages/project/PapersPage';
import KeywordsPage from '@/pages/project/KeywordsPage';
import SearchPage from '@/pages/project/SearchPage';
import RAGChatPage from '@/pages/project/RAGChatPage';
import WritingPage from '@/pages/project/WritingPage';
import TasksPage from '@/pages/project/TasksPage';
import Settings from '@/pages/Settings';

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
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="projects/:projectId" element={<ProjectDetail />}>
              <Route index element={<ProjectOverview />} />
              <Route path="papers" element={<PapersPage />} />
              <Route path="keywords" element={<KeywordsPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="rag" element={<RAGChatPage />} />
              <Route path="writing" element={<WritingPage />} />
              <Route path="tasks" element={<TasksPage />} />
            </Route>
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
