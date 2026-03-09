import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  Bot,
  Database,
  Activity,
  Sparkles,
  Radar,
  Search,
  ShieldCheck,
  Layers3,
  Globe,
} from 'lucide-react';

export default function LandingPage() {
  const t = useTranslations('landing');
  const workflow = t.raw('workflow.steps') as Array<{ title: string; description: string }>;
  const capabilityCards = t.raw('capabilities.cards') as Array<{
    title: string;
    description: string;
  }>;
  const examples = t.raw('examples.cards') as Array<{
    title: string;
    description: string;
    badge: string;
  }>;
  const pricing = t.raw('pricing.tiers') as Array<{
    name: string;
    price: string;
    description: string;
    points: string[];
    featured?: boolean;
  }>;

  const workspaceIcons = [Bot, Database, Activity, Sparkles];
  const capabilityIcons = [Radar, Search, ShieldCheck, Layers3];
  const exampleIcons = [Globe, Database, Activity];

  return (
    <>
      <Header />
      <main className="flex-1">
        <section id="product" className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 gradient-mesh" />
          <div className="container relative mx-auto px-4 py-16 md:py-24">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div className="space-y-7">
                <Badge variant="outline" className="bg-surface-glass">
                  {t('hero.badge')}
                </Badge>
                <div className="space-y-5">
                  <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
                    {t('hero.title')}
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl">
                    {t('hero.subtitle')}
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button size="lg" asChild>
                    <Link href="/signup">
                      {t('hero.cta')}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <a href="#capabilities">{t('hero.secondaryCta')}</a>
                  </Button>
                </div>
                <p className="text-sm leading-7 text-muted-foreground">{t('hero.footnote')}</p>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.5rem] border border-border/70 bg-surface-glass p-5">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t('hero.metrics.metric1.label')}
                    </div>
                    <div className="mt-2 text-3xl font-semibold">{t('hero.metrics.metric1.value')}</div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('hero.metrics.metric1.copy')}</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-border/70 bg-surface-glass p-5">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t('hero.metrics.metric2.label')}
                    </div>
                    <div className="mt-2 text-3xl font-semibold">{t('hero.metrics.metric2.value')}</div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('hero.metrics.metric2.copy')}</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-border/70 bg-surface-glass p-5">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t('hero.metrics.metric3.label')}
                    </div>
                    <div className="mt-2 text-3xl font-semibold">{t('hero.metrics.metric3.value')}</div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('hero.metrics.metric3.copy')}</p>
                  </div>
                </div>
              </div>

              <div className="glass-card panel-grid rounded-[2rem] p-5 md:p-7">
                <div className="grid gap-4">
                  <div className="rounded-[1.5rem] border border-border/70 bg-surface-glass-strong p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          {t('hero.panel.eyebrow')}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold">{t('hero.panel.title')}</h2>
                      </div>
                      <div className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
                        {t('hero.panel.badge')}
                      </div>
                    </div>
                    <div className="mt-6 grid gap-3">
                      {(['home', 'data', 'monitor', 'insights'] as const).map((key, index) => {
                        const Icon = workspaceIcons[index];

                        return (
                          <div
                            key={key}
                            className="flex items-start gap-3 rounded-[1.35rem] border border-border/70 bg-background/85 p-4"
                          >
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{t(`hero.panel.workspaces.${key}.title`)}</p>
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                {t(`hero.panel.workspaces.${key}.description`)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-[1.5rem] border border-border/70 bg-[#194a3d] px-5 py-4 text-primary-foreground">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-primary-foreground/70">
                      {t('hero.panel.operatorLabel')}
                    </div>
                    <p className="mt-2 text-sm leading-7 text-primary-foreground/90">
                      {t('hero.panel.operatorCopy')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border/70 bg-surface-glass/60">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="space-y-4">
                <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  {t('product.eyebrow')}
                </span>
                <h2 className="text-balance text-3xl font-semibold md:text-5xl">{t('product.title')}</h2>
                <p className="max-w-xl text-base leading-7 text-muted-foreground md:text-lg">
                  {t('product.description')}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {workflow.map((step, index) => (
                  <article key={step.title} className="rounded-[1.6rem] border border-border/70 bg-surface-glass p-5 shadow-[0_16px_38px_rgba(31,37,32,0.05)] dark:shadow-[0_16px_38px_rgba(0,0,0,0.2)]">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t('workflow.stepLabel', { value: String(index + 1).padStart(2, '0') })}
                    </div>
                    <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{step.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="capabilities" className="container mx-auto px-4 py-16 md:py-20">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-4">
              <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {t('capabilities.eyebrow')}
              </span>
              <h2 className="text-balance text-3xl font-semibold md:text-5xl">{t('capabilities.title')}</h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              {t('capabilities.subtitle')}
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {capabilityCards.map((card, index) => {
              const Icon = capabilityIcons[index];

              return (
                <article key={card.title} className="rounded-[1.7rem] border border-border/70 bg-surface-glass p-6 shadow-[0_16px_36px_rgba(31,37,32,0.05)] dark:shadow-[0_16px_36px_rgba(0,0,0,0.2)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold">{card.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{card.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="examples" className="border-y border-border/70 bg-surface-glass/60">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <div className="space-y-4">
              <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {t('examples.eyebrow')}
              </span>
              <h2 className="text-balance text-3xl font-semibold md:text-5xl">{t('examples.title')}</h2>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                {t('examples.subtitle')}
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {examples.map((card, index) => {
                const Icon = exampleIcons[index];

                return (
                  <article key={card.title} className="rounded-[1.7rem] border border-border/70 bg-surface-glass p-6 shadow-[0_16px_36px_rgba(31,37,32,0.05)] dark:shadow-[0_16px_36px_rgba(0,0,0,0.2)]">
                    <Badge variant="outline" className="bg-surface-glass-strong">
                      {card.badge}
                    </Badge>
                    <div className="mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-6 text-xl font-semibold">{card.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{card.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="pricing" className="container mx-auto px-4 py-16 md:py-20">
          <div className="space-y-4 text-center">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {t('pricing.eyebrow')}
            </span>
            <h2 className="text-balance text-3xl font-semibold md:text-5xl">{t('pricing.title')}</h2>
            <p className="mx-auto max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              {t('pricing.subtitle')}
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {pricing.map((tier) => (
              <article
                key={tier.name}
                className={`rounded-[1.8rem] border p-6 shadow-[0_18px_40px_rgba(31,37,32,0.05)] dark:shadow-[0_18px_40px_rgba(0,0,0,0.2)] ${
                  tier.featured
                    ? 'border-primary/30 bg-[#194a3d] text-primary-foreground'
                    : 'border-border/70 bg-surface-glass text-foreground'
                }`}
              >
                <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">{tier.name}</div>
                <div className="mt-4 text-4xl font-semibold">{tier.price}</div>
                <p className={`mt-3 text-sm leading-7 ${tier.featured ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  {tier.description}
                </p>
                <ul className="mt-6 space-y-3 text-sm leading-7">
                  {tier.points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <span className={`mt-2 h-1.5 w-1.5 rounded-full ${tier.featured ? 'bg-primary-foreground' : 'bg-primary'}`} />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border/70 bg-[#194a3d] text-primary-foreground">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl space-y-4">
                <span className="text-[11px] uppercase tracking-[0.22em] text-primary-foreground/70">
                  {t('cta.eyebrow')}
                </span>
                <h2 className="text-balance text-3xl font-semibold md:text-5xl">{t('cta.title')}</h2>
                <p className="text-base leading-7 text-primary-foreground/80 md:text-lg">
                  {t('cta.subtitle')}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" variant="secondary" asChild>
                  <Link href="/signup">
                    {t('cta.primary')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" asChild>
                  <Link href="/login">{t('cta.secondary')}</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
