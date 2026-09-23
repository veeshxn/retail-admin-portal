"use client";

import React, { use, useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import {
  Gift,
  Sparkles,
  QrCode,
  Users,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Lock,
  MapPin,
  Building2,
  Ticket,
} from "lucide-react";

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

interface StoreMetadata {
  storeId: string;
  storeName: string;
  city: string;
}

interface StorePerformance {
  storeId: string;
  storeName: string;
  city: string;
  boxTaps: number;
  qrScans: number;
}

export default function MysteryAdvertiserPortal({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const resolvedParams = use(params);
  const campaignId = resolvedParams.campaignId;

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinAttempt, setPinAttempt] = useState("");
  const [pinError, setPinError] = useState(false);

  // Campaign & Analytics Data
  const [campaign, setCampaign] = useState<MysteryCampaign | null>(null);
  const [totalDisplaysCount, setTotalDisplaysCount] = useState(0);
  const [totalBoxTaps, setTotalBoxTaps] = useState(0);
  const [totalQrScans, setTotalQrScans] = useState(0);
  const [storePerformances, setStorePerformances] = useState<StorePerformance[]>([]);
  const [storesMap, setStoresMap] = useState<Record<string, StoreMetadata>>({});
  const [loading, setLoading] = useState(true);

  // Check session
  useEffect(() => {
    const savedAuth = sessionStorage.getItem(`mystery_auth_${campaignId}`);
    if (savedAuth === "unlocked") {
      setIsAuthenticated(true);
    }
  }, [campaignId]);

  // Load stores directory
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "stores"), (snap) => {
      const map: Record<string, StoreMetadata> = {};
      snap.forEach((d) => {
        const data = d.data();
        map[d.id] = {
          storeId: d.id,
          storeName: data.storeName || d.id,
          city: data.city || "Ludhiana",
        };
      });
      setStoresMap(map);
    });
    return () => unsub();
  }, []);

  // Fetch campaign metadata
  useEffect(() => {
    async function fetchCampaign() {
      try {
        let snap = await getDoc(doc(db, "mystery_campaigns", campaignId));
        if (snap.exists()) {
          setCampaign({ docId: snap.id, ...snap.data() } as MysteryCampaign);
        } else {
          const q = query(collection(db, "mystery_campaigns"), where("id", "==", campaignId));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            const docMatch = querySnap.docs[0];
            setCampaign({ docId: docMatch.id, ...docMatch.data() } as MysteryCampaign);
          }
        }
      } catch (err) {
        console.error("Failed to load mystery campaign:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCampaign();
  }, [campaignId]);

  // Listen to daily impressions for taps and scans
  useEffect(() => {
    if (!isAuthenticated || !campaign) return;

    const unsubMetrics = onSnapshot(collection(db, "daily_impressions"), (snap) => {
      let tapsSum = 0;
      let scansSum = 0;

      const storeStats: Record<string, { taps: number; scans: number }> = {};

      snap.forEach((docSnap) => {
        const d = docSnap.data();
        let currentStoreId = d.storeId;
        if (!currentStoreId && docSnap.id.includes("_")) {
          currentStoreId = docSnap.id.substring(docSnap.id.indexOf("_") + 1);
        }
        if (!currentStoreId) return;

        if (!storeStats[currentStoreId]) {
          storeStats[currentStoreId] = { taps: 0, scans: 0 };
        }

        // Taps for this campaign
        let docTaps = 0;
        if (d.mystery_taps && typeof d.mystery_taps === "object") {
          docTaps += Number(d.mystery_taps[campaign.id] || d.mystery_taps[`mystery_${campaign.id}`] || 0);
        }
        if (d[`mystery_taps.${campaign.id}`]) {
          docTaps += Number(d[`mystery_taps.${campaign.id}`]);
        }

        // Scans for this campaign
        let docScans = 0;
        if (d.mystery_scans && typeof d.mystery_scans === "object") {
          docScans += Number(d.mystery_scans[campaign.id] || d.mystery_scans[`mystery_${campaign.id}`] || 0);
        }
        if (d[`mystery_scans.${campaign.id}`]) {
          docScans += Number(d[`mystery_scans.${campaign.id}`]);
        }

        tapsSum += docTaps;
        scansSum += docScans;

        storeStats[currentStoreId].taps += docTaps;
        storeStats[currentStoreId].scans += docScans;
      });

      setTotalBoxTaps(tapsSum);
      setTotalQrScans(scansSum);

      const perfList: StorePerformance[] = Object.entries(storeStats).map(([sId, stats]) => ({
        storeId: sId,
        storeName: storesMap[sId]?.storeName || sId,
        city: storesMap[sId]?.city || "Ludhiana",
        boxTaps: stats.taps,
        qrScans: stats.scans,
      }));

      perfList.sort((a, b) => b.boxTaps - a.boxTaps || b.qrScans - a.qrScans);
      setStorePerformances(perfList);
    });

    const unsubDevices = onSnapshot(collection(db, "devices"), (snap) => {
      setTotalDisplaysCount(snap.size);
    });

    return () => {
      unsubMetrics();
      unsubDevices();
    };
  }, [isAuthenticated, campaign, storesMap]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign) return;

    const expectedPin = campaign.clientPin ? campaign.clientPin.trim() : "1234";

    if (pinAttempt.trim() === expectedPin) {
      sessionStorage.setItem(`mystery_auth_${campaignId}`, "unlocked");
      setIsAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPinAttempt("");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(`mystery_auth_${campaignId}`);
    setIsAuthenticated(false);
    setPinAttempt("");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans">
        <div className="w-6 h-6 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-center">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-sm w-full space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-base font-bold text-white">Mystery Campaign Not Found</h2>
          <p className="text-xs text-slate-400">
            No campaign found under identifier <code className="text-fuchsia-400 font-mono">{campaignId}</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-8 shadow-2xl text-center space-y-6">
          <div className="w-12 h-12 bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-xl flex items-center justify-center mx-auto text-fuchsia-400">
            <Gift className="w-6 h-6" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">{campaign.title}</h2>
            <p className="text-xs text-slate-400 mt-1">Mystery Box Brand Partner Portal</p>
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
                placeholder="Enter Client PIN"
                className="w-full text-center tracking-widest text-xl font-mono px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-fuchsia-500"
              />
              <p className="text-[11px] text-slate-500 mt-1.5">
                Passcode provided by your network account executive.
              </p>
            </div>

            {pinError && (
              <p className="text-xs text-rose-400 font-semibold">
                Invalid client passcode. Access denied.
              </p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-fuchsia-600/20"
            >
              Access Reward Metrics
            </button>
          </form>
        </div>
      </div>
    );
  }

  const conversionRate = totalBoxTaps > 0 ? ((totalQrScans / totalBoxTaps) * 100).toFixed(2) : "0.00";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-lg text-fuchsia-400">
            <Gift className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white leading-tight">{campaign.title}</h1>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  campaign.isActive
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-slate-800 text-slate-500 border border-slate-700"
                }`}
              >
                {campaign.isActive ? "● Live Campaign" : "○ Paused"}
              </span>
            </div>
            <p className="text-xs text-slate-400">{campaign.brand} • Coupon: <code className="text-emerald-400 font-mono font-bold">{campaign.couponCode}</code></p>
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

      <main className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Box Taps</p>
            <p className="text-2xl font-bold mt-1 text-purple-400 flex items-center gap-2 font-mono">
              <Sparkles className="w-5 h-5" />
              {totalBoxTaps.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Interactive screen reveals</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Coupon QR Scans</p>
            <p className="text-2xl font-bold mt-1 text-fuchsia-400 flex items-center gap-2 font-mono">
              <QrCode className="w-5 h-5" />
              {totalQrScans.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Verified mobile redemptions</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Conversion Rate</p>
            <p className="text-2xl font-bold mt-1 text-emerald-400 flex items-center gap-2 font-mono">
              <Ticket className="w-5 h-5" />
              {conversionRate}%
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Tap-to-scan ratio</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Deployed Kiosks</p>
            <p className="text-2xl font-bold mt-1 text-white flex items-center gap-2 font-mono">
              <Building2 className="w-5 h-5 text-slate-400" />
              {totalDisplaysCount} Screens
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Active retail network</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Gift className="w-4 h-4 text-fuchsia-400" /> Reward Details
              </h3>
              <span className="text-xs font-bold text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/20 px-2.5 py-0.5 rounded-full">
                {campaign.discountText}
              </span>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Coupon Code:</span>
                  <span className="text-emerald-400 font-bold">{campaign.couponCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Campaign ID:</span>
                  <span className="text-white">{campaign.id}</span>
                </div>
              </div>

              {campaign.actionUrl && (
                <div className="text-xs text-slate-400 truncate flex items-center gap-1.5 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <ExternalLink className="w-4 h-4 text-fuchsia-400 shrink-0" />
                  <span className="truncate">Redeem URL: {campaign.actionUrl}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Network SLA Certification
              </h3>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                100% Verified
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Mystery box interaction metrics and QR redemptions are recorded directly from in-store Android kiosks and verified via cryptographic HMAC signatures.
            </p>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Tracking Schema:</span>
                <span className="text-white">mystery_campaigns</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Live Status:</span>
                <span className="text-emerald-400 flex items-center gap-1 font-sans">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Telemetry Synced
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Store-by-Store Conversion Breakdown</h3>
            </div>
            <span className="text-xs text-slate-400">{storePerformances.length} Active Locations</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3">Store Location</th>
                  <th className="px-6 py-3">City / Area</th>
                  <th className="px-6 py-3">Box Taps</th>
                  <th className="px-6 py-3">Coupon QR Scans</th>
                  <th className="px-6 py-3 text-right">Conversion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {storePerformances.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No interaction logs recorded yet for this mystery campaign.
                    </td>
                  </tr>
                ) : (
                  storePerformances.map((sp) => {
                    const storeConv = sp.boxTaps > 0 ? ((sp.qrScans / sp.boxTaps) * 100).toFixed(2) : "0.00";
                    return (
                      <tr key={sp.storeId} className="hover:bg-slate-800/30 transition">
                        <td className="px-6 py-4 font-semibold text-white">
                          <p>{sp.storeName}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{sp.storeId}</p>
                        </td>

                        <td className="px-6 py-4 font-medium text-slate-300 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
                          <span>{sp.city}</span>
                        </td>

                        <td className="px-6 py-4 font-mono font-bold text-purple-400">
                          {sp.boxTaps.toLocaleString()} taps
                        </td>

                        <td className="px-6 py-4 font-mono font-bold text-fuchsia-400">
                          {sp.qrScans} scans
                        </td>

                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-300">
                          {storeConv}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
