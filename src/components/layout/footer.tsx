import { Bot } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
            <Bot className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold gradient-text">AgentForge</span>
        </div>
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} AgentForge. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
