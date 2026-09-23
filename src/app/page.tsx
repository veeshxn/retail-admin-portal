"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { db, storage } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import {
  Tablet,
  Battery,
  Camera,
  RefreshCw,
  Power,
  Clock,
  Radio,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  X,
  KeyRound,
  Plus,
  Store,
  Trash2,
  Copy,
  Check,
  Film,
  ExternalLink,
  Layers,
  Users,
  Eye,
  Sparkles,
  IndianRupee,
  Wallet,
  TrendingUp,
  Receipt,
  CheckCircle,
  Pencil,
  Lock,
  ShieldCheck,
  MapPin,
  QrCode,
  Gift,
} from "lucide-react";
import type { MapDevice } from "@/components/FleetMap";

const FleetMap = dynamic(() => import("@/components/FleetMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 rounded-xl border border-slate-800 bg-slate-900/50 flex items-center justify-center text-xs text-slate-500">
      Loading satellite map tiles...
    </div>
  ),
});

async function calculateFileSha256(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface DeviceTelemetry {
  storeId: string;
  status: "ONLINE" | "STORE_CLOSED" | "OFFLINE";
  app_version?: string;
  app_version_code?: number;
  battery_percentage?: number;
  store_open_time?: string;
  store_close_time?: string;
  last_seen_timestamp?: number;
  last_screenshot_base64?: string;
  last_screenshot_time?: number;
  latitude?: number;
  longitude?: number;
}

interface StoreRecord {
  storeId: string;
  storeName: string;
  ownerName: string;
  phone: string;
  city: string;
  openTime: string;
  closeTime: string;
  payoutModel: "FIXED" | "PER_SCAN" | "HYBRID" | "PERFORMANCE";
  baseRent: number;
  ratePerScan?: number;
  ratePerFootfall?: number;
  upiId?: string;
  createdAt: number;
}

interface ProvisioningConfig {
  admin_pin: string;
  master_pin: string;
  portal_master_pin?: string;
  portal_partner_pin?: string;
  allow_new_registrations: boolean;
  rssi_threshold: number;
}

interface ActiveAd {
  docId: string;
  id: number;
  title: string;
  videoUrl: string;
  durationSeconds: number;
  actionUrl?: string;
  isActive: boolean;
  pricingModel: "FLAT_CONTRACT" | "PER_PLAY";
  contractAmount: number;
  clientPin?: string;
}

interface MysteryCampaign {
  docId: string;
  id: string;
  title: string;
  brand: string;
  couponCode: string;
  discountText: string;
  actionUrl: string;
  isActive: boolean;
  contractAmount: number;
  clientPin?: string;
}

interface DailyMetrics {
  total_impressions: number;
  total_ble_footfall: number;
  total_mystery_taps: number;
  total_qr_scans: number;
  ad_qr_scans: number;
  mystery_qr_scans: number;
}

interface PayoutRecord {
  storeId: string;
  monthYear: string;
  amount: number;
  status: "PAID" | "PENDING";
  paymentMethod?: string;
  transactionRef?: string;
  paidAt?: number;
}

export default function OperationsPortal() {
  const [adminRole, setAdminRole] = useState<"MASTER" | "VIEWER" | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [activeTab, setActiveTab] = useState<"fleet" | "ads" | "stores" | "finances">("fleet");
  const [showMap, setShowMap] = useState(true);

  const [devices, setDevices] = useState<DeviceTelemetry[]>([]);
  const [analyticsMap, setAnalyticsMap] = useState<Record<string, DailyMetrics>>({});
  const [individualMysteryTaps, setIndividualMysteryTaps] = useState<Record<string, number>>({});
  const [individualMysteryScans, setIndividualMysteryScans] = useState<Record<string, number>>({});
  const [individualAdScans, setIndividualAdScans] = useState<Record<string, number>>({});

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<{
    storeId: string;
    image: string;
  } | null>(null);

  const [otaModalOpen, setOtaModalOpen] = useState(false);
  const [otaVersionCode, setOtaVersionCode] = useState("5");
  const [otaApkFile, setOtaApkFile] = useState<File | null>(null);
  const [otaApkUrl, setOtaApkUrl] = useState("");
  const [otaSha256, setOtaSha256] = useState("");
  const [isHashing, setIsHashing] = useState(false);
  const [otaUploadProgress, setOtaUploadProgress] = useState<number | null>(null);
  const [otaStatus, setOtaStatus] = useState<string | null>(null);

  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [config, setConfig] = useState<ProvisioningConfig>({
    admin_pin: "847426",
    master_pin: "1308",
    portal_master_pin: "8888",
    portal_partner_pin: "1111",
    allow_new_registrations: true,
    rssi_threshold: -75,
  });
  const [configSaved, setConfigSaved] = useState(false);
  const [copiedStoreId, setCopiedStoreId] = useState<string | null>(null);

  const [newStoreModal, setNewStoreModal] = useState(false);
  const [formStoreId, setFormStoreId] = useState("");
  const [formStoreName, setFormStoreName] = useState("");
  const [formOwnerName, setFormOwnerName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCity, setFormCity] = useState("Ludhiana");
  const [formOpenTime, setFormOpenTime] = useState("09:00");
  const [formCloseTime, setFormCloseTime] = useState("21:30");
  const [formPayoutModel, setFormPayoutModel] = useState<"FIXED" | "PER_SCAN" | "HYBRID">("FIXED");
  const [formBaseRent, setFormBaseRent] = useState<number>(2000);
  const [formRatePerScan, setFormRatePerScan] = useState<number>(2.00);
  const [formUpiId, setFormUpiId] = useState("");

  const [editingStore, setEditingStore] = useState<StoreRecord | null>(null);
  const [editStoreName, setEditStoreName] = useState("");
  const [editStoreOwner, setEditStoreOwner] = useState("");
  const [editStorePhone, setEditStorePhone] = useState("");
  const [editStoreCity, setEditStoreCity] = useState("");
  const [editStoreOpen, setEditStoreOpen] = useState("");
  const [editStoreClose, setEditStoreClose] = useState("");
  const [editStoreModel, setEditStoreModel] = useState<"FIXED" | "PER_SCAN" | "HYBRID">("FIXED");
  const [editStoreBaseRent, setEditStoreBaseRent] = useState<number>(2000);
  const [editStoreRateScan, setEditStoreRateScan] = useState<number>(2.00);
  const [editStoreUpi, setEditStoreUpi] = useState("");

  const [ads, setAds] = useState<ActiveAd[]>([]);
  const [newAdModal, setNewAdModal] = useState(false);
  const [adNumericId, setAdNumericId] = useState<number>(1);
  const [adTitle, setAdTitle] = useState("");
  const [adDuration, setAdDuration] = useState<number>(15);
  const [adActionUrl, setAdActionUrl] = useState("");
  const [adVideoUrl, setAdVideoUrl] = useState("");
  const [adPricingModel, setAdPricingModel] = useState<"FLAT_CONTRACT" | "PER_PLAY">("FLAT_CONTRACT");
  const [adContractAmount, setAdContractAmount] = useState<number>(10000);
  const [adClientPin, setAdClientPin] = useState("1234");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [syncingFleet, setSyncingFleet] = useState(false);

  const [editingAd, setEditingAd] = useState<ActiveAd | null>(null);
  const [editAdTitle, setEditAdTitle] = useState("");
  const [editAdDuration, setEditAdDuration] = useState<number>(15);
  const [editAdActionUrl, setEditAdActionUrl] = useState("");
  const [editAdPricingModel, setEditAdPricingModel] = useState<"FLAT_CONTRACT" | "PER_PLAY">("FLAT_CONTRACT");
  const [editAdContractAmount, setEditAdContractAmount] = useState<number>(10000);
  const [editAdClientPin, setEditAdClientPin] = useState("");

  const [mysteryCampaigns, setMysteryCampaigns] = useState<MysteryCampaign[]>([]);
  const [newMysteryModal, setNewMysteryModal] = useState(false);
  const [mysteryId, setMysteryId] = useState("");
  const [mysteryTitle, setMysteryTitle] = useState("");
  const [mysteryBrand, setMysteryBrand] = useState("");
  const [mysteryCoupon, setMysteryCoupon] = useState("");
  const [mysteryDiscount, setMysteryDiscount] = useState("10% OFF");
  const [mysteryUrl, setMysteryUrl] = useState("");
  const [mysteryContract, setMysteryContract] = useState<number>(5000);
  const [mysteryPin, setMysteryPin] = useState("1234");

  const [editingMystery, setEditingMystery] = useState<MysteryCampaign | null>(null);
  const [editMysteryTitle, setEditMysteryTitle] = useState("");
  const [editMysteryBrand, setEditMysteryBrand] = useState("");
  const [editMysteryCoupon, setEditMysteryCoupon] = useState("");
  const [editMysteryDiscount, setEditMysteryDiscount] = useState("");
  const [editMysteryUrl, setEditMysteryUrl] = useState("");
  const [editMysteryContract, setEditMysteryContract] = useState<number>(5000);
  const [editMysteryPin, setEditMysteryPin] = useState("1234");

  const [currentMonth, setCurrentMonth] = useState("2026-09");
  const [payouts, setPayouts] = useState<Record<string, PayoutRecord>>({});
  const [payoutModalStore, setPayoutModalStore] = useState<{
    store: StoreRecord;
    calculatedAmount: number;
  } | null>(null);
  const [overridePayoutAmount, setOverridePayoutAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState("UPI");
  const [payRef, setPayRef] = useState("");

  useEffect(() => {
    const savedRole = sessionStorage.getItem("retailad_role") as "MASTER" | "VIEWER" | null;
    if (savedRole === "MASTER" || savedRole === "VIEWER") {
      setAdminRole(savedRole);
    }
    setIsAuthChecking(false);
  }, []);

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    const entered = pinInput.trim();

    try {
      const configSnap = await getDoc(doc(db, "system_config", "provisioning"));
      const data = configSnap.data();

      const livePortalMaster = data?.portal_master_pin?.toString().trim() || "8888";
      const livePortalPartner = data?.portal_partner_pin?.toString().trim() || "1111";

      if (entered === livePortalMaster) {
        sessionStorage.setItem("retailad_role", "MASTER");
        setAdminRole("MASTER");
        setPinError(false);
      } else if (entered === livePortalPartner) {
        sessionStorage.setItem("retailad_role", "VIEWER");
        setAdminRole("VIEWER");
        setPinError(false);
      } else {
        setPinError(true);
        setPinInput("");
      }
    } catch (err) {
      console.error("Authentication failed:", err);
      setPinError(true);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("retailad_role");
    setAdminRole(null);
    setPinInput("");
  };

  const isMaster = adminRole === "MASTER";

  // Telemetry listener
  useEffect(() => {
    if (!adminRole) return;
    const unsubscribe = onSnapshot(collection(db, "devices"), (snapshot) => {
      const items: DeviceTelemetry[] = [];
      const now = Date.now();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as DeviceTelemetry;
        const lastSeen = data.last_seen_timestamp || 0;
        let liveStatus = data.status || "ONLINE";
        if (now - lastSeen > 20 * 60 * 1000) {
          liveStatus = "OFFLINE";
        }

        items.push({
          ...data,
          storeId: docSnap.id,
          status: liveStatus,
        });
      });
      setDevices(items);
    });
    return () => unsubscribe();
  }, [adminRole]);

  // Daily impressions listener with isolated fallback to prevent double counting
  useEffect(() => {
    if (!adminRole) return;
    const unsubscribe = onSnapshot(collection(db, "daily_impressions"), (snapshot) => {
      const metrics: Record<string, DailyMetrics> = {};
      const campaignTaps: Record<string, number> = {};
      const campaignMysteryScans: Record<string, number> = {};
      const campaignAdScans: Record<string, number> = {};

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        let storeId = data.storeId;
        if (!storeId && docSnap.id.includes("_")) {
          storeId = docSnap.id.substring(docSnap.id.indexOf("_") + 1);
        }
        if (!storeId) return;

        if (!metrics[storeId]) {
          metrics[storeId] = {
            total_impressions: 0,
            total_ble_footfall: 0,
            total_mystery_taps: 0,
            total_qr_scans: 0,
            ad_qr_scans: 0,
            mystery_qr_scans: 0,
          };
        }

        metrics[storeId].total_impressions += Number(data.total_impressions || 0);
        metrics[storeId].total_ble_footfall += Number(data.total_ble_footfall || 0);

        // 1. Mystery Taps: Parse directly from top-level total to eliminate double counting
        let tapCount = 0;
        if (typeof data.total_mystery_taps === "number") {
          tapCount = data.total_mystery_taps;
        } else if (data.mystery_taps && typeof data.mystery_taps === "object") {
          tapCount = Object.values(data.mystery_taps).reduce((sum: number, val: any) => sum + Number(val || 0), 0);
        } else {
          Object.keys(data).forEach((key) => {
            if (key.startsWith("mystery_taps.") && typeof data[key] === "number") {
              tapCount += Number(data[key]);
            }
          });
        }
        metrics[storeId].total_mystery_taps += tapCount;

        // Populate campaign-specific mystery taps
        if (data.mystery_taps && typeof data.mystery_taps === "object") {
          Object.entries(data.mystery_taps).forEach(([cid, val]) => {
            campaignTaps[cid] = (campaignTaps[cid] || 0) + Number(val || 0);
          });
        }
        Object.keys(data).forEach((key) => {
          if (key.startsWith("mystery_taps.") && typeof data[key] === "number") {
            const cid = key.replace("mystery_taps.", "");
            campaignTaps[cid] = (campaignTaps[cid] || 0) + Number(data[key]);
          }
        });

        // 2. Commercial Ad QR Scans
        let adQrCount = 0;
        if (typeof data.total_qr_scans === "number") {
          adQrCount = data.total_qr_scans;
        } else if (data.qr_scans && typeof data.qr_scans === "object") {
          adQrCount = Object.values(data.qr_scans).reduce((sum: number, val: any) => sum + Number(val || 0), 0);
        } else {
          Object.keys(data).forEach((key) => {
            if (key.startsWith("qr_scans.") && typeof data[key] === "number") {
              adQrCount += Number(data[key]);
            }
          });
        }
        metrics[storeId].ad_qr_scans += adQrCount;

        if (data.qr_scans && typeof data.qr_scans === "object") {
          Object.entries(data.qr_scans).forEach(([cid, val]) => {
            campaignAdScans[cid] = (campaignAdScans[cid] || 0) + Number(val || 0);
          });
        }

        // 3. Surprise Box / Coupon QR Scans
        let mysteryQrCount = 0;
        if (typeof data.total_mystery_scans === "number") {
          mysteryQrCount = data.total_mystery_scans;
        } else if (data.mystery_scans && typeof data.mystery_scans === "object") {
          mysteryQrCount = Object.values(data.mystery_scans).reduce((sum: number, val: any) => sum + Number(val || 0), 0);
        } else {
          Object.keys(data).forEach((key) => {
            if (key.startsWith("mystery_scans.") && typeof data[key] === "number") {
              mysteryQrCount += Number(data[key]);
            }
          });
        }
        metrics[storeId].mystery_qr_scans += mysteryQrCount;

        if (data.mystery_scans && typeof data.mystery_scans === "object") {
          Object.entries(data.mystery_scans).forEach(([cid, val]) => {
            const cleanCid = cid.replace(/^mystery_/, "");
            campaignMysteryScans[cleanCid] = (campaignMysteryScans[cleanCid] || 0) + Number(val || 0);
          });
        }
        Object.keys(data).forEach((key) => {
          if (key.startsWith("mystery_scans.") && typeof data[key] === "number") {
            const cleanCid = key.replace("mystery_scans.", "").replace(/^mystery_/, "");
            campaignMysteryScans[cleanCid] = (campaignMysteryScans[cleanCid] || 0) + Number(data[key]);
          }
        });

        metrics[storeId].total_qr_scans += (adQrCount + mysteryQrCount);
      });

      setAnalyticsMap(metrics);
      setIndividualMysteryTaps(campaignTaps);
      setIndividualMysteryScans(campaignMysteryScans);
      setIndividualAdScans(campaignAdScans);
    });
    return () => unsubscribe();
  }, [adminRole]);

  // Stores directory listener
  useEffect(() => {
    if (!adminRole) return;
    const unsubscribe = onSnapshot(collection(db, "stores"), (snapshot) => {
      const items: StoreRecord[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const rawModel = d.payoutModel || "FIXED";
        const normalizedModel = rawModel === "PERFORMANCE" ? "PER_SCAN" : rawModel;

        items.push({
          ...d,
          storeId: docSnap.id,
          storeName: d.storeName || docSnap.id,
          ownerName: d.ownerName || "",
          phone: d.phone || "",
          city: d.city || "Ludhiana",
          openTime: d.openTime || "09:00",
          closeTime: d.closeTime || "21:30",
          payoutModel: normalizedModel,
          baseRent: Number(d.baseRent ?? d.monthlyRent ?? 2000),
          ratePerScan: Number(d.ratePerScan ?? d.ratePerFootfall ?? 2.00),
          upiId: d.upiId || "",
          createdAt: d.createdAt || Date.now(),
        } as StoreRecord);
      });
      setStores(items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    });
    return () => unsubscribe();
  }, [adminRole]);

  // Monthly payouts listener
  useEffect(() => {
    if (!adminRole) return;
    const unsubscribe = onSnapshot(collection(db, "payouts"), (snapshot) => {
      const map: Record<string, PayoutRecord> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as PayoutRecord;
        if (data.monthYear === currentMonth) {
          map[data.storeId] = data;
        }
      });
      setPayouts(map);
    });
    return () => unsubscribe();
  }, [adminRole, currentMonth]);

  // System config listener
  useEffect(() => {
    if (!adminRole) return;
    const unsubscribe = onSnapshot(
      doc(db, "system_config", "provisioning"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setConfig({
            admin_pin: data.admin_pin || "847426",
            master_pin: data.master_pin || "1308",
            portal_master_pin: data.portal_master_pin || "8888",
            portal_partner_pin: data.portal_partner_pin || "1111",
            allow_new_registrations: data.allow_new_registrations ?? true,
            rssi_threshold: data.rssi_threshold ?? -75,
          });
        }
      }
    );
    return () => unsubscribe();
  }, [adminRole]);

  // Active ads listener
  useEffect(() => {
    if (!adminRole) return;
    const unsubscribe = onSnapshot(collection(db, "active_ads"), (snapshot) => {
      const items: ActiveAd[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const numId = typeof d.id === "number" ? d.id : parseInt(d.id, 10) || 0;
        const url = d.videoUrl || d.url || "";
        const active = d.isActive !== undefined ? Boolean(d.isActive) : true;

        items.push({
          docId: docSnap.id,
          id: numId,
          title: d.title || `Ad #${numId}`,
          videoUrl: url,
          durationSeconds: d.durationSeconds || 15,
          actionUrl: d.actionUrl || d.targetUrl || "",
          isActive: active,
          pricingModel: d.pricingModel || "FLAT_CONTRACT",
          contractAmount: Number(d.contractAmount || 10000),
          clientPin: d.clientPin || "1234",
        });
      });

      items.sort((a, b) => a.id - b.id);
      setAds(items);

      if (items.length > 0) {
        const highestId = Math.max(...items.map((a) => a.id));
        setAdNumericId(highestId + 1);
      }
    });
    return () => unsubscribe();
  }, [adminRole]);

  // Mystery campaigns listener
  useEffect(() => {
    if (!adminRole) return;
    const unsubscribe = onSnapshot(collection(db, "mystery_campaigns"), (snapshot) => {
      const items: MysteryCampaign[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        items.push({
          docId: docSnap.id,
          id: d.id || docSnap.id,
          title: d.title || docSnap.id,
          brand: d.brand || "Brand Partner",
          couponCode: d.couponCode || d.promoCode || "DEAL10",
          discountText: d.discountText || d.offer || "Special Reward",
          actionUrl: d.actionUrl || d.targetUrl || "",
          isActive: d.isActive !== undefined ? Boolean(d.isActive) : true,
          contractAmount: Number(d.contractAmount || 5000),
          clientPin: d.clientPin || "1234",
        });
      });
      setMysteryCampaigns(items);
    });
    return () => unsubscribe();
  }, [adminRole]);

  const sendCommand = async (
    storeId: string,
    command: "take_screenshot" | "reboot_device" | "update_content" | "force_sync"
  ) => {
    if (!isMaster && (command === "reboot_device" || command === "update_content")) return;
    try {
      const commandRef = doc(db, "device_commands", storeId);
      if (command === "force_sync") {
        await setDoc(commandRef, { force_sync: true, send_heartbeat: true }, { merge: true });
        setToastMessage(`⚡ Sync & Heartbeat dispatched to ${storeId}`);
      } else {
        await setDoc(commandRef, { [command]: true }, { merge: true });
        setToastMessage(`Signal [${command}] delivered to ${storeId}`);
      }
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error("Command dispatch failed:", err);
    }
  };

  const broadcastAdUpdateToFleet = async () => {
    if (!isMaster) return;
    setSyncingFleet(true);
    try {
      const promises = devices.map((d) =>
        setDoc(doc(db, "device_commands", d.storeId), { update_content: true }, { merge: true })
      );
      await Promise.all(promises);
      setToastMessage("Broadcast: All tablets ordered to refresh playlists");
      setTimeout(() => {
        setSyncingFleet(false);
        setToastMessage(null);
      }, 2500);
    } catch (err) {
      console.error("Fleet broadcast failed:", err);
      setSyncingFleet(false);
    }
  };

  const handleApkFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOtaApkFile(file);
    setIsHashing(true);
    setOtaStatus("Computing cryptographic SHA-256 checksum...");

    try {
      const hash = await calculateFileSha256(file);
      setOtaSha256(hash);
      setOtaStatus(null);
    } catch (err) {
      console.error("Hash calculation failed", err);
      setOtaStatus("Failed to compute SHA-256 hash.");
    } finally {
      setIsHashing(false);
    }
  };

  const handleDeployGlobalOta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMaster) return;
    if (!otaApkFile && !otaApkUrl.trim()) {
      alert("Please select an APK file or provide a direct download link.");
      return;
    }
    if (!otaVersionCode) return;

    try {
      let finalApkUrl = otaApkUrl.trim();

      if (otaApkFile) {
        const storageRef = ref(storage, `ota/build_${otaVersionCode}_${Date.now()}.apk`);
        const uploadTask = uploadBytesResumable(storageRef, otaApkFile);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setOtaUploadProgress(Math.round(progress));
            },
            (error) => reject(error),
            async () => {
              finalApkUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve();
            }
          );
        });
      }

      await setDoc(doc(db, "system_config", "global_ota"), {
        min_version_code: parseInt(otaVersionCode, 10),
        ota_apk_url: finalApkUrl,
        ota_sha256: otaSha256.trim().toLowerCase(),
      });

      setOtaStatus("🚀 Fleet OTA broadcasted! Tablets will verify SHA-256 and install.");
      setTimeout(() => {
        setOtaStatus(null);
        setOtaUploadProgress(null);
        setOtaApkFile(null);
        setOtaModalOpen(false);
      }, 2500);
    } catch (err) {
      console.error("OTA Deployment Failed:", err);
      setOtaStatus("Failed to deploy fleet update.");
      setOtaUploadProgress(null);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMaster) return;
    try {
      await setDoc(
        doc(db, "system_config", "provisioning"),
        {
          admin_pin: config.admin_pin.trim(),
          master_pin: config.master_pin.trim(),
          portal_master_pin: (config.portal_master_pin || "8888").trim(),
          portal_partner_pin: (config.portal_partner_pin || "1111").trim(),
          allow_new_registrations: config.allow_new_registrations,
          rssi_threshold: Number(config.rssi_threshold),
        },
        { merge: true }
      );
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2500);
    } catch (err) {
      console.error("Failed to save provisioning config:", err);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMaster) return;
    const cleanId = formStoreId.trim().replace(/\s+/g, "_");
    if (!cleanId) return;

    try {
      const storeData: StoreRecord = {
        storeId: cleanId,
        storeName: formStoreName.trim() || cleanId,
        ownerName: formOwnerName.trim(),
        phone: formPhone.trim(),
        city: formCity.trim(),
        openTime: formOpenTime.trim() || "09:00",
        closeTime: formCloseTime.trim() || "21:30",
        payoutModel: formPayoutModel,
        baseRent: formPayoutModel === "PER_SCAN" ? 0 : Number(formBaseRent) || 0,
        ratePerScan: formPayoutModel === "FIXED" ? 0 : Number(formRatePerScan) || 0,
        ratePerFootfall: 0,
        upiId: formUpiId.trim() || "",
        createdAt: Date.now(),
      };

      await setDoc(doc(db, "stores", cleanId), storeData);
      setNewStoreModal(false);
      setFormStoreId("");
      setFormStoreName("");
      setFormOwnerName("");
      setFormPhone("");
      setFormUpiId("");
      setToastMessage(`✓ Store ${cleanId} registered successfully`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save store profile:", err);
    }
  };

  const openEditStoreModal = (store: StoreRecord) => {
    if (!isMaster) return;
    setEditingStore(store);
    setEditStoreName(store.storeName);
    setEditStoreOwner(store.ownerName);
    setEditStorePhone(store.phone);
    setEditStoreCity(store.city);
    setEditStoreOpen(store.openTime);
    setEditStoreClose(store.closeTime);
    setEditStoreModel(store.payoutModel === "PERFORMANCE" ? "PER_SCAN" : store.payoutModel);
    setEditStoreBaseRent(store.baseRent);
    setEditStoreRateScan(store.ratePerScan ?? store.ratePerFootfall ?? 2.00);
    setEditStoreUpi(store.upiId ?? "");
  };

  const handleUpdateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMaster || !editingStore) return;

    try {
      const updatedStoreData = {
        storeName: editStoreName.trim(),
        ownerName: editStoreOwner.trim(),
        phone: editStorePhone.trim(),
        city: editStoreCity.trim(),
        openTime: editStoreOpen.trim(),
        closeTime: editStoreClose.trim(),
        payoutModel: editStoreModel,
        baseRent: editStoreModel === "PER_SCAN" ? 0 : Number(editStoreBaseRent),
        ratePerScan: editStoreModel === "FIXED" ? 0 : Number(editStoreRateScan),
        ratePerFootfall: 0,
        upiId: editStoreUpi.trim(),
      };

      await setDoc(doc(db, "stores", editingStore.storeId), updatedStoreData, { merge: true });

      await setDoc(
        doc(db, "devices", editingStore.storeId),
        {
          store_open_time: editStoreOpen.trim(),
          store_close_time: editStoreClose.trim(),
        },
        { merge: true }
      );

      setToastMessage(`✓ Updated terms & hours for ${editingStore.storeId}`);
      setEditingStore(null);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error("Failed to update store:", err);
    }
  };

  const handleCreateAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMaster) return;
    if (!videoFile && !adVideoUrl.trim()) {
      alert("Please upload a video file or provide an MP4 URL.");
      return;
    }

    try {
      let finalUrl = adVideoUrl.trim();

      if (videoFile) {
        const fileExt = videoFile.name.split(".").pop();
        const storageRef = ref(storage, `ads/${Date.now()}_ad_${adNumericId}.${fileExt}`);
        const uploadTask = uploadBytesResumable(storageRef, videoFile);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(Math.round(progress));
            },
            (error) => reject(error),
            async () => {
              finalUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve();
            }
          );
        });
      }

      const docId = `ad_${adNumericId}`;
      await setDoc(doc(db, "active_ads", docId), {
        id: Number(adNumericId),
        title: adTitle.trim() || `Ad #${adNumericId}`,
        videoUrl: finalUrl,
        durationSeconds: Number(adDuration) || 15,
        actionUrl: adActionUrl.trim() || null,
        isActive: true,
        pricingModel: adPricingModel,
        contractAmount: Number(adContractAmount) || 0,
        clientPin: adClientPin.trim() || "1234",
      });

      await broadcastAdUpdateToFleet();

      setNewAdModal(false);
      setVideoFile(null);
      setAdVideoUrl("");
      setAdTitle("");
      setAdActionUrl("");
      setAdClientPin("1234");
      setUploadProgress(null);
    } catch (err) {
      console.error("Failed to create ad:", err);
      alert("Upload failed. Check Firebase Storage rules.");
      setUploadProgress(null);
    }
  };

  const openEditAdModal = (ad: ActiveAd) => {
    if (!isMaster) return;
    setEditingAd(ad);
    setEditAdTitle(ad.title);
    setEditAdDuration(ad.durationSeconds);
    setEditAdActionUrl(ad.actionUrl || "");
    setEditAdPricingModel(ad.pricingModel);
    setEditAdContractAmount(ad.contractAmount);
    setEditAdClientPin(ad.clientPin || "1234");
  };

  const handleUpdateAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMaster || !editingAd) return;

    try {
      await setDoc(
        doc(db, "active_ads", editingAd.docId),
        {
          title: editAdTitle.trim(),
          durationSeconds: Number(editAdDuration),
          actionUrl: editAdActionUrl.trim() || null,
          pricingModel: editAdPricingModel,
          contractAmount: Number(editAdContractAmount),
          clientPin: editAdClientPin.trim() || "1234",
        },
        { merge: true }
      );

      await broadcastAdUpdateToFleet();

      setToastMessage(`✓ Updated campaign: ${editAdTitle}`);
      setEditingAd(null);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error("Failed to update ad:", err);
    }
  };

  const toggleAdActive = async (ad: ActiveAd) => {
    if (!isMaster) return;
    try {
      await setDoc(
        doc(db, "active_ads", ad.docId),
        { isActive: !ad.isActive },
        { merge: true }
      );
      await broadcastAdUpdateToFleet();
    } catch (err) {
      console.error("Failed to toggle ad:", err);
    }
  };

  const handleDeleteAd = async (ad: ActiveAd) => {
    if (!isMaster) return;
    if (confirm(`Remove "${ad.title}" from active broadcast? Tablets will automatically delete it.`)) {
      try {
        await deleteDoc(doc(db, "active_ads", ad.docId));
        await broadcastAdUpdateToFleet();
      } catch (err) {
        console.error("Failed to delete ad:", err);
      }
    }
  };

  const handleCreateMystery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMaster) return;
    const cleanId = mysteryId.trim().toLowerCase().replace(/\s+/g, "_");
    if (!cleanId) return;

    try {
      await setDoc(doc(db, "mystery_campaigns", cleanId), {
        id: cleanId,
        title: mysteryTitle.trim() || cleanId,
        brand: mysteryBrand.trim() || "Brand Partner",
        couponCode: mysteryCoupon.trim().toUpperCase() || "DEAL10",
        discountText: mysteryDiscount.trim() || "Special Reward",
        actionUrl: mysteryUrl.trim() || null,
        isActive: true,
        contractAmount: Number(mysteryContract) || 0,
        clientPin: mysteryPin.trim() || "1234",
        createdAt: Date.now(),
      });

      await broadcastAdUpdateToFleet();

      setNewMysteryModal(false);
      setMysteryId("");
      setMysteryTitle("");
      setMysteryBrand("");
      setMysteryCoupon("");
      setMysteryDiscount("10% OFF");
      setMysteryUrl("");
      setMysteryPin("1234");
      setToastMessage(`✓ Mystery campaign "${cleanId}" launched`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error("Failed to create mystery campaign:", err);
    }
  };

  const openEditMysteryModal = (m: MysteryCampaign) => {
    if (!isMaster) return;
    setEditingMystery(m);
    setEditMysteryTitle(m.title);
    setEditMysteryBrand(m.brand);
    setEditMysteryCoupon(m.couponCode);
    setEditMysteryDiscount(m.discountText);
    setEditMysteryUrl(m.actionUrl || "");
    setEditMysteryContract(m.contractAmount);
    setEditMysteryPin(m.clientPin || "1234");
  };

  const handleUpdateMystery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMaster || !editingMystery) return;

    try {
      await setDoc(
        doc(db, "mystery_campaigns", editingMystery.docId),
        {
          title: editMysteryTitle.trim(),
          brand: editMysteryBrand.trim(),
          couponCode: editMysteryCoupon.trim().toUpperCase(),
          discountText: editMysteryDiscount.trim(),
          actionUrl: editMysteryUrl.trim() || null,
          contractAmount: Number(editMysteryContract),
          clientPin: editMysteryPin.trim() || "1234",
        },
        { merge: true }
      );

      await broadcastAdUpdateToFleet();

      setToastMessage(`✓ Updated mystery campaign: ${editMysteryTitle}`);
      setEditingMystery(null);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error("Failed to update mystery campaign:", err);
    }
  };

  const toggleMysteryActive = async (m: MysteryCampaign) => {
    if (!isMaster) return;
    try {
      await setDoc(doc(db, "mystery_campaigns", m.docId), { isActive: !m.isActive }, { merge: true });
      await broadcastAdUpdateToFleet();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMystery = async (m: MysteryCampaign) => {
    if (!isMaster) return;
    if (confirm(`Remove Mystery Campaign "${m.title}"?`)) {
      try {
        await deleteDoc(doc(db, "mystery_campaigns", m.docId));
        await broadcastAdUpdateToFleet();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleDecommission = async (storeId: string) => {
    if (!isMaster) return;
    if (
      confirm(
        `DANGER: Decommissioning "${storeId}" triggers the hardware kill switch. Device Owner will be stripped and the tablet will reset to setup mode. Proceed?`
      )
    ) {
      try {
        await deleteDoc(doc(db, "devices", storeId));
      } catch (err) {
        console.error("Failed to decommission:", err);
      }
    }
  };

  const calculateStorePayout = (store: StoreRecord): number => {
    const totalScans = analyticsMap[store.storeId]?.total_qr_scans || 0;
    const rate = store.ratePerScan ?? store.ratePerFootfall ?? 2.00;

    if (store.payoutModel === "FIXED") {
      return store.baseRent;
    }
    if (store.payoutModel === "PER_SCAN" || store.payoutModel === "PERFORMANCE") {
      return Math.round(totalScans * rate);
    }
    if (store.payoutModel === "HYBRID") {
      return Math.round(store.baseRent + totalScans * rate);
    }
    return store.baseRent;
  };

  const openDisburseModal = (store: StoreRecord) => {
    if (!isMaster) return;
    const calculated = calculateStorePayout(store);
    setPayoutModalStore({ store, calculatedAmount: calculated });
    setOverridePayoutAmount(calculated);
    setPayRef("");
    setPayMethod("UPI");
  };

  const handleRecordPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMaster || !payoutModalStore) return;

    try {
      const record: PayoutRecord = {
        storeId: payoutModalStore.store.storeId,
        monthYear: currentMonth,
        amount: Number(overridePayoutAmount),
        status: "PAID",
        paymentMethod: payMethod,
        transactionRef: payRef.trim() || `REF-${Date.now()}`,
        paidAt: Date.now(),
      };

      const docId = `${currentMonth}_${payoutModalStore.store.storeId}`;
      await setDoc(doc(db, "payouts", docId), record);

      setToastMessage(`✓ Settlement of ₹${Number(overridePayoutAmount).toLocaleString()} sealed for ${payoutModalStore.store.storeName}`);
      setPayoutModalStore(null);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error("Failed to record payout:", err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStoreId(id);
    setTimeout(() => setCopiedStoreId(null), 2000);
  };

  const totalFleetFootfall = Object.values(analyticsMap).reduce((sum, m) => sum + m.total_ble_footfall, 0);
  const totalFleetImpressions = Object.values(analyticsMap).reduce((sum, m) => sum + m.total_impressions, 0);
  const totalFleetQrScans = Object.values(analyticsMap).reduce((sum, m) => sum + m.total_qr_scans, 0);
  const totalFleetAdQr = Object.values(analyticsMap).reduce((sum, m) => sum + m.ad_qr_scans, 0);
  const totalFleetMysteryQr = Object.values(analyticsMap).reduce((sum, m) => sum + m.mystery_qr_scans, 0);

  const totalDynamicRentalObligations = stores.reduce((sum, s) => sum + calculateStorePayout(s), 0);
  const totalPaidOut = Object.values(payouts).reduce((sum, p) => (p.status === "PAID" ? sum + p.amount : sum), 0);

  const totalMysteryRevenue = mysteryCampaigns.filter((m) => m.isActive).reduce((sum, m) => sum + m.contractAmount, 0);
  const totalAdRevenue = ads.filter((a) => a.isActive).reduce((sum, ad) => {
    if (ad.pricingModel === "FLAT_CONTRACT") return sum + ad.contractAmount;
    if (ad.pricingModel === "PER_PLAY") return sum + Math.round((totalFleetImpressions / 1000) * ad.contractAmount);
    return sum;
  }, 0);

  const totalDynamicRevenue = totalAdRevenue + totalMysteryRevenue;
  const netEstimatedProfit = totalDynamicRevenue - totalDynamicRentalObligations;

  const mapDevices: MapDevice[] = devices.map((d) => ({
    storeId: d.storeId,
    status: d.status,
    latitude: d.latitude,
    longitude: d.longitude,
    battery_percentage: d.battery_percentage,
    store_open_time: d.store_open_time,
    store_close_time: d.store_close_time,
    footfall: analyticsMap[d.storeId]?.total_ble_footfall || 0,
    impressions: analyticsMap[d.storeId]?.total_impressions || 0,
    qrScans: analyticsMap[d.storeId]?.total_qr_scans || 0,
    adQrScans: analyticsMap[d.storeId]?.ad_qr_scans || 0,
    mysteryQrScans: analyticsMap[d.storeId]?.mystery_qr_scans || 0,
  }));

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!adminRole) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-8 shadow-2xl text-center space-y-6">
          <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center mx-auto text-indigo-400">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">RetailAd Commander</h2>
            <p className="text-xs text-slate-400 mt-1">Enter Master or Partner Passcode</p>
          </div>
          <form onSubmit={handleAuthenticate} className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoFocus
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError(false);
              }}
              placeholder="••••"
              className="w-full text-center tracking-widest text-xl font-mono px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
            />
            {pinError && <p className="text-xs text-rose-400 font-semibold">Invalid passkey. Access denied.</p>}
            <button type="submit" className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-lg">
              Authenticate Session
            </button>
          </form>
          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-500 space-y-1">
            <p>Master: Full Command &amp; Settlement Access</p>
            <p>Partner: Real-time Telemetry View</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-indigo-600 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-indigo-400/30 animate-bounce">
          <Radio className="w-4 h-4 animate-spin" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white leading-tight">RetailAd Operations</h1>
                {isMaster && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" /> Master
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">DOOH Fleet &amp; Revenue Commander</p>
            </div>
          </div>

          <nav className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab("fleet")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === "fleet" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Fleet Commander ({devices.length})
            </button>
            <button
              onClick={() => setActiveTab("ads")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === "ads" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              Campaigns ({ads.length + mysteryCampaigns.length})
            </button>
            <button
              onClick={() => setActiveTab("stores")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === "stores" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Store Directory ({stores.length})
            </button>
            <button
              onClick={() => setActiveTab("finances")}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === "finances" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <IndianRupee className="w-3.5 h-3.5" />
              Dynamic Ledger
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === "fleet" && (
            <button
              onClick={() => setShowMap(!showMap)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition border ${
                showMap ? "bg-indigo-600/20 text-indigo-400 border-indigo-500/30" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              {showMap ? "Hide GPS Map" : "Show GPS Map"}
            </button>
          )}

          {isMaster && activeTab === "ads" && (
            <>
              <button
                onClick={broadcastAdUpdateToFleet}
                disabled={syncingFleet}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition border border-slate-700"
              >
                <RefreshCw className={`w-4 h-4 ${syncingFleet ? "animate-spin" : ""}`} />
                {syncingFleet ? "Syncing Fleet..." : "Push Ads to Fleet"}
              </button>
              <button
                onClick={() => setNewMysteryModal(true)}
                className="flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition shadow-lg shadow-fuchsia-600/20"
              >
                <Gift className="w-4 h-4" />
                New Mystery Campaign
              </button>
              <button
                onClick={() => setNewAdModal(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition shadow-lg shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                New Ad Campaign
              </button>
            </>
          )}

          {isMaster && activeTab === "stores" && (
            <button
              onClick={() => setNewStoreModal(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition shadow-lg shadow-emerald-600/20"
            >
              <Plus className="w-4 h-4" />
              Onboard Store
            </button>
          )}

          {isMaster && (
            <button
              onClick={() => setOtaModalOpen(true)}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 rounded-lg transition border border-slate-700"
            >
              <DownloadCloud className="w-4 h-4" />
              Push Fleet OTA
            </button>
          )}

          <button
            onClick={handleLogout}
            title="Lock Portal"
            className="p-2 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 rounded-lg transition"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="p-6 max-w-7xl mx-auto space-y-6">
        {/* TAB 1: FLEET COMMANDER */}
        {activeTab === "fleet" && (
          <>
            {showMap && <FleetMap devices={mapDevices} />}

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Tablets</p>
                  <p className="text-2xl font-bold mt-1 text-white">{devices.length}</p>
                </div>
                <Tablet className="w-8 h-8 text-slate-600" />
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Online &amp; Active</p>
                  <p className="text-2xl font-bold mt-1 text-emerald-400">
                    {devices.filter((d) => d.status === "ONLINE").length}
                  </p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-emerald-500/30" />
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Fleet Footfall</p>
                  <p className="text-2xl font-bold mt-1 text-indigo-400">{totalFleetFootfall.toLocaleString()}</p>
                </div>
                <Users className="w-8 h-8 text-indigo-500/30" />
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Ad Plays Delivered</p>
                  <p className="text-2xl font-bold mt-1 text-amber-400">{totalFleetImpressions.toLocaleString()}</p>
                </div>
                <Eye className="w-8 h-8 text-amber-500/30" />
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total QR Scans</p>
                  <p className="text-2xl font-bold mt-1 text-emerald-400">{totalFleetQrScans.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{totalFleetAdQr} Ad • {totalFleetMysteryQr} Surprise</p>
                </div>
                <QrCode className="w-8 h-8 text-emerald-500/30" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {devices.map((device) => {
                const isOnline = device.status === "ONLINE";
                const isClosed = device.status === "STORE_CLOSED";
                const metrics = analyticsMap[device.storeId] || {
                  total_impressions: 0,
                  total_ble_footfall: 0,
                  total_mystery_taps: 0,
                  total_qr_scans: 0,
                  ad_qr_scans: 0,
                  mystery_qr_scans: 0,
                };

                return (
                  <div
                    key={device.storeId}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 transition rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-bold text-white tracking-tight">{device.storeId}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">v{device.app_version || "1.0"} (build {device.app_version_code || 1})</p>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          isOnline
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : isClosed
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {device.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-800/80">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Battery className="w-4 h-4 text-slate-400" />
                        <span>{device.battery_percentage ?? "--"}% Battery</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-300">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span>{device.store_open_time || "09:00"} - {device.store_close_time || "21:30"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-indigo-400 font-medium">
                        <Users className="w-4 h-4" />
                        <span>{metrics.total_ble_footfall} Footfall (BLE)</span>
                      </div>
                      <div className="flex items-center gap-2 text-amber-400 font-medium">
                        <Eye className="w-4 h-4" />
                        <span>{metrics.total_impressions} Ad Plays</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 rounded-md">
                        <div className="flex items-center gap-1.5">
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Commercial Ad QR Scans</span>
                        </div>
                        <span className="font-mono font-bold">{metrics.ad_qr_scans}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/20 px-2.5 py-1 rounded-md">
                        <div className="flex items-center gap-1.5">
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Surprise Box QR Scans</span>
                        </div>
                        <span className="font-mono font-bold">{metrics.mystery_qr_scans}</span>
                      </div>

                      {metrics.total_mystery_taps > 0 && (
                        <div className="flex items-center justify-between text-[11px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-md">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Interactive Screen Taps</span>
                          </div>
                          <span className="font-mono font-bold">{metrics.total_mystery_taps}</span>
                        </div>
                      )}
                    </div>

                    {device.last_screenshot_base64 && (
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-slate-400">Proof of Play (Live):</p>
                        <div
                          onClick={() => setSelectedScreenshot({ storeId: device.storeId, image: device.last_screenshot_base64! })}
                          className="cursor-pointer group relative rounded-lg overflow-hidden border border-slate-800 bg-black aspect-video flex items-center justify-center"
                        >
                          <img src={device.last_screenshot_base64} alt="Kiosk Screen" className="object-cover w-full h-full group-hover:scale-105 transition duration-300" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-xs font-semibold text-white">Click to Expand</div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-2 pt-1">
                      <button onClick={() => sendCommand(device.storeId, "take_screenshot")} title="Take Screenshot" className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex justify-center"><Camera className="w-4 h-4" /></button>
                      <button onClick={() => sendCommand(device.storeId, "update_content")} disabled={!isMaster} title={isMaster ? "Refresh Ad Campaigns" : "Master Only"} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex justify-center disabled:opacity-30"><RefreshCw className="w-4 h-4" /></button>
                      <button onClick={() => sendCommand(device.storeId, "force_sync")} title="Force Sync" className="p-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 flex justify-center border border-indigo-500/30"><Radio className="w-4 h-4" /></button>
                      <button onClick={() => isMaster && confirm(`Reboot tablet at ${device.storeId}?`) && sendCommand(device.storeId, "reboot_device")} disabled={!isMaster} title={isMaster ? "Reboot Tablet" : "Master Only"} className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex justify-center border border-rose-500/20 disabled:opacity-30"><Power className="w-4 h-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* TAB 2: CAMPAIGNS (VIDEO ADS + MYSTERY CAMPAIGNS) */}
        {activeTab === "ads" && (
          <div className="space-y-8">
            {/* 1. Mystery Campaigns Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-lg text-fuchsia-400">
                    <Gift className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Interactive Surprise Box Campaigns</h2>
                    <p className="text-xs text-slate-400">Tracks individual Mystery Box taps, scans, and coupon conversions.</p>
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  Active Contracts Value: <b className="text-fuchsia-400 font-mono text-sm">₹{totalMysteryRevenue.toLocaleString()}</b>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {mysteryCampaigns.length === 0 ? (
                  <div className="col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
                    No Mystery Campaigns found. Click &quot;New Mystery Campaign&quot; above to launch one.
                  </div>
                ) : (
                  mysteryCampaigns.map((m) => {
                    const taps = individualMysteryTaps[m.id] || individualMysteryTaps[`mystery_${m.id}`] || 0;
                    const scans = individualMysteryScans[m.id] || individualMysteryScans[`mystery_${m.id}`] || 0;

                    return (
                      <div key={m.docId} className="bg-slate-900 border border-slate-800 hover:border-slate-700 transition rounded-xl p-5 flex flex-col justify-between space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] font-mono font-bold bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 px-2 py-0.5 rounded">
                              ID: {m.id}
                            </span>
                            <h3 className="text-base font-bold text-white mt-1.5">{m.title}</h3>
                            <p className="text-xs text-slate-400 font-semibold">{m.brand} • Code: <code className="text-emerald-400">{m.couponCode}</code></p>
                          </div>
                          <button
                            onClick={() => toggleMysteryActive(m)}
                            className={`px-2 py-0.5 text-xs font-semibold rounded ${
                              m.isActive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-500"
                            }`}
                          >
                            {m.isActive ? "● Live" : "○ Paused"}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800/80">
                          <div>
                            <p className="text-[10px] uppercase text-slate-400">Total Box Taps</p>
                            <p className="text-lg font-mono font-bold text-purple-400">{taps.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase text-slate-400">Coupon QR Scans</p>
                            <p className="text-lg font-mono font-bold text-fuchsia-400">{scans.toLocaleString()}</p>
                          </div>
                        </div>

                        {m.actionUrl && (
                          <div className="text-xs text-slate-400 truncate flex items-center gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800">
                            <ExternalLink className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
                            <span className="truncate">{m.actionUrl}</span>
                          </div>
                        )}

                        {/* Advertiser Portal Link & Client PIN Card */}
                        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Advertiser Portal URL:</span>
                            <button
                              onClick={() => copyToClipboard(`${window.location.origin}/mystery/${m.id}`, `mystery_link_${m.id}`)}
                              className="text-fuchsia-400 hover:text-fuchsia-300 font-semibold flex items-center gap-1"
                            >
                              {copiedStoreId === `mystery_link_${m.id}` ? "✓ Copied Link" : "Copy Link"}
                            </button>
                          </div>
                          <p className="text-[11px] font-mono text-slate-300 bg-slate-900 p-1.5 rounded border border-slate-800/80 truncate select-all">
                            {window.location.origin}/mystery/{m.id}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                            <span>Client Passcode: <code className="text-fuchsia-400 font-mono font-bold">{m.clientPin || "1234"}</code></span>
                            <a
                              href={`/mystery/${m.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-fuchsia-400 hover:text-fuchsia-300 font-semibold underline flex items-center gap-0.5"
                            >
                              Open Portal ↗
                            </a>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
                          <span>Fee: ₹{m.contractAmount.toLocaleString()}</span>
                          {isMaster && (
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEditMysteryModal(m)} className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-fuchsia-400 rounded-lg flex items-center gap-1">
                                <Pencil className="w-3.5 h-3.5" /> Edit
                              </button>
                              <button onClick={() => handleDeleteMystery(m)} className="text-rose-400 hover:text-rose-300 p-1">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 2. Video Commercials Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">Commercial Video Campaigns</h2>
                    <p className="text-xs text-slate-400">Creatives broadcasted across tablets with individual ad QR code conversions.</p>
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  Active Contracts Value: <b className="text-emerald-400 font-mono text-sm">₹{totalAdRevenue.toLocaleString()}</b>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {ads.length === 0 ? (
                  <div className="col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-3">
                    <Film className="w-12 h-12 text-slate-600 mx-auto" />
                    <p className="text-sm font-semibold text-slate-300">No Ads In Rotation</p>
                  </div>
                ) : (
                  ads.map((ad) => {
                    const adScans = individualAdScans[`ad_${ad.id}`] || individualAdScans[ad.docId] || 0;

                    return (
                      <div
                        key={ad.docId}
                        className="bg-slate-900 border border-slate-800 hover:border-slate-700 transition rounded-xl p-5 flex flex-col justify-between space-y-4"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded">
                                ID: {ad.id}
                              </span>
                              <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                                {ad.pricingModel === "FLAT_CONTRACT"
                                  ? `₹${ad.contractAmount.toLocaleString()} Flat`
                                  : `₹${ad.contractAmount}/1k Plays`}
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-white mt-1.5">{ad.title}</h3>
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3.5 h-3.5" /> {ad.durationSeconds} seconds
                            </p>
                          </div>

                          <button
                            onClick={() => toggleAdActive(ad)}
                            disabled={!isMaster}
                            className={`px-2 py-0.5 text-xs font-semibold rounded transition ${
                              ad.isActive
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-slate-800 text-slate-500 border border-slate-700"
                            } disabled:cursor-not-allowed`}
                          >
                            {ad.isActive ? "● Broadcasting" : "○ Paused"}
                          </button>
                        </div>

                        <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-800">
                          <video
                            src={ad.videoUrl}
                            controls
                            className="w-full h-full object-cover"
                          />
                        </div>

                        {ad.actionUrl && (
                          <div className="text-xs text-slate-400 truncate flex items-center gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                            <ExternalLink className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="truncate">{ad.actionUrl}</span>
                          </div>
                        )}

                        {/* Advertiser Portal Link & Client PIN Card with Open Portal Button */}
                        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">Advertiser Portal URL:</span>
                            <button
                              onClick={() => copyToClipboard(`${window.location.origin}/campaign/ad_${ad.id}`, `ad_link_${ad.id}`)}
                              className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                            >
                              {copiedStoreId === `ad_link_${ad.id}` ? "✓ Copied Link" : "Copy Link"}
                            </button>
                          </div>
                          <p className="text-[11px] font-mono text-slate-300 bg-slate-900 p-1.5 rounded border border-slate-800/80 truncate select-all">
                            {window.location.origin}/campaign/ad_{ad.id}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                            <span>Client Passcode: <code className="text-emerald-400 font-mono font-bold">{ad.clientPin || "1234"}</code></span>
                            <a
                              href={`/campaign/ad_${ad.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 font-semibold underline flex items-center gap-0.5"
                            >
                              Open Portal ↗
                            </a>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                          <span className="text-slate-400">Direct Ad QR Scans:</span>
                          <span className="font-mono font-bold text-sky-400 text-sm">{adScans}</span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                          {isMaster ? (
                            <>
                              <button
                                onClick={() => openEditAdModal(ad)}
                                className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-lg flex items-center gap-1.5 transition"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit Campaign
                              </button>

                              <button
                                onClick={() => handleDeleteAd(ad)}
                                className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                                title="Delete Commercial"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-mono">
                              Delivered Plays: {totalFleetImpressions}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STORE DIRECTORY */}
        {activeTab === "stores" && (
          <div className="space-y-6">
            {isMaster && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white">Access Control &amp; Fleet Credentials</h2>
                      <p className="text-xs text-slate-400">Hardware kiosk PINs and Web Portal security passcodes.</p>
                    </div>
                  </div>

                  {configSaved && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-lg">
                      <Check className="w-3.5 h-3.5" /> Saved Live
                    </span>
                  )}
                </div>

                <form onSubmit={handleSaveConfig} className="space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">📱 In-Store Tablet Hardware PINs</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Registration PIN</label>
                        <input
                          type="text"
                          value={config.admin_pin}
                          onChange={(e) => setConfig({ ...config, admin_pin: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Tablet Maintenance PIN</label>
                        <input
                          type="text"
                          value={config.master_pin}
                          onChange={(e) => setConfig({ ...config, master_pin: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">BLE Radius ({config.rssi_threshold} dBm)</label>
                        <input
                          type="range"
                          min="-95"
                          max="-45"
                          step="5"
                          value={config.rssi_threshold}
                          onChange={(e) => setConfig({ ...config, rssi_threshold: Number(e.target.value) })}
                          className="w-full accent-indigo-500 mt-2"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80">
                    <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">🌐 Web Portal Passcodes</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Portal Master Passcode</label>
                        <input
                          type="text"
                          value={config.portal_master_pin || ""}
                          onChange={(e) => setConfig({ ...config, portal_master_pin: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Partner Passcode</label>
                        <input
                          type="text"
                          value={config.portal_partner_pin || ""}
                          onChange={(e) => setConfig({ ...config, portal_partner_pin: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                          required
                        />
                      </div>
                      <div className="flex items-end">
                        <button type="submit" className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition shadow">
                          Sync Credentials
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Registered Stores &amp; Dynamic Terms</h3>
                  <p className="text-xs text-slate-400">Store locations, hardware status, and agreed commercial terms.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Store ID</th>
                      <th className="px-6 py-3">Business &amp; Owner</th>
                      <th className="px-6 py-3">Hours</th>
                      <th className="px-6 py-3">Agreed Terms</th>
                      <th className="px-6 py-3">Total QR Scans</th>
                      <th className="px-6 py-3">Est. Rent This Mo</th>
                      <th className="px-6 py-3">Hardware Link</th>
                      {isMaster && <th className="px-6 py-3 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stores.map((store) => {
                      const pairedDevice = devices.find((d) => d.storeId === store.storeId);
                      const isPaired = !!pairedDevice;
                      const isOnline = pairedDevice?.status === "ONLINE";
                      const dynamicRent = calculateStorePayout(store);
                      const storeMetrics = analyticsMap[store.storeId] || {
                        total_qr_scans: 0,
                        ad_qr_scans: 0,
                        mystery_qr_scans: 0,
                      };

                      return (
                        <tr key={store.storeId} className="hover:bg-slate-800/30 transition">
                          <td className="px-6 py-4 font-mono font-bold text-white flex items-center gap-2">
                            {store.storeId}
                            <button onClick={() => copyToClipboard(store.storeId, store.storeId)} title="Copy Store ID" className="text-slate-500 hover:text-slate-300">
                              {copiedStoreId === store.storeId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-semibold text-white">{store.storeName}</p>
                            <p className="text-slate-400 text-[11px]">{store.ownerName} • {store.city}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-slate-500 font-mono text-[10px]">{store.phone}</span>
                              <a
                                href={`/store/${store.storeId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold underline flex items-center gap-0.5"
                              >
                                Open Portal ↗
                              </a>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-400">{store.openTime} - {store.closeTime}</td>
                          <td className="px-6 py-4">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                              {store.payoutModel === "FIXED" && `Flat ₹${store.baseRent.toLocaleString()}`}
                              {(store.payoutModel === "PER_SCAN" || store.payoutModel === "PERFORMANCE") && `₹${store.ratePerScan || 2}/scan`}
                              {store.payoutModel === "HYBRID" && `₹${store.baseRent} base + ₹${store.ratePerScan || 2}/scan`}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono font-bold text-emerald-400">{storeMetrics.total_qr_scans.toLocaleString()}</span>
                            <p className="text-[10px] text-slate-500 font-mono">{storeMetrics.ad_qr_scans} Ad • {storeMetrics.mystery_qr_scans} Surprise</p>
                          </td>
                          <td className="px-6 py-4 font-bold text-emerald-400 font-mono text-sm">₹{dynamicRent.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            {isPaired ? (
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold ${isOnline ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                {isOnline ? "Active" : "Offline"}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Unpaired</span>
                            )}
                          </td>
                          {isMaster && (
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openEditStoreModal(store)} className="p-1.5 text-indigo-400 hover:bg-indigo-500/10 rounded-lg"><Pencil className="w-4 h-4" /></button>
                                {isPaired && <button onClick={() => handleDecommission(store.storeId)} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg"><Trash2 className="w-4 h-4" /></button>}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DYNAMIC FINANCIAL LEDGER */}
        {activeTab === "finances" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Store Payouts (Est.)</p>
                  <p className="text-2xl font-bold mt-1 text-white">₹{totalDynamicRentalObligations.toLocaleString()}</p>
                </div>
                <Receipt className="w-8 h-8 text-slate-600" />
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Disbursed This Month</p>
                  <p className="text-2xl font-bold mt-1 text-emerald-400">₹{totalPaidOut.toLocaleString()}</p>
                </div>
                <Wallet className="w-8 h-8 text-emerald-500/30" />
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Ad Contracts Revenue</p>
                  <p className="text-2xl font-bold mt-1 text-indigo-400">₹{totalDynamicRevenue.toLocaleString()}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-indigo-500/30" />
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Net Fleet Margin</p>
                  <p className="text-2xl font-bold mt-1 text-amber-400">₹{netEstimatedProfit.toLocaleString()}</p>
                </div>
                <IndianRupee className="w-8 h-8 text-amber-500/30" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Shopkeeper Settlement Ledger</h3>
                  <p className="text-xs text-slate-400">Telemetry-adjusted dynamic settlements for billing period {currentMonth}.</p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400 font-medium">Billing Month:</label>
                  <input
                    type="month"
                    value={currentMonth}
                    onChange={(e) => setCurrentMonth(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-xs text-white rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Store Location</th>
                      <th className="px-6 py-3">Payment Info (UPI)</th>
                      <th className="px-6 py-3">Agreement Model</th>
                      <th className="px-6 py-3">Verified QR Scans</th>
                      <th className="px-6 py-3">Calculated Rent</th>
                      <th className="px-6 py-3">Settlement</th>
                      {isMaster && <th className="px-6 py-3 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stores.map((store) => {
                      const payout = payouts[store.storeId];
                      const isPaid = payout?.status === "PAID";
                      const dynamicAmount = calculateStorePayout(store);
                      const storeMetrics = analyticsMap[store.storeId] || { total_qr_scans: 0 };

                      return (
                        <tr key={store.storeId} className="hover:bg-slate-800/30 transition">
                          <td className="px-6 py-4">
                            <p className="font-bold text-white">{store.storeName}</p>
                            <p className="text-slate-400 font-mono text-[11px]">{store.storeId} • {store.ownerName}</p>
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-300">{store.upiId || "None"}</td>
                          <td className="px-6 py-4">{store.payoutModel}</td>
                          <td className="px-6 py-4 font-mono text-emerald-400 font-semibold">{storeMetrics.total_qr_scans} scans</td>
                          <td className="px-6 py-4 font-bold text-emerald-400 text-sm font-mono">₹{dynamicAmount.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            {isPaid ? (
                              <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-[11px]">Paid</span>
                            ) : (
                              <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded text-[11px]">Pending</span>
                            )}
                          </td>
                          {isMaster && (
                            <td className="px-6 py-4 text-right">
                              {!isPaid ? (
                                <button onClick={() => openDisburseModal(store)} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-semibold">
                                  Disburse
                                </button>
                              ) : (
                                <button onClick={() => deleteDoc(doc(db, "payouts", `${currentMonth}_${store.storeId}`))} className="text-slate-500 hover:text-rose-400 text-xs">
                                  Reset
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: EDIT STORE PROFILE & TERMS */}
      {isMaster && editingStore && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Edit Store: {editingStore.storeId}</h3>
              </div>
              <button onClick={() => setEditingStore(null)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleUpdateStore} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Store Name</label>
                  <input type="text" value={editStoreName} onChange={(e) => setEditStoreName(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Owner Name</label>
                  <input type="text" value={editStoreOwner} onChange={(e) => setEditStoreOwner(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Phone</label>
                  <input type="tel" value={editStorePhone} onChange={(e) => setEditStorePhone(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">City</label>
                  <input type="text" value={editStoreCity} onChange={(e) => setEditStoreCity(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Open Time (HH:MM)</label>
                  <input type="text" value={editStoreOpen} onChange={(e) => setEditStoreOpen(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Close Time (HH:MM)</label>
                  <input type="text" value={editStoreClose} onChange={(e) => setEditStoreClose(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
                </div>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <label className="block text-xs font-bold text-indigo-400">Agreed Payout Model</label>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => { setEditStoreModel("FIXED"); setEditStoreRateScan(0); }} className={`py-1.5 px-2 rounded-lg text-xs font-semibold ${editStoreModel === "FIXED" ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400"}`}>Flat Monthly</button>
                  <button type="button" onClick={() => { setEditStoreModel("PER_SCAN"); setEditStoreBaseRent(0); }} className={`py-1.5 px-2 rounded-lg text-xs font-semibold ${editStoreModel === "PER_SCAN" ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400"}`}>Per Scan</button>
                  <button type="button" onClick={() => setEditStoreModel("HYBRID")} className={`py-1.5 px-2 rounded-lg text-xs font-semibold ${editStoreModel === "HYBRID" ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400"}`}>Hybrid</button>
                </div>

                <div className="pt-1">
                  {editStoreModel === "FIXED" && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Fixed Monthly Rent (₹)</label>
                      <input type="number" value={editStoreBaseRent} onChange={(e) => setEditStoreBaseRent(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white font-mono" />
                    </div>
                  )}
                  {editStoreModel === "PER_SCAN" && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Rate / QR Scan (₹)</label>
                      <input type="number" step="0.01" value={editStoreRateScan} onChange={(e) => setEditStoreRateScan(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white font-mono" />
                    </div>
                  )}
                  {editStoreModel === "HYBRID" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Base Rent (₹)</label>
                        <input type="number" value={editStoreBaseRent} onChange={(e) => setEditStoreBaseRent(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">+ Rate / Scan (₹)</label>
                        <input type="number" step="0.01" value={editStoreRateScan} onChange={(e) => setEditStoreRateScan(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white font-mono" />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Shopkeeper UPI ID</label>
                  <input type="text" value={editStoreUpi} onChange={(e) => setEditStoreUpi(e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white font-mono" placeholder="shop@upi" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingStore(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-300">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white">Save Store Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT AD CAMPAIGN (MASTER ONLY) */}
      {isMaster && editingAd && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Edit Campaign: Ad #{editingAd.id}</h3>
              </div>
              <button onClick={() => setEditingAd(null)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleUpdateAd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Campaign Title</label>
                <input type="text" value={editAdTitle} onChange={(e) => setEditAdTitle(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" required />
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Billing Structure</label>
                  <select value={editAdPricingModel} onChange={(e) => setEditAdPricingModel(e.target.value as any)} className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white">
                    <option value="FLAT_CONTRACT">Flat Contract Retainer</option>
                    <option value="PER_PLAY">Performance (Per 1k Plays)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">{editAdPricingModel === "FLAT_CONTRACT" ? "Agreed Fee (₹)" : "Rate / 1k Plays (₹)"}</label>
                  <input type="number" value={editAdContractAmount} onChange={(e) => setEditAdContractAmount(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Advertiser Portal PIN</label>
                <input type="text" value={editAdClientPin} onChange={(e) => setEditAdClientPin(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Duration (Seconds)</label>
                  <input type="number" value={editAdDuration} onChange={(e) => setEditAdDuration(parseInt(e.target.value, 10))} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Action / QR Target URL</label>
                  <input type="url" value={editAdActionUrl} onChange={(e) => setEditAdActionUrl(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" placeholder="https://..." />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingAd(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-300">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white">Save Contract</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT MYSTERY CAMPAIGN */}
      {isMaster && editingMystery && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-fuchsia-400 font-bold">
                <Gift className="w-5 h-5" />
                <h3 className="text-base text-white">Edit Mystery Campaign: {editingMystery.id}</h3>
              </div>
              <button onClick={() => setEditingMystery(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleUpdateMystery} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Campaign Title</label>
                <input type="text" value={editMysteryTitle} onChange={(e) => setEditMysteryTitle(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Brand Name</label>
                  <input type="text" value={editMysteryBrand} onChange={(e) => setEditMysteryBrand(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Coupon Code</label>
                  <input type="text" value={editMysteryCoupon} onChange={(e) => setEditMysteryCoupon(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono uppercase" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Contract Fee (₹)</label>
                  <input type="number" value={editMysteryContract} onChange={(e) => setEditMysteryContract(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Client PIN</label>
                  <input type="text" value={editMysteryPin} onChange={(e) => setEditMysteryPin(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target URL</label>
                <input type="url" value={editMysteryUrl} onChange={(e) => setEditMysteryUrl(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" placeholder="https://..." />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingMystery(null)} className="px-4 py-2 bg-slate-800 text-xs font-semibold text-slate-300 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-xs font-semibold text-white rounded-lg">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DISBURSE SETTLEMENT */}
      {isMaster && payoutModalStore && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Record Rent Settlement</h3>
              </div>
              <button onClick={() => setPayoutModalStore(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleRecordPayout} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Final Settlement Amount (₹)</label>
                <input type="number" value={overridePayoutAmount} onChange={(e) => setOverridePayoutAmount(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-base font-bold text-emerald-400 font-mono" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Transaction Ref / UTR</label>
                <input type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="e.g. UPI-123456" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setPayoutModalStore(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-300">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white">Confirm Settlement</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: ONBOARD STORE */}
      {isMaster && newStoreModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Onboard Store &amp; Configure Terms</h3>
              <button onClick={() => setNewStoreModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateStore} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Store Identifier</label>
                <input type="text" value={formStoreId} onChange={(e) => setFormStoreId(e.target.value)} placeholder="e.g. Ludhiana_Store_02" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Store Name</label>
                  <input type="text" value={formStoreName} onChange={(e) => setFormStoreName(e.target.value)} placeholder="Verma Grocers" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">City</label>
                  <input type="text" value={formCity} onChange={(e) => setFormCity(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setNewStoreModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-300">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white">Save Store Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: NEW AD CAMPAIGN */}
      {isMaster && newAdModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Create Ad Campaign</h3>
              <button onClick={() => setNewAdModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateAd} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Numeric ID</label>
                  <input type="number" value={adNumericId} onChange={(e) => setAdNumericId(parseInt(e.target.value, 10))} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Campaign Title</label>
                  <input type="text" value={adTitle} onChange={(e) => setAdTitle(e.target.value)} placeholder="e.g. Kalyan Jewellers 15s" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Contract Value (₹)</label>
                  <input type="number" value={adContractAmount} onChange={(e) => setAdContractAmount(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Client PIN</label>
                  <input type="text" value={adClientPin} onChange={(e) => setAdClientPin(e.target.value)} placeholder="1234" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Upload MP4 Video File</label>
                <input type="file" accept="video/mp4" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} className="w-full text-xs text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:bg-indigo-600 file:text-white" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Or Direct Video URL (Optional fallback)</label>
                <input type="url" value={adVideoUrl} onChange={(e) => setAdVideoUrl(e.target.value)} placeholder="https://.../video.mp4" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Action / QR Target URL</label>
                <input type="url" value={adActionUrl} onChange={(e) => setAdActionUrl(e.target.value)} placeholder="https://brand.com/deal" className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setNewAdModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-300">Cancel</button>
                <button type="submit" disabled={uploadProgress !== null} className="px-4 py-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white">Publish &amp; Sync</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: SCREENSHOT EXPANSION */}
      {selectedScreenshot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Live Screenshot: {selectedScreenshot.storeId}</h4>
              <button onClick={() => setSelectedScreenshot(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="rounded-lg overflow-hidden bg-black border border-slate-800 aspect-video flex items-center justify-center">
              <img src={selectedScreenshot.image} alt="Screenshot" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: GLOBAL OTA */}
      {isMaster && otaModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Deploy Fleet OTA Update</h3>
              <button onClick={() => setOtaModalOpen(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleDeployGlobalOta} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Version Code</label>
                <input type="number" value={otaVersionCode} onChange={(e) => setOtaVersionCode(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono" required />
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <label className="block text-xs font-semibold text-slate-300">Select Release APK</label>
                <input type="file" accept=".apk" onChange={handleApkFileSelect} className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-indigo-600 file:text-white" />
                {otaSha256 && <p className="text-[10px] font-mono text-emerald-400 break-all">{otaSha256}</p>}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOtaModalOpen(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-slate-300">Cancel</button>
                <button type="submit" disabled={isHashing || otaUploadProgress !== null} className="px-4 py-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white">Broadcast Update</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 9: NEW MYSTERY CAMPAIGN */}
      {isMaster && newMysteryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-fuchsia-400 font-bold">
                <Gift className="w-5 h-5" />
                <h3 className="text-base text-white">Create Mystery Campaign</h3>
              </div>
              <button onClick={() => setNewMysteryModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMystery} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Campaign Identifier</label>
                  <input
                    type="text"
                    value={mysteryId}
                    onChange={(e) => setMysteryId(e.target.value)}
                    placeholder="e.g. dominos_10"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Brand Name</label>
                  <input
                    type="text"
                    value={mysteryBrand}
                    onChange={(e) => setMysteryBrand(e.target.value)}
                    placeholder="e.g. Domino's Pizza"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Campaign Title</label>
                <input
                  type="text"
                  value={mysteryTitle}
                  onChange={(e) => setMysteryTitle(e.target.value)}
                  placeholder="e.g. Domino's Flat 10% Off Deal"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Coupon Code</label>
                  <input
                    type="text"
                    value={mysteryCoupon}
                    onChange={(e) => setMysteryCoupon(e.target.value)}
                    placeholder="e.g. PIZZA10"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Reward Banner Text</label>
                  <input
                    type="text"
                    value={mysteryDiscount}
                    onChange={(e) => setMysteryDiscount(e.target.value)}
                    placeholder="e.g. 10% OFF"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Redeem / Target URL</label>
                <input
                  type="url"
                  value={mysteryUrl}
                  onChange={(e) => setMysteryUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Contract Fee (₹)</label>
                  <input
                    type="number"
                    value={mysteryContract}
                    onChange={(e) => setMysteryContract(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Client PIN</label>
                  <input
                    type="text"
                    value={mysteryPin}
                    onChange={(e) => setMysteryPin(e.target.value)}
                    placeholder="1234"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setNewMysteryModal(false)} className="px-4 py-2 bg-slate-800 text-xs font-semibold text-slate-300 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-xs font-semibold text-white rounded-lg">Launch Campaign</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}