import { useAuth } from "@/context/AuthContext";
import { Sidebar } from "./Sidebar";
import { BoxBinCopilotDrawer } from "@/components/ai/BoxBinCopilotDrawer";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { currentUser } = useAuth();
  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden safe-top safe-bottom bg-slate-50/50 font-sans">
      {/* Sidebar (Desktop navigation + Mobile top bar & slide-over drawer) */}
      <Sidebar />
      
      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-slate-50/50">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>

      {/* BoxBin AI Copilot Assistant (Floating + Slide-over Drawer) */}
      <BoxBinCopilotDrawer key={currentUser?.id || "anonymous"} />
    </div>
  );
}
