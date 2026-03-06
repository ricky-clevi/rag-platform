import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <div className="dashboard-shell flex flex-1 bg-background">
        <Sidebar />
        <main id="main-content" className="panel-grid flex-1 overflow-auto px-4 pb-28 pt-5 md:px-6 md:pb-8 md:pt-6">
          <div className="mx-auto w-full max-w-[1440px]">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
