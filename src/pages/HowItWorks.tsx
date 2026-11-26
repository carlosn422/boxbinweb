import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Box,
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  ImageIcon,
  MapPin,
  Package,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  Sparkles,
  Tag,
  Users,
  Video,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { AppDownloadBanner } from "@/components/layout/AppDownloadBanner";
import LogoIcon from "@/assets/logo.png";

/* ---------- Small building blocks that mirror the app's "How it works" cards ---------- */

function StepCard({
  badge,
  title,
  description,
  icon: Icon,
  iconClass,
  children,
}: {
  badge: string;
  title: string;
  description: string;
  icon: typeof Box;
  iconClass: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconClass}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
        <span className="text-[11px] font-bold uppercase text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
          {badge}
        </span>
      </div>
      <h3 className="text-[17px] font-bold text-slate-900 mb-1.5">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
      {children}
    </article>
  );
}

/** A "screenshot" frame in the same warm-paper style as the app's mission previews. */
function PreviewFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="mt-4 rounded-[18px] border-[1.5px] border-slate-200 bg-slate-50 overflow-hidden"
      role="img"
      aria-label={title}
    >
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <span className="text-[13px] font-bold text-slate-900">{title}</span>
        <span className="flex gap-1" aria-hidden="true">
          <i className="w-2 h-2 rounded-full bg-slate-300" />
          <i className="w-2 h-2 rounded-full bg-slate-300" />
          <i className="w-2 h-2 rounded-full bg-brand-400" />
        </span>
      </div>
      <div className="px-3 pb-3">{children}</div>
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  iconClass,
  title,
  desc,
  last,
}: {
  icon: typeof Box;
  iconClass: string;
  title: string;
  desc: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 py-3 ${last ? "" : "border-b border-slate-100"}`}>
      <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5 ${iconClass}`}>
        <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h4 className="text-[15px] font-bold text-slate-900 mb-0.5">{title}</h4>
        <p className="text-[13px] text-slate-600 leading-[18px]">{desc}</p>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function HowItWorksPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(currentUser ? "/home" : "/login");
  };

  const ctaHref = currentUser ? "/home" : "/login";

  const steps = [
    {
      badge: t("webHowItWorks.step1Badge", { defaultValue: "Step 1" }),
      title: t("webHowItWorks.step1Title", { defaultValue: "Create a container" }),
      description: t("webHowItWorks.step1Desc", {
        defaultValue:
          "From the dashboard, tap New and give your box, bin or shelf a clear name. Assign it to a location such as Garage, Attic or Closet.",
      }),
      icon: Package,
      iconClass: "bg-brand-100 text-brand-700",
      preview: (
        <PreviewFrame title={t("webHowItWorks.previewDashboard", { defaultValue: "Dashboard" })}>
          <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Package className="w-3 h-3 text-brand-600" aria-hidden="true" />
                {t("dashboard.totalBins", { defaultValue: "Total Containers" })}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <strong className="text-2xl font-black text-slate-900">3</strong>
                <span className="text-[11px] text-slate-500">{t("dashboard.summaryHint", { defaultValue: "A place for everything." })}</span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 h-8 px-3 rounded-xl bg-brand-400 text-slate-900 text-xs font-bold">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {t("dashboard.new", { defaultValue: "New" })}
            </span>
          </div>
          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Box className="w-4 h-4 text-brand-600" aria-hidden="true" />
              {t("webHowItWorks.exampleBin", { defaultValue: "Garage – Tools" })}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" aria-hidden="true" />
              {t("webHowItWorks.exampleLocation", { defaultValue: "Garage" })}
            </span>
          </div>
        </PreviewFrame>
      ),
    },
    {
      badge: t("webHowItWorks.step2Badge", { defaultValue: "Step 2" }),
      title: t("webHowItWorks.step2Title", { defaultValue: "Print & link a QR label" }),
      description: t("webHowItWorks.step2Desc", {
        defaultValue:
          "Open Smart Labels, print QR tags and stick one on each container. Link the label to the container so a scan opens it instantly.",
      }),
      icon: QrCode,
      iconClass: "bg-sky-100 text-sky-700",
    },
    {
      badge: t("webHowItWorks.step3Badge", { defaultValue: "Step 3" }),
      title: t("webHowItWorks.step3Title", { defaultValue: "Add items with photos & AI" }),
      description: t("webHowItWorks.step3Desc", {
        defaultValue:
          "Inside a container add items by hand, upload photos in bulk, or let AI scan photos or a video to detect items, tags and market prices from Amazon and eBay.",
      }),
      icon: Camera,
      iconClass: "bg-indigo-50 text-indigo-600",
      preview: (
        <PreviewFrame title={t("webHowItWorks.previewAi", { defaultValue: "AI detected items" })}>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex gap-3 p-3">
              <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                <ImageIcon className="w-6 h-6 text-slate-300" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h5 className="text-sm font-bold text-slate-900 truncate">
                    {t("webHowItWorks.exampleItem", { defaultValue: "Cordless drill" })}
                  </h5>
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">94%</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {["tools", "dewalt"].map((tag) => (
                    <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/60">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 px-3 pb-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                <p className="text-[10px] font-bold text-amber-800">Amazon</p>
                <p className="text-xs font-black text-slate-900 font-mono">$89.99 <small className="text-[9px] font-medium text-slate-500">USD</small></p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
                <p className="text-[10px] font-bold text-blue-800">eBay</p>
                <p className="text-xs font-black text-slate-900 font-mono">$64.50 <small className="text-[9px] font-medium text-slate-500">USD</small></p>
              </div>
            </div>
          </div>
        </PreviewFrame>
      ),
    },
    {
      badge: t("webHowItWorks.step4Badge", { defaultValue: "Step 4" }),
      title: t("webHowItWorks.step4Title", { defaultValue: "Find anything in seconds" }),
      description: t("webHowItWorks.step4Desc", {
        defaultValue:
          "Search by name, tag or description from the dashboard, or ask the AI Copilot, \"Where are my Christmas lights?\" and it points to the exact container and location.",
      }),
      icon: Search,
      iconClass: "bg-emerald-100 text-emerald-700",
    },
    {
      badge: t("webHowItWorks.step5Badge", { defaultValue: "Step 5" }),
      title: t("webHowItWorks.step5Title", { defaultValue: "Sell what you don't need" }),
      description: t("webHowItWorks.step5Desc", {
        defaultValue:
          "Turn on \"Add to Sales List\" for any item, set the price, paste the eBay or Amazon link where you listed it and mark it as sold when it goes.",
      }),
      icon: ShoppingBag,
      iconClass: "bg-amber-100 text-amber-700",
      preview: (
        <PreviewFrame title={t("sales.title", { defaultValue: "Sales List" })}>
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                <Tag className="w-3 h-3" aria-hidden="true" />
                {t("sales.statusForSale", { defaultValue: "For Sale" })}
              </span>
              <span className="text-xs font-mono font-bold text-slate-900">$64.50 USD</span>
            </div>
            <p className="text-sm font-bold text-slate-900">
              {t("webHowItWorks.exampleItem", { defaultValue: "Cordless drill" })}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-blue-600 inline-flex items-center gap-1">
                {t("sales.viewOnStore", { store: "eBay", defaultValue: "View on eBay" })}
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </span>
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-600 text-white inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                {t("sales.markSoldBtn", { defaultValue: "Mark as Sold" })}
              </span>
            </div>
          </div>
        </PreviewFrame>
      ),
    },
  ];

  const tools = [
    {
      icon: Sparkles,
      iconClass: "bg-brand-100 text-brand-700",
      title: t("webHowItWorks.toolCopilotTitle", { defaultValue: "AI Copilot" }),
      desc: t("webHowItWorks.toolCopilotDesc", { defaultValue: "Chat to search your inventory, add or edit items, and get answers about values. Say \"Hey Boxbin\" to start a voice call." }),
    },
    {
      icon: ImageIcon,
      iconClass: "bg-orange-50 text-orange-600",
      title: t("webHowItWorks.toolPhotosTitle", { defaultValue: "Scan from photos" }),
      desc: t("webHowItWorks.toolPhotosDesc", { defaultValue: "Upload several photos and AI itemizes them, with Amazon and eBay price references you can use as the item value." }),
    },
    {
      icon: Video,
      iconClass: "bg-violet-100 text-violet-700",
      title: t("webHowItWorks.toolVideoTitle", { defaultValue: "Scan from video" }),
      desc: t("webHowItWorks.toolVideoDesc", { defaultValue: "Record a walkthrough of a box and let AI list every item it sees, with quantities and tags." }),
    },
    {
      icon: Users,
      iconClass: "bg-violet-100 text-violet-700",
      title: t("webHowItWorks.toolShareTitle", { defaultValue: "Share with family or team" }),
      desc: t("webHowItWorks.toolShareDesc", { defaultValue: "Invite people from Shared Access to view or edit your inventory with role-based permissions." }),
    },
    {
      icon: FileText,
      iconClass: "bg-red-100 text-red-700",
      title: t("webHowItWorks.toolExportTitle", { defaultValue: "PDF & insurance inventories" }),
      desc: t("webHowItWorks.toolExportDesc", { defaultValue: "Export an executive-ready PDF register with photos for insurance or moving, in one click." }),
    },
  ];

  const page = (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-brand-100 selection:text-brand-900">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-slate-900 py-1.5"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            {t("webHowItWorks.back", { defaultValue: "Back" })}
          </button>
          {!embedded && (
            <img src={LogoIcon} alt="BoxBin.io" className="h-8 w-auto object-contain hidden sm:block" />
          )}
          <LanguageSelector className="h-9 px-3 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-700" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 pt-6 pb-12">
        {/* Hero */}
        <section className="mb-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-700 bg-brand-100 border border-brand-200 rounded-lg px-2.5 py-1 mb-2.5">
            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
            {t("webHowItWorks.heroBadge", { defaultValue: "Web guide" })}
          </span>
          <h1 className="text-[26px] sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
            {t("webHowItWorks.heroTitle", { defaultValue: "Run your whole inventory from the browser" })}
          </h1>
          <p className="text-[15px] text-slate-600 leading-relaxed">
            {t("webHowItWorks.heroDesc", {
              defaultValue:
                "BoxBin Web turns your physical boxes into a searchable catalog. Here is how to get the most out of the dashboard:",
            })}
          </p>
        </section>

        {/* Steps */}
        <section className="space-y-3.5 mb-7">
          {steps.map((step) => (
            <StepCard
              key={step.badge}
              badge={step.badge}
              title={step.title}
              description={step.description}
              icon={step.icon}
              iconClass={step.iconClass}
            >
              {step.preview}
            </StepCard>
          ))}
        </section>

        {/* Tools */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">
            {t("webHowItWorks.toolsTitle", { defaultValue: "Web superpowers" })}
          </h2>
          {tools.map((tool, i) => (
            <FeatureRow key={tool.title} {...tool} last={i === tools.length - 1} />
          ))}
        </section>

        {/* Mobile app invitation */}
        <AppDownloadBanner variant="hero" className="mb-6" />

        {/* CTA */}
        <Button
          asChild
          className="w-full h-12 rounded-2xl bg-brand-400 hover:bg-brand-300 border border-brand-200 text-slate-900 text-base font-bold shadow-sm"
        >
          <Link to={ctaHref}>
            {currentUser
              ? t("webHowItWorks.ctaDashboard", { defaultValue: "Go to my dashboard" })
              : t("webHowItWorks.ctaSignIn", { defaultValue: "Sign in to get started" })}
            <ArrowRight className="w-[18px] h-[18px]" aria-hidden="true" />
          </Link>
        </Button>
      </main>
    </div>
  );

  return page;
}
