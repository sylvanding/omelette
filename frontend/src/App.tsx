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
const OverviewPage = lazy(() => import('@/pages/project/OverviewPage'));
const PapersPage = lazy(() => import('@/pages/project/PapersPage'));
const WritingPage = lazy(() => import('@/pages/project/WritingPage'));
const TasksPage = lazy(() => import('@/pages/project/TasksPage'));
const DiscoveryPage = lazy(() => import('@/pages/project/DiscoveryPage'));
const PDFReaderPage = lazy(() => import('@/pages/project/PDFReaderPage'));
const AnalyticsPage = lazy(() => import('@/pages/project/AnalyticsPage'));
const TrendsPage = lazy(() => import('@/pages/project/TrendsPage'));
const GapAnalysisPage = lazy(() => import('@/pages/project/GapAnalysisPage'));
const ReviewsPage = lazy(() => import('@/pages/project/ReviewsPage'));
const ConceptsPage = lazy(() => import('@/pages/project/ConceptsPage'));
const LibraryPage = lazy(() => import('@/pages/project/LibraryPage'));
const FeedPage = lazy(() => import('@/pages/project/FeedPage'));
const TimelinePage = lazy(() => import('@/pages/project/TimelinePage'));
const ActivityFeedPage = lazy(() => import('@/pages/project/ActivityFeedPage'));
const AudioOverviewsPage = lazy(() => import('@/pages/project/AudioOverviewsPage'));
const SearchPage = lazy(() => import('@/pages/project/SearchPage'));
const NotificationsPage = lazy(() => import('@/pages/project/NotificationsPage'));
const NotesPage = lazy(() => import('@/pages/project/NotesPage'));
const TeamMembersPage = lazy(() => import('@/pages/project/TeamMembersPage'));
const CollectionsPage = lazy(() => import('@/pages/project/CollectionsPage'));
const ExportPage = lazy(() => import('@/pages/project/ExportPage'));
const OCRPage = lazy(() => import('@/pages/project/OCRPage'));
const CrawlerPage = lazy(() => import('@/pages/project/CrawlerPage'));
const DedupPage = lazy(() => import('@/pages/project/DedupPage'));
const KeywordsPage = lazy(() => import('@/pages/project/KeywordsPage'));
const SubscriptionPage = lazy(() => import('@/pages/project/SubscriptionPage'));
const PipelinesPage = lazy(() => import('@/pages/project/PipelinesPage'));

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
              <Route index element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><OverviewPage /></Suspense></ErrorBoundary>
              } />
              <Route path="overview" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><OverviewPage /></Suspense></ErrorBoundary>
              } />
              <Route path="papers" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><PapersPage /></Suspense></ErrorBoundary>
              } />
              <Route path="papers/:paperId/read" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><PDFReaderPage /></Suspense></ErrorBoundary>
              } />
              <Route path="discovery" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><DiscoveryPage /></Suspense></ErrorBoundary>
              } />
              <Route path="writing" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><WritingPage /></Suspense></ErrorBoundary>
              } />
              <Route path="analytics" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><AnalyticsPage /></Suspense></ErrorBoundary>
              } />
              <Route path="trends" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><TrendsPage /></Suspense></ErrorBoundary>
              } />
              <Route path="gaps" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><GapAnalysisPage /></Suspense></ErrorBoundary>
              } />
              <Route path="reviews" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><ReviewsPage /></Suspense></ErrorBoundary>
              } />
              <Route path="concepts" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><ConceptsPage /></Suspense></ErrorBoundary>
              } />
              <Route path="library" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><LibraryPage /></Suspense></ErrorBoundary>
              } />
              <Route path="feed" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><FeedPage /></Suspense></ErrorBoundary>
              } />
              <Route path="timeline" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><TimelinePage /></Suspense></ErrorBoundary>
              } />
              <Route path="activity" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><ActivityFeedPage /></Suspense></ErrorBoundary>
              } />
              <Route path="audio-overviews" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><AudioOverviewsPage /></Suspense></ErrorBoundary>
              } />
              <Route path="search" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><SearchPage /></Suspense></ErrorBoundary>
              } />
              <Route path="notifications" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><NotificationsPage /></Suspense></ErrorBoundary>
              } />
              <Route path="notes" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><NotesPage /></Suspense></ErrorBoundary>
              } />
              <Route path="team" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><TeamMembersPage /></Suspense></ErrorBoundary>
              } />
              <Route path="collections" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><CollectionsPage /></Suspense></ErrorBoundary>
              } />
              <Route path="export" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><ExportPage /></Suspense></ErrorBoundary>
              } />
              <Route path="ocr" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><OCRPage /></Suspense></ErrorBoundary>
              } />
              <Route path="crawler" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><CrawlerPage /></Suspense></ErrorBoundary>
              } />
              <Route path="dedup" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><DedupPage /></Suspense></ErrorBoundary>
              } />
              <Route path="keywords" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><KeywordsPage /></Suspense></ErrorBoundary>
              } />
              <Route path="subscriptions" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><SubscriptionPage /></Suspense></ErrorBoundary>
              } />
              <Route path="pipelines" element={
                <ErrorBoundary><Suspense fallback={<LoadingState />}><PipelinesPage /></Suspense></ErrorBoundary>
              } />
              <Route path="rag" element={<Navigate to="/" replace />} />
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
