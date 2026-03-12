import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SidebarToggleButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  if (!collapsed) return null;

  return (
    <Button variant="ghost" size="icon" className="size-7" onClick={onToggle}>
      <PanelLeft className="size-4" />
    </Button>
  );
}
