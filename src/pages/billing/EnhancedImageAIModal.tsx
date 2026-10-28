import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Upload,
  X,
  Loader2,
  Clock,
  Bot,
  Coins,
  Check,
  Crown,
  Sparkles,
  ArrowLeft,
  Zap,
  Star,
  Image as ImageIcon,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type { TokenEstimate } from "../dashboard/binDetail";
import { useAuth } from "@/context/AuthContext";
import { getStripePlans } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";
import { Elements } from "@stripe/react-stripe-js";
import TokenCheckoutForm from "./TokenCheckoutForm";
import { loadStripe } from "@stripe/stripe-js";
import { STRIPE_PUBLISHABLE_KEY } from "@/config/stripe";
import { API_BASE_URL } from "@/config/api";
import { useTranslation } from "react-i18next";

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
const planIcons = [Coins, Zap, Star, Crown];

interface EnhancedImagesAIModalProps {
  isVideoUploadOpen: boolean;
  setIsVideoUploadOpen: (open: boolean) => void;
  itemId?: string;
  setItems: React.Dispatch<React.SetStateAction<any[]>>;
  userId?: string;
  hideTrigger?: boolean;
}

const EnhancedImagesAIModal: React.FC<EnhancedImagesAIModalProps> = ({
  isVideoUploadOpen,
  setIsVideoUploadOpen,
  itemId,
  setItems,
  userId,
  hideTrigger = false,
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const effectiveUserId = userId || currentUser?.uid;

  const [isUploading, setIsUploading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [detectedItems, setDetectedItems] = useState<any[]>([]);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [isAddingAll, setIsAddingAll] = useState(false);

  // Selected images state
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<{ file: File; url: string; name: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Token estimation states
  const [userTokens, setUserTokens] = useState(0);
  const [estimateData, setEstimateData] = useState<TokenEstimate | null>(null);

  // Token purchase states
  const [showTokenPurchase, setShowTokenPurchase] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState("");
  const [hoveredPackage, setHoveredPackage] = useState("");
  const [tokenPackages, setTokenPackages] = useState<any[]>([]);
  const checkoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedPackage && checkoutRef.current) {
      checkoutRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedPackage]);

  const fetchTokenPackages = useCallback(async () => {
    try {
      const stripePackages = await getStripePlans();
      const filteredPackages = stripePackages.filter((pkg) => {
        const keys = pkg.metadata ? Object.keys(pkg.metadata) : [];
        return keys.includes("tokens") && keys.length === 1;
      });
      const sortedPackages = filteredPackages.sort((a, b) => {
        const tokensA = parseInt(a.metadata?.tokens || "0", 10);
        const tokensB = parseInt(b.metadata?.tokens || "0", 10);
        return tokensA - tokensB;
      });

      setTokenPackages(sortedPackages);
    } catch (error) {
      console.error("Error fetching token packages:", error);
    }
  }, []);

  const checkUserTokens = useCallback(async () => {
    if (currentUser?.uid) {
      const { data: userData } = await supabase
        .from("users")
        .select("tokens")
        .eq("id", currentUser.uid)
        .maybeSingle();

      let tokens = userData?.tokens;
      if (tokens === undefined || tokens === null) {
        const { data: userTokensData } = await supabase
          .from("user_tokens")
          .select("tokens")
          .eq("id", currentUser.uid)
          .maybeSingle();
        tokens = userTokensData?.tokens;
      }
      setUserTokens(tokens || 0);
    }
  }, [currentUser]);

  useEffect(() => {
    checkUserTokens();
  }, [checkUserTokens]);

  useEffect(() => {
    fetchTokenPackages();
  }, [fetchTokenPackages]);

  const handleImageFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const maxTotalSize = 25 * 1024 * 1024; // 25 MB

    const existingTotalSize = selectedImages.reduce((acc, file) => acc + file.size, 0);
    const newFilesArray = Array.from(files);
    const newTotalSize = newFilesArray.reduce((acc, file) => acc + file.size, 0);

    if (existingTotalSize + newTotalSize > maxTotalSize) {
      toast.error(t("aiModals.maxTotalImageSizeError", { defaultValue: "The total size of the images cannot exceed 25 MB." }));
      return;
    }

    setIsUploading(true);
    const updatedSelectedImages = [...selectedImages, ...newFilesArray];
    setSelectedImages(updatedSelectedImages);

    const newPreviews: { file: File; url: string; name: string }[] = [];
    for (let i = 0; i < newFilesArray.length; i++) {
      const file = newFilesArray[i];
      const reader = new FileReader();

      const preview = await new Promise<{ file: File; url: string; name: string }>((resolve) => {
        reader.onload = (e: any) => {
          resolve({
            file,
            url: e.target.result,
            name: file.name,
          });
        };
        reader.readAsDataURL(file);
      });

      newPreviews.push(preview);
    }

    setImagePreviews((prev) => [...prev, ...newPreviews]);
    setIsUploading(false);
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setSelectedImages([]);
    setImagePreviews([]);
    setEstimateData(null);
    setShowResults(false);
    setDetectedItems([]);
    setShowTokenPurchase(false);
    setSelectedPackage("");
  };

  const handleEstimateTokens = async () => {
    if (selectedImages.length === 0) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      selectedImages.forEach((file) => {
        formData.append("files", file);
      });

      let token = "";
      if (currentUser) {
        token = await currentUser.getIdToken();
      }

      const response = await fetch(`${API_BASE_URL}/api/process-images/estimate-tokens`, {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setEstimateData(result);
    } catch (error: any) {
      console.error("Error estimating image tokens:", error);
      toast.error(t("aiModals.processImagesError", { error: error.message, defaultValue: `Error: ${error.message}` }));
    } finally {
      setIsUploading(false);
    }
  };

  const confirmProcess = async () => {
    if (!estimateData?.success) return;

    const formData = new FormData();
    selectedImages.forEach((file) => {
      formData.append("files", file);
    });

    let token = "";
    if (currentUser) {
      token = await currentUser.getIdToken();
    }

    setIsUploading(true);
    setShowResults(false);
    setEstimateData(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/process-images`, {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setDetectedItems(result?.data?.items || []);
        setShowResults(true);
        void checkUserTokens();
      } else {
        throw new Error(result.error || "Failed to process images");
      }
    } catch (error: any) {
      console.error("Error processing images:", error);
      toast.error(t("aiModals.processImagesError", { error: error.message, defaultValue: `Error: ${error.message}` }));
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddDetectedItem = async (item: any) => {
    try {
      setAddingItemId(item.id);
      let finalUrl = item?.image_url;
      try {
        const { data: moveResult, error: moveError } = await supabase.functions.invoke(
          "move-image-to-final-images",
          {
            body: {
              imageUrl: item?.image_url,
              newFolder: "items",
            },
          }
        );
        if (!moveError && moveResult?.newUrl) {
          finalUrl = moveResult.newUrl;
        }
      } catch (e) {
        console.warn("Could not move image, using original url:", e);
      }

      const newItemData = {
        name: item.label,
        description: item.description || "",
        quantity: 1,
        value: item.estimated_value_usd ? Number(item.estimated_value_usd) : 1,
        tags: item.tags || [],
        confidence: item.confidence,
        createdAt: new Date().toISOString(),
        binId: itemId,
        userId: effectiveUserId,
        imageUrl: finalUrl,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("items")
        .insert(newItemData)
        .select()
        .single();

      if (insertError) throw insertError;

      setItems((prev: any) => [...prev, inserted || { id: item.id, ...newItemData }]);
      setDetectedItems((prev: any[]) => prev.filter((d) => d.id !== item.id));

      toast.success(t("aiModals.addedToContainerSuccess", { name: item.label, defaultValue: `Added "${item.label}" to container` }));
    } catch (error) {
      console.error("Error adding detected item:", error);
      toast.error(t("aiModals.failedToAddItem", { defaultValue: "Failed to add item to container" }));
    } finally {
      setAddingItemId(null);
    }
  };

  const handleAddAllItems = async () => {
    try {
      setIsAddingAll(true);
      for (const item of detectedItems) {
        await handleAddDetectedItem(item);
      }
      setIsVideoUploadOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error adding all items:", error);
      toast.error(t("aiModals.failedToProcessItems", { defaultValue: "Failed to process detected items" }));
    } finally {
      setIsAddingAll(false);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleImageFiles(e.dataTransfer.files);
    }
  };

  // Render Token Purchase View
  const renderTokenPurchaseView = () => (
    <div className="space-y-5">
      <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTokenPurchase(false)}
          className="h-8 w-8 p-0 rounded-xl hover:bg-slate-100 text-slate-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h3 className="text-base font-bold text-slate-900">
            {t("aiModals.purchaseTokensTitle", { defaultValue: "Purchase AI Tokens" })}
          </h3>
          <p className="text-xs text-slate-500">
            {t("aiModals.purchaseTokensSubtitle", { defaultValue: "Choose a token package to continue with AI processing" })}
          </p>
        </div>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 text-white shadow-md flex items-center justify-between border border-slate-800">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
            {t("aiModals.currentBalance", { defaultValue: "Current Balance" })}
          </span>
          <p className="text-xs text-slate-300 mt-0.5">
            {t("aiModals.availableForProcessing", { defaultValue: "Available for AI processing" })}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black font-mono text-emerald-400">{userTokens.toLocaleString()}</div>
          <div className="text-[11px] text-slate-400">{t("aiModals.tokensUnit", { defaultValue: "Tokens" })}</div>
        </div>
      </div>

      {/* Packages Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[48vh] overflow-y-auto pr-1">
        {tokenPackages.map((pkg, index) => {
          const IconComponent = planIcons[index % planIcons.length];
          const isSelected = selectedPackage === pkg.id;
          const isHovered = hoveredPackage === pkg.id;
          const isPopular = index === Math.floor(tokenPackages.length / 2);
          const tokenAmount = parseInt(pkg.metadata?.tokens || "0", 10);
          const pricePerToken = pkg.unit_amount > 0 ? pkg.unit_amount / tokenAmount : 0;

          return (
            <div
              key={pkg.id}
              onClick={() => setSelectedPackage(pkg.id)}
              onMouseEnter={() => setHoveredPackage(pkg.id)}
              onMouseLeave={() => setHoveredPackage("")}
              className="cursor-pointer transform transition-all duration-200 relative"
            >
              {isPopular && (
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="bg-orange-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm flex items-center gap-1">
                    <Crown className="w-2.5 h-2.5" />
                    <span>{t("aiModals.bestValue", { defaultValue: "Best Value" })}</span>
                  </div>
                </div>
              )}

              <Card
                className={`relative h-full transition-all duration-200 rounded-2xl ${
                  isSelected
                    ? "border-2 border-indigo-600 shadow-md bg-indigo-50/40"
                    : isHovered
                    ? "border-slate-300 shadow-xs bg-slate-50/50"
                    : "border border-slate-200/80 bg-white"
                }`}
              >
                {isSelected && (
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center shadow z-10">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}

                <CardHeader className="p-3.5 pb-2 text-center">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-1.5 transition-colors ${
                      isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <CardTitle className="text-xs font-bold text-slate-900">
                    {pkg.product.name}
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-3.5 pt-0 space-y-2.5">
                  <div className="text-center">
                    <div className="text-xl font-black text-slate-900 font-mono">
                      {pkg.unit_amount === 0 ? t("aiModals.freeBadge", { defaultValue: "FREE" }) : `$${(pkg.unit_amount / 100).toFixed(2)}`}
                    </div>
                    <div className="inline-block px-2 py-0.5 mt-1 rounded-full text-[10px] font-bold bg-slate-900 text-white">
                      {tokenAmount.toLocaleString()} {t("aiModals.tokensUnit", { defaultValue: "Tokens" })}
                    </div>
                    {pkg.unit_amount > 0 && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        ${(pricePerToken / 100).toFixed(4)} / token
                      </p>
                    )}
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-600 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <Bot className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span className="truncate">{t("aiModals.featureDetection", { defaultValue: "AI item detection" })}</span>
                    </div>
                    {pkg.metadata?.bonus && (
                      <div className="flex items-center gap-1.5 text-orange-600 font-bold">
                        <Sparkles className="w-3 h-3 shrink-0" />
                        <span>+{pkg.metadata.bonus}% Bonus</span>
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    className={`w-full h-7.5 text-xs font-semibold rounded-xl ${
                      isSelected
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                        : "bg-slate-900 hover:bg-slate-800 text-white"
                    }`}
                  >
                    {isSelected ? t("aiModals.selected", { defaultValue: "Selected" }) : t("aiModals.selectPackage", { defaultValue: "Select Package" })}
                  </Button>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Embedded Stripe Checkout Form */}
      {selectedPackage && (
        <div ref={checkoutRef} className="pt-2">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="text-center mb-4">
              <h4 className="text-sm font-bold text-slate-900">
                {t("aiModals.completePurchase", { defaultValue: "Complete Your Purchase" })}
              </h4>
              <p className="text-xs text-slate-500">
                {t("aiModals.instantAccess", { defaultValue: "Get instant access to AI tokens for intelligent recognition" })}
              </p>
            </div>

            <Elements stripe={stripePromise}>
              <TokenCheckoutForm
                userId={currentUser?.uid ?? ""}
                tokens={parseInt(tokenPackages.find((p) => p.id === selectedPackage)?.metadata?.tokens || "0", 10)}
                price={tokenPackages.find((p) => p.id === selectedPackage)?.unit_amount || 0}
              />
            </Elements>
          </div>
        </div>
      )}
    </div>
  );

  // Render Token Estimation View
  const renderEstimateView = () => {
    if (!estimateData) return null;

    return (
      <div className="space-y-4">
        {estimateData.success ? (
          <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-5 flex flex-col md:flex-row items-center gap-4 shadow-2xs">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div className="flex-1 text-center md:text-left">
              <h3 className="text-sm font-bold text-emerald-900">
                {t("aiModals.enoughTokensTitle", { defaultValue: "You have enough tokens" })}
              </h3>
              <p className="text-xs text-emerald-700 mt-0.5">
                {t("aiModals.enoughTokensDesc", { defaultValue: "Your account has sufficient tokens for this analysis." })}
              </p>

              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-emerald-200/60 text-xs">
                <div>
                  <span className="text-[10px] text-emerald-600 block uppercase font-bold tracking-wider">
                    {t("aiModals.tokensRequired", { defaultValue: "Tokens required" })}
                  </span>
                  <span className="font-mono font-bold text-emerald-950 text-sm">
                    {estimateData.MY_TOTAL_TOKENS}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 block uppercase font-bold tracking-wider">
                    {t("aiModals.availableTokens", { defaultValue: "Available tokens" })}
                  </span>
                  <span className="font-mono font-bold text-emerald-950 text-sm">
                    {estimateData.available_tokens}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 block uppercase font-bold tracking-wider">
                    {t("aiModals.tokensLeft", { defaultValue: "Tokens left" })}
                  </span>
                  <span className="font-mono font-bold text-emerald-950 text-sm">
                    {estimateData.tokens_remaining_after}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-5 flex flex-col md:flex-row items-center gap-4 shadow-2xs">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="flex-1 text-center md:text-left">
              <h3 className="text-sm font-bold text-rose-900">
                {(estimateData?.available_tokens ?? 0) > 0
                  ? t("aiModals.notEnoughTokensTitle", { defaultValue: "Not enough tokens" })
                  : t("aiModals.noTokensTitle", { defaultValue: "No tokens available" })}
              </h3>
              <p className="text-xs text-rose-700 mt-0.5">
                {t("aiModals.purchaseToContinue", { defaultValue: "Purchase tokens to continue with AI processing." })}
              </p>

              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-rose-200/60 text-xs">
                <div>
                  <span className="text-[10px] text-rose-600 block uppercase font-bold tracking-wider">
                    {t("aiModals.availableTokens", { defaultValue: "Available" })}
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {estimateData?.available_tokens || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-rose-600 block uppercase font-bold tracking-wider">
                    {t("aiModals.tokensRequired", { defaultValue: "Required" })}
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {estimateData?.required_tokens}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-rose-600 block uppercase font-bold tracking-wider">
                    {t("aiModals.tokensNeeded", { defaultValue: "Needed" })}
                  </span>
                  <span className="font-mono font-bold text-rose-600">
                    {(estimateData?.required_tokens ?? 0) - (estimateData?.available_tokens ?? 0)}
                  </span>
                </div>
              </div>
            </div>

            <Button
              onClick={() => setShowTokenPurchase(true)}
              className="h-9 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs shrink-0 flex items-center gap-1.5"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>{t("aiModals.buyTokens", { defaultValue: "Buy Tokens" })}</span>
            </Button>
          </div>
        )}

        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEstimateData(null)}
            className="rounded-xl text-xs h-8.5 border-slate-200"
          >
            {t("aiModals.cancel", { defaultValue: "Cancel" })}
          </Button>
          {estimateData.success && (
            <Button
              onClick={confirmProcess}
              size="sm"
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs h-8.5 font-bold flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>{t("aiModals.confirmAndProcess", { defaultValue: "Confirm and Process" })}</span>
            </Button>
          )}
        </div>
      </div>
    );
  };

  // Render Detected Items View
  const renderResultsView = () => (
    <div className="space-y-4">
      {isUploading ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-xs font-bold text-slate-800">{t("aiModals.processingImages", { defaultValue: "Processing images..." })}</p>
          <p className="text-[11px] text-slate-400">{t("aiModals.mayTakeUpTo2Min", { defaultValue: "This may take up to 2 minutes" })}</p>
        </div>
      ) : detectedItems.length === 0 ? (
        <div className="text-center py-10 space-y-3">
          <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
            <Bot className="w-6 h-6" />
          </div>
          <p className="text-xs text-slate-500">{t("aiModals.noItemsDetected", { defaultValue: "No items were detected in the media." })}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResults(false)}
            className="rounded-xl text-xs h-8.5 border-slate-200"
          >
            {t("aiModals.uploadNewImages", { defaultValue: "Upload New Images" })}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[55vh] overflow-y-auto pr-1">
            {detectedItems.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:border-slate-300 transition-all overflow-hidden flex flex-col justify-between"
              >
                <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden border-b border-slate-100">
                  <img
                    src={item.image_url}
                    alt={item.label}
                    className="w-full h-full object-cover"
                    onError={(e: any) => {
                      e.target.style.display = "none";
                      e.target.nextElementSibling.style.display = "flex";
                    }}
                  />
                  <div className="hidden w-full h-full bg-slate-100 items-center justify-center text-slate-400 text-xs">
                    {t("aiModals.imageNotAvailable", { defaultValue: "Image not available" })}
                  </div>

                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-0.5 bg-emerald-600/90 backdrop-blur-xs text-white text-[10px] font-bold rounded-full font-mono shadow-2xs">
                      {Math.round(item.confidence * 100)}%
                    </span>
                  </div>
                  {item.timestamp_seconds !== undefined && (
                    <div className="absolute top-2 left-2">
                      <span className="px-2 py-0.5 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-semibold rounded-full flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{item.timestamp_seconds}s</span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2.5">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate" title={item.label}>
                      {item.label}
                    </h4>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                      {item.description || item.label}
                    </p>

                    {item.estimated_value_usd && (
                      <div className="flex items-center justify-between p-2 mt-2 bg-slate-50 rounded-xl text-xs">
                        <span className="text-slate-500">{t("aiModals.estimatedValue", { defaultValue: "Estimated Value:" })}</span>
                        <span className="font-bold font-mono text-emerald-600">${item.estimated_value_usd}</span>
                      </div>
                    )}

                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.tags.slice(0, 3).map((tag: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded-md font-medium"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <Button
                      onClick={() => handleAddDetectedItem(item)}
                      disabled={addingItemId === item.id}
                      size="sm"
                      className="w-full h-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5"
                    >
                      {addingItemId === item.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{t("containers.saving", { defaultValue: "Adding..." })}</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5 text-blue-400" />
                          <span>{t("aiModals.addToContainer", { defaultValue: "Add to Container" })}</span>
                        </>
                      )}
                    </Button>

                    {item.reference_url && (
                      <Button
                        onClick={() => window.open(item.reference_url, "_blank")}
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-[11px] rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                        <span>{t("aiModals.viewSimilarEbay", { defaultValue: "View Similar on eBay" })}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResults(false)}
              className="rounded-xl text-xs h-8.5 border-slate-200"
            >
              {t("aiModals.uploadNewImages", { defaultValue: "Upload New Images" })}
            </Button>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddAllItems}
                disabled={isAddingAll}
                className="rounded-xl text-xs h-8.5 border-slate-200 font-semibold"
              >
                {isAddingAll ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t("aiModals.processing", { defaultValue: "Adding..." })}</span>
                  </span>
                ) : (
                  t("aiModals.addAllItemsCount", { count: detectedItems.length, defaultValue: `Add All Items (${detectedItems.length})` })
                )}
              </Button>
              <Button
                onClick={() => {
                  setIsVideoUploadOpen(false);
                  resetForm();
                }}
                size="sm"
                className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs h-8.5 font-bold"
              >
                {t("aiModals.done", { defaultValue: "Done" })}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // Render Upload View
  const renderUploadView = () => (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
          isDragging
            ? "border-indigo-500 bg-indigo-50/50"
            : "border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50"
        }`}
      >
        {selectedImages.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-48 overflow-y-auto p-1">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white shadow-2xs">
                  <img
                    src={preview.url}
                    alt={preview.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    disabled={isUploading}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-600/90 hover:bg-red-700 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-3">
              <span className="text-xs font-semibold text-slate-600">
                {t(selectedImages.length === 1 ? "aiModals.imageSelected_one" : "aiModals.imageSelected_other", {
                  count: selectedImages.length,
                  defaultValue: `${selectedImages.length} images selected`,
                })}
              </span>

              <label className="cursor-pointer">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs h-8 border-slate-200 bg-white font-medium"
                  disabled={isUploading}
                  asChild
                >
                  <span>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    {t("aiModals.addMoreImages", { defaultValue: "Add more images" })}
                  </span>
                </Button>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  multiple
                  disabled={isUploading}
                  onChange={(e) => handleImageFiles(e.target.files)}
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-2 py-4">
            <div className="w-12 h-12 bg-white rounded-2xl border border-slate-200 flex items-center justify-center mx-auto text-slate-700 shadow-2xs">
              <Upload className="w-5 h-5 text-slate-800" />
            </div>
            <div>
              <label className="cursor-pointer">
                <span className="text-xs font-bold text-slate-900 hover:text-indigo-600 transition-colors">
                  {t("aiModals.dropImagesPrompt", { defaultValue: "Click or drag images to upload" })}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={isUploading}
                  onChange={(e) => handleImageFiles(e.target.files)}
                  className="hidden"
                />
              </label>
              <p className="text-[11px] text-slate-400 mt-1">
                {t("aiModals.dropImagesHint", { defaultValue: "PNG, JPG, WEBP • Max 25 MB total" })}
              </p>
            </div>
          </div>
        )}
      </div>

      {isUploading && (
        <div className="flex items-center justify-center space-x-2 py-3 bg-slate-50 rounded-xl border border-slate-200/80">
          <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
          <span className="text-xs text-slate-600 font-medium">
            {t("aiModals.processingImages", { defaultValue: "Processing images..." })}
          </span>
        </div>
      )}

      <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsVideoUploadOpen(false);
            if (!isUploading) resetForm();
          }}
          disabled={isUploading}
          className="rounded-xl text-xs h-8.5 border-slate-200"
        >
          {t("aiModals.cancel", { defaultValue: "Cancel" })}
        </Button>
        <Button
          onClick={handleEstimateTokens}
          disabled={selectedImages.length === 0 || isUploading}
          size="sm"
          className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs h-8.5 font-bold shadow-xs flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>{isUploading ? t("aiModals.processing", { defaultValue: "Analyzing..." }) : t("aiModals.analyzeImages", { defaultValue: "Analyze Images" })}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog
      open={isVideoUploadOpen}
      onOpenChange={(open) => {
        setIsVideoUploadOpen(open);
        if (!open) resetForm();
      }}
    >
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs">
            <ImageIcon className="h-4 w-4 mr-2 text-orange-400" />
            <span>Images AI</span>
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200/80 shadow-2xl p-5 sm:p-6 bg-white">
        <DialogHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                {showTokenPurchase
                  ? t("aiModals.purchaseTokensTitle", { defaultValue: "Purchase AI Tokens" })
                  : showResults
                  ? t("aiModals.detectedItemsTitle", { count: detectedItems.length, defaultValue: `AI Detected Items (${detectedItems.length})` })
                  : estimateData
                  ? t("aiModals.tokenVerificationTitle", { defaultValue: "Token Verification" })
                  : t("aiModals.imagesModalTitle", { defaultValue: "AI Image Analysis" })}
              </DialogTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {showTokenPurchase
                  ? t("aiModals.purchaseTokensSubtitle", { defaultValue: "Choose a token package to continue with AI processing" })
                  : showResults
                  ? t("aiModals.detectedItemsSubtitle", { defaultValue: "Review detected items and add them to your container" })
                  : estimateData
                  ? t("aiModals.tokenVerificationSubtitle", { defaultValue: "Verify your token balance before AI analysis" })
                  : t("aiModals.imagesModalSubtitle", { defaultValue: "Upload photos to automatically detect and catalog items" })}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="pt-3">
          {showTokenPurchase
            ? renderTokenPurchaseView()
            : showResults
            ? renderResultsView()
            : estimateData
            ? renderEstimateView()
            : renderUploadView()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedImagesAIModal;
