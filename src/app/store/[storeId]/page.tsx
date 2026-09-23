"use client";

import React, { use, useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import {
  Store,
  Battery,
  Clock,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  IndianRupee,
  Users,
  Wallet,
  Receipt,
  HelpCircle,
  KeyRound,
  Lock,
  Phone,
  Calendar,
  QrCode,
  Gift,
  Film,
  Sparkles,
} from "lucide-react";

interface StoreData {
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
  portalPin?: string;
}

interface DeviceTelemetry {
  status: "ONLINE" | "STORE_CLOSED" | "OFFLINE";
  battery_percentage?: number;
  last_seen_timestamp?: number;
  app_version?: string;
}

interface PayoutRecord {
  monthYear: string;
  amount: number;
  status: "PAID" | "PENDING";
  paymentMethod?: string;
  transactionRef?: string;
  paidAt?: number;
}

interface CampaignBreakdownItem {
  id: string;
  name: string;
  type: "COMMERCIAL_AD" | "MYSTERY_BOX";
  brand: string;
  scans: number;
  taps?: number;
  earnings: number;
}

export default function ShopkeeperPortal({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const resolvedParams = use(params);
  const storeId = resolvedParams.storeId;

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinAttempt, setPinAttempt] = useState("");
  const [pinError, setPinError] = useState(false);

  // Store & Telemetry Data
  const [store, setStore] = useState<StoreData | null>(null);
  const [telemetry, setTelemetry] = useState<DeviceTelemetry | null>(null);
  const [monthlyFootfall, setMonthlyFootfall] = useState(0);
  const [monthlyQrScans, setMonthlyQrScans] = useState(0);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [campaignBreakdown, setCampaignBreakdown] = useState<CampaignBreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [wifiHelpOpen, setWifiHelpOpen] = useState(false);

  // Shopkeeper UPI Edit State
  const [newUpiId, setNewUpiId] = useState("");
  const [upiSaving, setUpiSaving] = useState(false);
  const [upiSuccessMessage, setUpiSuccessMessage] = useState<string | null>(null);

  const currentMonth = "2026-09";

  // Check persistent session
  useEffect(() => {
    const savedAuth = sessionStorage.getItem(`store_auth_${storeId}`);
    if (savedAuth === "unlocked") {
      setIsAuthenticated(true);
    }
  }, [storeId]);

  // Load initial store profile
  useEffect(() => {
    async function fetchStore() {
      try {
        const snap = await getDoc(doc(db, "stores", storeId));
        if (snap.exists()) {
          const data = snap.data() as StoreData;
          setStore(data);
          if (data.upiId) {
            setNewUpiId(data.upiId);
          }
        }
      } catch (err) {
        console.error("Failed to load store profile:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStore();
  }, [storeId]);

  // Live telemetry & analytics listener
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubDevice = onSnapshot(doc(db, "devices", storeId), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as DeviceTelemetry;
        const now = Date.now();
        const lastSeen = data.last_seen_timestamp || 0;
        let liveStatus = data.status || "ONLINE";
        if (now - lastSeen > 20 * 60 * 1000) {
          liveStatus = "OFFLINE";
        }
        setTelemetry({ ...data, status: liveStatus });
      }
    });

    const unsubImpressions = onSnapshot(collection(db, "daily_impressions"), async (snap) => {
      let footfallSum = 0;
      let qrScansSum = 0;

      const adScansMap: Record<string, number> = {};
      const mysteryScansMap: Record<string, number> = {};
      const mysteryTapsMap: Record<string, number> = {};

      snap.forEach((docSnap) => {
        const d = docSnap.data();
        let currentStoreId = d.storeId;
        if (!currentStoreId && docSnap.id.includes("_")) {
          currentStoreId = docSnap.id.substring(docSnap.id.indexOf("_") + 1);
        }

        if (currentStoreId === storeId) {
          footfallSum += Number(d.total_ble_footfall || 0);

          // 1. Collect commercial ad scans (map or flat keys)
          if (d.qr_scans && typeof d.qr_scans === "object") {
            Object.entries(d.qr_scans).forEach(([cid, val]) => {
              const count = Number(val || 0);
              adScansMap[cid] = (adScansMap[cid] || 0) + count;
              qrScansSum += count;
            });
          }
          Object.keys(d).forEach((key) => {
            if (key.startsWith("qr_scans.") && typeof d[key] === "number") {
              const cid = key.replace("qr_scans.", "");
              const count = Number(d[key]);
              adScansMap[cid] = (adScansMap[cid] || 0) + count;
              qrScansSum += count;
            }
          });

          // 2. Collect surprise box scans (map or flat keys)
          if (d.mystery_scans && typeof d.mystery_scans === "object") {
            Object.entries(d.mystery_scans).forEach(([cid, val]) => {
              const count = Number(val || 0);
              const cleanCid = cid.replace(/^mystery_/, "");
              mysteryScansMap[cleanCid] = (mysteryScansMap[cleanCid] || 0) + count;
              qrScansSum += count;
            });
          }
          Object.keys(d).forEach((key) => {
            if (key.startsWith("mystery_scans.") && typeof d[key] === "number") {
              const cleanCid = key.replace("mystery_scans.", "").replace(/^mystery_/, "");
              const count = Number(d[key]);
              mysteryScansMap[cleanCid] = (mysteryScansMap[cleanCid] || 0) + count;
              qrScansSum += count;
            });
          });

          // 3. Collect mystery taps (map or flat keys)
          if (d.mystery_taps && typeof d.mystery_taps === "object") {
            Object.entries(d.mystery_taps).forEach(([cid, val]) => {
              const count = Number(val || 0);
              mysteryTapsMap[cid] = (mysteryTapsMap[cid] || 0) + count;
            });
          }
          Object.keys(d).forEach((key) => {
            if (key.startsWith("mystery_taps.") && typeof d[key] === "number") {
              const cid = key.replace("mystery_taps.", "");
              const count = Number(d[key]);
              mysteryTapsMap[cid] = (mysteryTapsMap[cid] || 0) + count;
            });
          });
        }
      });

      setMonthlyFootfall(footfallSum);
      setMonthlyQrScans(qrScansSum);

      // Build itemized list by matching metadata from active_ads and mystery_campaigns
      try {
        const adsSnap = await getDocs(collection(db, "active_ads"));
        const mysterySnap = await getDocs(collection(db, "mystery_campaigns"));

        const items: CampaignBreakdownItem[] = [];
        const scanRate = store?.ratePerScan ?? store?.ratePerFootfall ?? 2.00;

        // Populate commercial ads
        adsSnap.forEach((d) => {
          const data = d.data();
          const adKey = `ad_${data.id}`;
          const scans = adScansMap[adKey] || adScansMap[d.id] || 0;
          items.push({
            id: adKey,
            name: data.title || `Ad #${data.id}`,
            type: "COMMERCIAL_AD",
            brand: "Commercial Sponsor",
            scans: scans,
            earnings: Math.round(scans * scanRate),
          });
        });

        // Populate mystery campaigns
        mysterySnap.forEach((d) => {
          const data = d.data();
          const mKey = data.id || d.id;
          const scans = mysteryScansMap[mKey] || mysteryScansMap[`mystery_${mKey}`] || 0;
          const taps = mysteryTapsMap[mKey] || mysteryTapsMap[`mystery_${mKey}`] || 0;
          items.push({
            id: mKey,
            name: data.title || mKey,
            type: "MYSTERY_BOX",
            brand: data.brand || "Surprise Box Sponsor",
            scans: scans,
            taps: taps,
            earnings: Math.round(scans * scanRate),
          });
        });

        items.sort((a, b) => b.scans - a.scans);
        setCampaignBreakdown(items);
      } catch (err) {
        console.error("Failed to build campaign breakdown:", err);
      }
    });

    const unsubPayouts = onSnapshot(collection(db, "payouts"), (snap) => {
      const records: PayoutRecord[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.storeId === storeId) {
          records.push(d as PayoutRecord);
        }
      });
      records.sort((a, b) => b.monthYear.localeCompare(a.monthYear));
      setPayouts(records);
    });

    return () => {
      unsubDevice();
      unsubImpressions();
      unsubPayouts();
    };
  }, [isAuthenticated, storeId, store]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!store) return;

    const cleanPhone = store.phone ? store.phone.replace(/\D/g, "") : "";
    const expectedPin = store.portalPin || (cleanPhone.length >= 4 ? cleanPhone.slice(-4) : "1234");

    if (pinAttempt.trim() === expectedPin) {
      sessionStorage.setItem(`store_auth_${storeId}`, "unlocked");
      setIsAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPinAttempt("");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(`store_auth_${storeId}`);
    setIsAuthenticated(false);
    setPinAttempt("");
  };

  const handleUpdateUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUpiId.trim()) return;

    setUpiSaving(true);
    try {
      await setDoc(
        doc(db, "stores", storeId),
        { upiId: newUpiId.trim() },
        { merge: true }
      );
      setStore((prev) => (prev ? { ...prev, upiId: newUpiId.trim() } : null));
      setUpiSuccessMessage("✓ UPI ID updated successfully!");
      setTimeout(() => setUpiSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Failed to update UPI ID:", err);
      alert("Failed to update UPI ID. Please try again.");
    } finally {
      setUpiSaving(false);
    }
  };

  const calculateCurrentRent = (): number => {
    if (!store) return 0;
    const rate = store.ratePerScan ?? store.ratePerFootfall ?? 2.00;

    if (store.payoutModel === "FIXED") return store.baseRent;
    if (store.payoutModel === "PER_SCAN" || store.payoutModel === "PERFORMANCE") {
      return Math.round(monthlyQrScans * rate);
    }
    if (store.payoutModel === "HYBRID") {
      return Math.round(store.baseRent + monthlyQrScans * rate);
    }
    return store.baseRent;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-center">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-sm w-full space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-base font-bold text-white">Store Portal Not Found</h2>
          <p className="text-xs text-slate-400">
            No retail profile registered under identifier <code className="text-emerald-400 font-mono">{storeId}</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-8 shadow-2xl text-center space-y-6">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-center mx-auto text-emerald-400">
            <Store className="w-6 h-6" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">{store.storeName}</h2>
            <p className="text-xs text-slate-400 mt-1">Shopkeeper Partner Portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={pinAttempt}
                onChange={(e) => {
                  setPinAttempt(e.target.value);
                  setPinError(false);
                }}
                placeholder="Enter 4-Digit Passcode"
                className="w-full text-center tracking-widest text-xl font-mono px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-slate-500 mt-1.5">
                Default: Last 4 digits of your registered phone number.
              </p>
            </div>

            {pinError && (
              <p className="text-xs text-rose-400 font-semibold">
                Incorrect passcode. Check with your network admin.
              </p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-emerald-600/20"
            >
              Access Store Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  const currentPayoutRecord = payouts.find((p) => p.monthYear === currentMonth);
  const isPaidThisMonth = currentPayoutRecord?.status === "PAID";
  const calculatedRent = calculateCurrentRent();
  const isOnline = telemetry?.status === "ONLINE";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">{store.storeName}</h1>
            <p className="text-xs text-slate-400">{store.city} • Partner Dashboard</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          title="Sign Out"
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition border border-slate-700 text-xs flex items-center gap-1.5"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Exit</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Hardware Status Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`p-3 rounded-xl border ${
                isOnline
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }`}
            >
              {isOnline ? <Wifi className="w-6 h-6 animate-pulse" /> : <WifiOff className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Smart Display Kiosk</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isOnline
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  }`}
                >
                  {telemetry?.status || "CONNECTING..."}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Operating: {store.openTime} – {store.closeTime}</span>
                <span>•</span>
                <span>Battery: {telemetry?.battery_percentage ?? "--"}%</span>
              </p>
            </div>
          </div>

          {!isOnline && (
            <button
              onClick={() => setWifiHelpOpen(!wifiHelpOpen)}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition self-start sm:self-auto"
            >
              <HelpCircle className="w-4 h-4" /> Tablet Offline? Wi-Fi Help
            </button>
          )}
        </div>

        {/* Wi-Fi Troubleshooting Card */}
        {wifiHelpOpen && (
          <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4" /> Wi-Fi Reconnect Steps
            </h3>
            <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
              <li>Ensure your shop Wi-Fi router is turned ON and within range of the tablet.</li>
              <li>Tap the tablet screen quickly <b>5 times</b> to open the maintenance unlock prompt.</li>
              <li>Enter your store maintenance PIN to open Android Settings.</li>
              <li>Go to <b>Network &amp; Internet → Wi-Fi</b>, select your network, and connect.</li>
              <li>Once reconnected, the kiosk app will resume automatically.</li>
            </ol>
          </div>
        )}

        {/* 3 Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Billing Period
            </p>
            <p className="text-xl font-bold mt-1 text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              {currentMonth}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 capitalize">
              Terms: {store.payoutModel === "PER_SCAN" || store.payoutModel === "PERFORMANCE" ? "Per Scan" : store.payoutModel.toLowerCase()}
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Verified QR Scans
            </p>
            <p className="text-xl font-bold mt-1 text-emerald-400 flex items-center gap-2 font-mono">
              <QrCode className="w-5 h-5 text-emerald-400" />
              {monthlyQrScans.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">{monthlyFootfall.toLocaleString()} verified store footfall</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Estimated Rent Payout
            </p>
            <p className="text-2xl font-bold mt-1 text-emerald-400 font-mono">
              ₹{calculatedRent.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {isPaidThisMonth ? "✓ Disbursed" : "Pending monthly cycle"}
            </p>
          </div>
        </div>

        {/* Itemized Campaign Activity & Scan Breakdown Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Campaign Activity &amp; Scan Earnings Breakdown</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">Rate: ₹{store.ratePerScan ?? 2}/scan</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3">Campaign / Sponsor</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Screen Interactions</th>
                  <th className="px-6 py-3">Verified Scans</th>
                  <th className="px-6 py-3 text-right">Rent Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {campaignBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No campaign scan activity recorded on your kiosk yet this month.
                    </td>
                  </tr>
                ) : (
                  campaignBreakdown.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-white">{item.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{item.brand}</p>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.type === "MYSTERY_BOX"
                              ? "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20"
                              : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                          }`}
                        >
                          {item.type === "MYSTERY_BOX" ? <Gift className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                          {item.type === "MYSTERY_BOX" ? "Surprise Box" : "Video Ad"}
                        </span>
                      </td>

                      <td className="px-6 py-4 font-mono text-slate-400">
                        {item.type === "MYSTERY_BOX" ? `${item.taps ?? 0} Box Taps` : "Continuous Loop"}
                      </td>

                      <td className="px-6 py-4 font-mono font-bold text-emerald-400">
                        {item.scans} scans
                      </td>

                      <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">
                        ₹{item.earnings.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Settlement Status & UPI Editor Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Current Month Settlement &amp; Payout Info</h3>
            </div>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                isPaidThisMonth
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}
            >
              {isPaidThisMonth ? "Settled / Paid" : "Pending Disbursement"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Editable UPI Form */}
            <form onSubmit={handleUpdateUpi} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Payment Account (UPI ID)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newUpiId}
                  onChange={(e) => setNewUpiId(e.target.value)}
                  placeholder="e.g. shopowner@oksbi"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
                <button
                  type="submit"
                  disabled={upiSaving}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition shrink-0 disabled:opacity-50"
                >
                  {upiSaving ? "Saving..." : "Update"}
                </button>
              </div>
              {upiSuccessMessage && (
                <p className="text-[11px] font-semibold text-emerald-400">{upiSuccessMessage}</p>
              )}
              <p className="text-[10px] text-slate-500">
                Change your receiving UPI handle anytime. Updates instantly in the admin financial ledger.
              </p>
            </form>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 flex flex-col justify-between">
              <div>
                <p className="text-slate-400 text-xs">Transaction Reference / UTR:</p>
                <p className="text-sm font-bold text-indigo-400 font-mono mt-1">
                  {currentPayoutRecord?.transactionRef || "Will update once disbursed"}
                </p>
              </div>
              <p className="text-[10px] text-slate-500">
                Issued by network administration upon successful bank transfer.
              </p>
            </div>
          </div>
        </div>

        {/* Historical Payout Ledger */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Payment History</h3>
            <span className="text-xs text-slate-400">{payouts.length} past records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3">Month</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Method</th>
                  <th className="px-6 py-3">Reference / UTR</th>
                  <th className="px-6 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {payouts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No previous settlement records found.
                    </td>
                  </tr>
                ) : (
                  payouts.map((record, index) => (
                    <tr key={index} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4 font-mono font-bold text-white">
                        {record.monthYear}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-emerald-400">
                        ₹{record.amount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">{record.paymentMethod || "UPI"}</td>
                      <td className="px-6 py-4 font-mono text-slate-400">
                        {record.transactionRef || "--"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" /> Paid
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}