import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Bot, Globe, MessageSquare, Share2 } from 'lucide-react';

export default function LandingPage() {
  const t = useTranslations('landing');
  const nav = useTranslations('nav');

  return (
    <>
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b bg-gradient-to-b from-muted/50 to-background">
          <div className="container mx-auto px-4 py-24 md:py-32">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted px-4 py-1.5 text-sm">
                <Bot className="h-4 w-4" />
                <span>AI-Powered Agent Builder</span>
              </div>
              <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl">
                {t('hero.title')}
              </h1>
              <p className="mb-8 text-lg text-muted-foreground md:text-xl">
                {t('hero.subtitle')}
              </p>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Button size="lg" asChild>
                  <Link href="/signup">{t('hero.cta')}</Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="#features">{t('hero.ctaSecondary')}</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="container mx-auto px-4 py-24">
          <h2 className="mb-12 text-center text-3xl font-bold">
            {t('features.title')}
          </h2>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<Globe className="h-8 w-8" />}
              title={t('features.crawl.title')}
              description={t('features.crawl.description')}
            />
            <FeatureCard
              icon={<Bot className="h-8 w-8" />}
              title={t('features.build.title')}
              description={t('features.build.description')}
            />
            <FeatureCard
              icon={<MessageSquare className="h-8 w-8" />}
              title={t('features.chat.title')}
              description={t('features.chat.description')}
            />
            <FeatureCard
              icon={<Share2 className="h-8 w-8" />}
              title={t('features.share.title')}
              description={t('features.share.description')}
            />
          </div>
        </section>

        {/* CTA Section */}
        <section className="border-t bg-muted/30">
          <div className="container mx-auto px-4 py-16 text-center">
            <h2 className="mb-4 text-2xl font-bold">
              {t('hero.title')}
            </h2>
            <Button size="lg" asChild>
              <Link href="/signup">{nav('signUp')}</Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground transition-shadow hover:shadow-md">
      <div className="mb-4 text-primary">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
