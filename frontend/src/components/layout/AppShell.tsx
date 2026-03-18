import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import DualSidebar from './DualSidebar';
import TopBar from './TopBar';
import MobileBottomNav from './MobileBottomNav';
import { useIsMobile } from '@/hooks/use-breakpoint';
import { useSidebarState, SidebarContext } from '@/hooks/use-sidebar';

export default function AppShell() {
  const isMobile = useIsMobile();
  const sidebarState = useSidebarState();

  return (
    <SidebarContext.Provider value={sidebarState}>
      <TooltipProvider>
        {isMobile ? (
          <MobileLayout />
        ) : (
          <DesktopLayout />
        )}
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

function DesktopLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <DualSidebar />
      <div className="flex flex-1 flex-col min-h-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function MobileLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <main className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}
