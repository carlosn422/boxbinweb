import "./dashboard.css";
import { useAuth } from "@/context/AuthContext";
import { Sidebar } from "./Sidebar";
import { BoxBinCopilotDrawer } from "@/components/ai/BoxBinCopilotDrawer";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { currentUser } = useAuth();
  return (
    <div className="boxbin-dashboard">
      {/* Sidebar (Desktop navigation + Mobile top bar & slide-over drawer) */}
      <Sidebar />
      
      {/* Main Content */}
      <div className="boxbin-main">
        {/* Page Content */}
        <main className="boxbin-main-scroll">
          <div className="boxbin-page">
            {children}
          </div>
        </main>
      </div>

      {/* BoxBin AI Copilot Assistant (Floating + Slide-over Drawer) */}
      <BoxBinCopilotDrawer key={currentUser?.id || "anonymous"} />
    </div>
  );
}
