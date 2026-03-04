import { useTranslations } from 'next-intl';
import { Bot } from 'lucide-react';

export function Footer() {
  const t = useTranslations('common');

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bot className="h-4 w-4" />
          <span>{t('appName')}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} {t('appName')}
        </p>
      </div>
    </footer>
  );
}
