import { Outlet } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import IconSidebar from './IconSidebar';
import MobileBottomNav from './MobileBottomNav';
import { useIsMobile } from '@/hooks/use-breakpoint';

export default function AppShell() {
  const isMobile = useIsMobile();

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        {!isMobile && <IconSidebar />}
        <main className={`flex-1 overflow-y-auto ${isMobile ? 'pb-16' : ''}`}>
          <Outlet />
        </main>
        {isMobile && <MobileBottomNav />}
      </div>
    </TooltipProvider>
  );
}
