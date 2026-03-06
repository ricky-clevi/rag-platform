import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Bot, Globe, MessageSquare, Share2, Zap, Shield, Brain, ArrowRight, CheckCircle, Users, Star } from 'lucide-react';

export default function LandingPage() {
  const t = useTranslations('landing');
  const nav = useTranslations('nav');

  return (
    <>
      <Header />
      <main className="flex-1">
        {/* HERO: gradient mesh background, large headline, animated badge */}
        <section className="relative overflow-hidden gradient-mesh border-b">
          {/* Background decorative orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
          </div>

          <div className="container relative mx-auto px-4 py-28 md:py-40">
            <div className="mx-auto max-w-4xl text-center">
              {/* Badge */}
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">
                <Zap className="h-4 w-4" />
                <span>Powered by Gemini AI &middot; Hybrid RAG Search</span>
              </div>

              {/* Main headline */}
              <h1 className="mb-6 text-5xl font-extrabold tracking-tight md:text-7xl">
                <span>{t('hero.title').split(' ').slice(0, 4).join(' ')}</span>
                <br />
                <span className="gradient-text">{t('hero.title').split(' ').slice(4).join(' ')}</span>
              </h1>

              <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed">
                {t('hero.subtitle')}
              </p>

              {/* CTAs */}
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Button size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/25" asChild>
                  <Link href="/signup">
                    {t('hero.cta')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
                  <Link href="#features">{t('hero.ctaSecondary')}</Link>
                </Button>
              </div>

              {/* Social proof */}
              <div className="mt-10 flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-8 w-8 rounded-full border-2 border-background bg-gradient-to-br from-indigo-400 to-violet-500" />
                  ))}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">1,000+</span> agents created by developers
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATS BAR */}
        <section className="border-b bg-muted/30">
          <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-3 gap-8 text-center">
              {[
                { value: '10K+', label: t('stats.agents') },
                { value: '500K+', label: t('stats.pages') },
                { value: '50K+', label: t('stats.chats') },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl font-bold text-primary md:text-3xl">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="features" className="container mx-auto px-4 py-24">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">{t('features.title')}</h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              From URL to intelligent AI agent in minutes.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Globe, title: t('features.crawl.title'), desc: t('features.crawl.description'), color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { icon: Brain, title: t('features.build.title'), desc: t('features.build.description'), color: 'text-violet-500', bg: 'bg-violet-500/10' },
              { icon: MessageSquare, title: t('features.chat.title'), desc: t('features.chat.description'), color: 'text-primary', bg: 'bg-primary/10' },
              { icon: Share2, title: t('features.share.title'), desc: t('features.share.description'), color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            ].map((feature, i) => (
              <div key={i} className="group relative rounded-2xl border bg-card p-6 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1">
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.bg}`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Step {i + 1}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURES LIST */}
        <section className="border-t bg-muted/20">
          <div className="container mx-auto px-4 py-24">
            <div className="grid gap-16 md:grid-cols-2 md:items-center">
              <div>
                <h2 className="mb-6 text-3xl font-bold md:text-4xl">
                  Everything you need to build{' '}
                  <span className="gradient-text">intelligent agents</span>
                </h2>
                <div className="space-y-4">
                  {[
                    'Deep website crawling with SPA support',
                    'Hybrid semantic + keyword search (RAG)',
                    'Real-time streaming AI responses',
                    'Source citations with page references',
                    'Share links with expiry & passcode protection',
                    'Multi-language support (EN / KO)',
                  ].map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mock UI preview */}
              <div className="relative rounded-2xl border bg-card p-1 shadow-2xl shadow-primary/10">
                <div className="rounded-xl bg-muted/50 p-4">
                  <div className="mb-4 flex items-center gap-2 border-b pb-3">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">AgentForge AI</div>
                      <div className="text-xs text-muted-foreground">powered by Gemini</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <div className="rounded-2xl rounded-br-md bg-primary px-4 py-2 text-sm text-primary-foreground max-w-[80%]">
                        What are your pricing plans?
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="rounded-2xl rounded-bl-md bg-background border px-4 py-2 text-sm max-w-[80%]">
                        We offer three plans: <strong>Starter</strong> ($0/mo), <strong>Pro</strong> ($29/mo), and <strong>Enterprise</strong> (custom). The Pro plan includes unlimited agents and...
                      </div>
                    </div>
                    <div className="ml-9 flex gap-2">
                      <div className="rounded-lg border bg-primary/5 px-3 py-1.5 text-xs text-primary cursor-pointer hover:bg-primary/10">
                        Pricing page
                      </div>
                      <div className="rounded-lg border bg-primary/5 px-3 py-1.5 text-xs text-primary cursor-pointer hover:bg-primary/10">
                        Feature comparison
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden border-t">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 gradient-mesh opacity-50" />
          </div>
          <div className="container relative mx-auto px-4 py-24 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Ready to build your <span className="gradient-text">first agent?</span>
            </h2>
            <p className="mb-8 text-muted-foreground">
              Enter any website URL and have an AI agent ready in minutes.
            </p>
            <Button size="lg" className="h-12 px-10 text-base shadow-lg shadow-primary/25" asChild>
              <Link href="/signup">
                {nav('signUp')} &mdash; It&apos;s free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
