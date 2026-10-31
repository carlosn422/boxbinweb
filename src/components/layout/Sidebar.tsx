import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { logoutUser } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { copilotText as ct } from "@/lib/copilotI18n";
import { openBinCopilot } from "@/services/boxbinCopilotService";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import LogoIcon from "@/assets/logo.png";
import { LanguageSelector } from "./LanguageSelector";
import { Home, QrCode, MapPin, Users, CreditCard, Sparkles, Download, LogOut, ChevronLeft, ChevronRight, MoreHorizontal, Bot } from "lucide-react";

interface SidebarProps { className?: string; }

export function Sidebar({ className }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const mobileMenuOpener = useRef<HTMLButtonElement | null>(null);
  const openMobileMenu = (button: HTMLButtonElement) => {
    mobileMenuOpener.current = button;
    setIsMobileOpen(true);
  };
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches) setIsMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  useEffect(() => { setIsMobileOpen(false); }, [location.pathname]);

  const sidebarItems = [
    {
      title: ct('aiCopilot'),
      href: "#copilot",
      icon: Bot,
      badge: "AI",
      onClick: () => openBinCopilot("", ""),
    },
    {
      title: t("sidebar.dashboard", { defaultValue: "Dashboard" }),
      href: "/home",
      icon: Home,
      badge: null,
    },
    {
      title: t("sidebar.smartLabels", { defaultValue: "Smart Labels" }),
      href: "/smart-labels",
      icon: QrCode,
      badge: null,
    },
    {
      title: t("sidebar.locations", { defaultValue: "Locations" }),
      href: "/locations",
      icon: MapPin,
      badge: null,
    },
    {
      title: t("sidebar.sharedAccess", { defaultValue: "Shared Access" }),
      href: "/shared",
      icon: Users,
      badge: t("sidebar.new", { defaultValue: "New" }),
    },
    {
      title: t("sidebar.subscription", { defaultValue: "Subscription" }),
      href: "/subscription",
      icon: CreditCard,
      badge: null,
    },
    {
      title: t("sidebar.tokensAI", { defaultValue: "AI Tokens" }),
      href: "/tokensai",
      icon: Sparkles,
      badge: null,
    },
    {
      title: t("sidebar.exportInventory", { defaultValue: "Export Inventory" }),
      href: "/export-inventory",
      icon: Download,
      badge: null,
    },
  ];

  const goTo = (path: string) => { navigate(path); setIsMobileOpen(false); };
  const isActive = (path: string) => path === "/home" ? location.pathname === path : location.pathname.startsWith(path);
  const handleLogout = async () => {
    try {
      await logoutUser();
      localStorage.removeItem("impersonatedUser");
      navigate("/login");
    } catch (error) { console.error("Error al cerrar sesión:", error); }
  };
  const getInitials = () => {
    const name = currentUser?.displayName?.trim();
    if (!name) return (currentUser?.email || "U").slice(0, 2).toUpperCase();
    const parts = name.split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
  };
  const brand = (compact = false) => (
    <button className="boxbin-brand" onClick={() => goTo("/home")} aria-label="BoxBin">
      <img className="boxbin-brand-logo" src={LogoIcon} alt="" />
      {!compact && <span>BoxBin</span>}
    </button>
  );
  const navigation = (compact: boolean) => (
    <div className="boxbin-navigation-scroll">
      <nav className="boxbin-navigation" aria-label={t("sidebar.dashboard")}>
        {sidebarItems.map(item => (
          <button key={item.href} className={cn("boxbin-nav-item", isActive(item.href) && "is-active")} onClick={() => {
            if (item.onClick) { item.onClick(); setIsMobileOpen(false); }
            else goTo(item.href);
          }} aria-current={isActive(item.href) ? "page" : undefined} title={item.title} aria-label={item.title}>
            <item.icon aria-hidden="true" />
            {!compact && <><span>{item.title}</span>{item.badge && <span className="boxbin-nav-badge">{item.badge}</span>}</>}
          </button>
        ))}
      </nav>
      <LanguageSelector collapsed={compact} className="boxbin-language" />
    </div>
  );
  const profile = (compact: boolean) => (
    <>
      {currentUser && <div className={cn("boxbin-profile", compact && "is-compact")} title={currentUser.email || undefined}>
        <span className="boxbin-avatar">{currentUser.photoURL ? <img src={currentUser.photoURL} alt="" /> : getInitials()}</span>
        {!compact && <span className="boxbin-profile-copy"><strong>{currentUser.displayName || t("sidebar.user")}</strong><span>{currentUser.email}</span></span>}
      </div>}
      <button className={cn("boxbin-logout", compact && "is-compact")} onClick={handleLogout} title={t("sidebar.logout")} aria-label={t("sidebar.logout")}>
        <LogOut />{!compact && <span>{t("sidebar.logout")}</span>}
      </button>
    </>
  );

  const mobileItems = sidebarItems.filter(item => ["/home", "/smart-labels", "/locations"].includes(item.href));
  const moreIsActive = sidebarItems.some(item => !mobileItems.includes(item) && isActive(item.href));

  return <>
    <header className="boxbin-mobile-header">
      {brand()}
      <button className="boxbin-mobile-account" onClick={(event) => openMobileMenu(event.currentTarget)} aria-label={t("sidebar.openAccount")} aria-haspopup="dialog" aria-expanded={isMobileOpen}>
        <span className="boxbin-avatar">{currentUser?.photoURL ? <img src={currentUser.photoURL} alt="" /> : getInitials()}</span>
      </button>
    </header>
    <nav className="boxbin-mobile-tabs" aria-label={t("sidebar.navigation")}>
      {mobileItems.map(item => (
        <button key={item.href} className={cn("boxbin-mobile-tab", isActive(item.href) && "is-active")} onClick={() => goTo(item.href)} aria-current={isActive(item.href) ? "page" : undefined}>
          <span className="boxbin-mobile-tab-icon"><item.icon aria-hidden="true" /></span>
          <span>{item.title}</span>
        </button>
      ))}
      <button className={cn("boxbin-mobile-tab", (moreIsActive || isMobileOpen) && "is-active")} onClick={(event) => openMobileMenu(event.currentTarget)} aria-haspopup="dialog" aria-expanded={isMobileOpen}>
        <span className="boxbin-mobile-tab-icon"><MoreHorizontal aria-hidden="true" /></span>
        <span>{t("sidebar.more")}</span>
      </button>
    </nav>
    <Dialog open={isMobileOpen} onOpenChange={setIsMobileOpen}>
      <DialogContent closeLabel={t("sidebar.closeMenu")} className="boxbin-mobile-sheet" aria-describedby="boxbin-mobile-description" onCloseAutoFocus={(event) => {
        event.preventDefault();
        mobileMenuOpener.current?.focus();
      }}>
        <div className="boxbin-sheet-heading">
          <DialogTitle>{t("sidebar.menu")}</DialogTitle>
          <DialogDescription id="boxbin-mobile-description" className="sr-only">{t("sidebar.navigation")}</DialogDescription>
        </div>
        {navigation(false)}
        <div className="boxbin-sidebar-footer">{profile(false)}</div>
      </DialogContent>
    </Dialog>
    <aside className={cn("boxbin-sidebar", collapsed && "is-collapsed", className)}>
      <div className="boxbin-sidebar-brand">
        {brand(collapsed)}
        <button className="boxbin-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </button>
      </div>
      {navigation(collapsed)}
      <div className="boxbin-sidebar-footer">{profile(collapsed)}</div>
    </aside>
  </>;
}
