import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { TooltipProvider } from '@/components/ui/tooltip';
import IconSidebar from './IconSidebar';
import MobileBottomNav from './MobileBottomNav';
import PageTransition from './PageTransition';
import { useIsMobile } from '@/hooks/use-breakpoint';

export default function AppShell() {
  const location = useLocation();
  const isMobile = useIsMobile();

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        {!isMobile && <IconSidebar />}
        <main className={`flex-1 overflow-y-auto ${isMobile ? 'pb-16' : ''}`}>
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname}>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>
        {isMobile && <MobileBottomNav />}
      </div>
    </TooltipProvider>
  );
}
