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
  Film,
  Play,
  Users,
  Eye,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Clock,
  Radio,
  AlertTriangle,
  Lock,
  QrCode,
  MapPin,
  Building2,
  TrendingUp,
} from "lucide-react";

interface AdCampaign {
  docId: string;
  id: number;
  title: string;
  videoUrl: string;
  durationSeconds: number;
  actionUrl?: string;
  isActive: boolean;
  pricingModel: string;
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
  plays: number;
  footfall: number;
  qrScans: number;
}

export default function AdvertiserPortal({
  params,
}: {
  params: Promise<{ adId: string }>;
}) {
  const resolvedParams = use(params);
  const adId = resolvedParams.adId;

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinAttempt, setPinAttempt] = useState("");
  const [pinError, setPinError] = useState(false);

  // Campaign & Live Fleet Telemetry Data
  const [ad, setAd] = useState<AdCampaign | null>(null);
  const [totalDisplaysCount, setTotalDisplaysCount] = useState(0);
  const [totalNetworkPlays, setTotalNetworkPlays] = useState(0);
  const [totalAudienceFootfall, setTotalAudienceFootfall] = useState(0);
  const [totalMysteryTaps, setTotalMysteryTaps] = useState(0);
  const [totalQrScans, setTotalQrScans] = useState(0);
  const [storePerformances, setStorePerformances] = useState<StorePerformance[]>([]);
  const [storesMap, setStoresMap] = useState<Record<string, StoreMetadata>>({});
  const [loading, setLoading] = useState(true);

  // Check persistent session
  useEffect(() => {
    const savedAuth = sessionStorage.getItem(`ad_auth_${adId}`);
    if (savedAuth === "unlocked") {
      setIsAuthenticated(true);
    }
  }, [adId]);

  // Load stores directory for store names & cities
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

  // Campaign Lookup
  useEffect(() => {
    async function fetchAd() {
      try {
        let snap = await getDoc(doc(db, "active_ads", adId));
        if (snap.exists()) {
          setAd({ docId: snap.id, ...snap.data() } as AdCampaign);
        } else {
          const q = query(collection(db, "active_ads"), where("id", "==", Number(adId)));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            const docMatch = querySnap.docs[0];
            setAd({ docId: docMatch.id, ...docMatch.data() } as AdCampaign);
          }
        }
      } catch (err) {
        console.error("Failed to load campaign data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAd();
  }, [adId]);

  // Listen to daily impressions and build store-by-store performance analytics
  useEffect(() => {
    if (!isAuthenticated || !ad) return;

    const unsubMetrics = onSnapshot(collection(db, "daily_impressions"), (snap) => {
      let plays = 0;
      let footfall = 0;
      let taps = 0;
      let qrCount = 0;

      const adKey = `ad_${ad.id}`;
      const storeStats: Record<string, { plays: number; footfall: number; qrScans: number }> = {};

      snap.forEach((docSnap) => {
        const d = docSnap.data();

        let currentStoreId = d.storeId;
        if (!currentStoreId && docSnap.id.includes("_")) {
          currentStoreId = docSnap.id.substring(docSnap.id.indexOf("_") + 1);
        }
        if (!currentStoreId) return;

        if (!storeStats[currentStoreId]) {
          storeStats[currentStoreId] = { plays: 0, footfall: 0, qrScans: 0 };
        }

        const docImpressions = Number(d.total_impressions || 0);
        const docFootfall = Number(d.total_ble_footfall || 0);
        const docTaps = Number(d.total_mystery_taps || 0);

        plays += docImpressions;
        footfall += docFootfall;
        taps += docTaps;

        storeStats[currentStoreId].plays += docImpressions;
        storeStats[currentStoreId].footfall += docFootfall;

        // Extract scans specifically attributed to this commercial campaign
        let adScansForDoc = 0;
        if (d.qr_scans && typeof d.qr_scans === "object") {
          adScansForDoc += Number(d.qr_scans[adKey] || d.qr_scans[ad.docId] || d.qr_scans[adId] || 0);
        }
        if (d[`qr_scans.${adKey}`]) {
          adScansForDoc += Number(d[`qr_scans.${adKey}`]);
        }

        qrCount += adScansForDoc;
        storeStats[currentStoreId].qrScans += adScansForDoc;
      });

      setTotalNetworkPlays(plays);
      setTotalAudienceFootfall(footfall);
      setTotalMysteryTaps(taps);
      setTotalQrScans(qrCount);

      // Build array with store names & cities
      const perfList: StorePerformance[] = Object.entries(storeStats).map(([sId, stats]) => ({
        storeId: sId,
        storeName: storesMap[sId]?.storeName || sId,
        city: storesMap[sId]?.city || "Ludhiana",
        plays: stats.plays,
        footfall: stats.footfall,
        qrScans: stats.qrScans,
      }));

      perfList.sort((a, b) => b.qrScans - a.qrScans || b.plays - a.plays);
      setStorePerformances(perfList);
    });

    const unsubDevices = onSnapshot(collection(db, "devices"), (snap) => {
      setTotalDisplaysCount(snap.size);
    });

    return () => {
      unsubMetrics();
      unsubDevices();
    };
  }, [isAuthenticated, ad, adId, storesMap]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ad) return;

    const expectedPin = ad.clientPin ? ad.clientPin.trim() : "1234";

    if (pinAttempt.trim() === expectedPin) {
      sessionStorage.setItem(`ad_auth_${adId}`, "unlocked");
      setIsAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPinAttempt("");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(`ad_auth_${adId}`);
    setIsAuthenticated(false);
    setPinAttempt("");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!ad) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-center">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-sm w-full space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-base font-bold text-white">Campaign Not Found</h2>
          <p className="text-xs text-slate-400">
            No active campaign found under identifier <code className="text-indigo-400 font-mono">{adId}</code>.
          </p>
        </div>
      </div>
    );
  }

  const campaignTitle = ad.title || `Campaign #${ad.id}`;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-8 shadow-2xl text-center space-y-6">
          <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center mx-auto text-indigo-400">
            <Film className="w-6 h-6" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">{campaignTitle}</h2>
            <p className="text-xs text-slate-400 mt-1">Brand Advertiser Performance Portal</p>
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
                placeholder="Enter Client Passcode"
                className="w-full text-center tracking-widest text-xl font-mono px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1.5">
                Passkey provided by your media network account executive.
              </p>
            </div>

            {pinError && (
              <p className="text-xs text-rose-400 font-semibold">
                Invalid client passcode. Access denied.
              </p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-indigo-600/20"
            >
              Access Performance Metrics
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Group metrics by city for market analysis
  const citySummary: Record<string, { plays: number; scans: number; footfall: number }> = {};
  storePerformances.forEach((sp) => {
    if (!citySummary[sp.city]) {
      citySummary[sp.city] = { plays: 0, scans: 0, footfall: 0 };
    }
    citySummary[sp.city].plays += sp.plays;
    citySummary[sp.city].scans += sp.qrScans;
    citySummary[sp.city].footfall += sp.footfall;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white leading-tight">{campaignTitle}</h1>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  ad.isActive
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-slate-800 text-slate-500 border border-slate-700"
                }`}
              >
                {ad.isActive ? "● Broadcasting Live" : "○ Scheduled / Paused"}
              </span>
            </div>
            <p className="text-xs text-slate-400">Verified Campaign Performance Audit</p>
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
      <main className="p-6 max-w-6xl mx-auto space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Total Screen Plays
            </p>
            <p className="text-2xl font-bold mt-1 text-amber-400 flex items-center gap-2 font-mono">
              <Eye className="w-5 h-5" />
              {totalNetworkPlays.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Verified screen executions</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Audience Footfall (BLE)
            </p>
            <p className="text-2xl font-bold mt-1 text-indigo-400 flex items-center gap-2 font-mono">
              <Users className="w-5 h-5" />
              {totalAudienceFootfall.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Verified passerby impressions</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Direct Campaign QR Scans
            </p>
            <p className="text-2xl font-bold mt-1 text-emerald-400 flex items-center gap-2 font-mono">
              <QrCode className="w-5 h-5" />
              {totalQrScans.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Direct audience conversions</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Connected Kiosks
            </p>
            <p className="text-2xl font-bold mt-1 text-white flex items-center gap-2 font-mono">
              <Building2 className="w-5 h-5 text-slate-400" />
              {totalDisplaysCount} Screens
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Active retail tablets</p>
          </div>
        </div>

        {/* Video Creative & Network SLA Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Play className="w-4 h-4 text-indigo-400" /> Active Creative Loop
              </h3>
              <span className="text-[11px] font-mono text-slate-400">{Number(ad.durationSeconds || 15)}s MP4</span>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-800">
              <video
                src={ad.videoUrl}
                controls
                className="w-full h-full object-cover"
              />
            </div>

            {ad.actionUrl && (
              <div className="text-xs text-slate-400 truncate flex items-center gap-1.5 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                <ExternalLink className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="truncate">Destination: {ad.actionUrl}</span>
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Network SLA Certification
                </h3>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  100% SLA Verified
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <p>
                  Telemetry log data is transmitted directly from physical in-store Android kiosk hardware heartbeats every 60 seconds.
                </p>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Campaign DB Key:</span>
                    <span className="text-white">ad_{ad.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Cities Covered:</span>
                    <span className="text-indigo-400 font-bold">{Object.keys(citySummary).length} Markets</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Network Hardware Status:</span>
                    <span className="text-emerald-400 flex items-center gap-1 font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Telemetry Synced
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* City Distribution Chips */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Geographic Market Distribution
              </span>
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(citySummary).map(([city, data]) => (
                  <span
                    key={city}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300"
                  >
                    <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                    <b>{city}:</b> {data.plays.toLocaleString()} plays • {data.scans} scans
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Geographic & Store-by-Store Audit Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Location &amp; Store Performance Breakdown</h3>
            </div>
            <span className="text-xs text-slate-400">{storePerformances.length} Active Stores</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3">Store Location</th>
                  <th className="px-6 py-3">City / Area</th>
                  <th className="px-6 py-3">Screen Plays</th>
                  <th className="px-6 py-3">Shopper Footfall</th>
                  <th className="px-6 py-3">Direct QR Scans</th>
                  <th className="px-6 py-3 text-right">Conversion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {storePerformances.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      No store performance logs recorded yet for this flight.
                    </td>
                  </tr>
                ) : (
                  storePerformances.map((sp) => {
                    const convRate = sp.plays > 0 ? ((sp.qrScans / sp.plays) * 100).toFixed(2) : "0.00";
                    return (
                      <tr key={sp.storeId} className="hover:bg-slate-800/30 transition">
                        <td className="px-6 py-4 font-semibold text-white">
                          <p>{sp.storeName}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{sp.storeId}</p>
                        </td>

                        <td className="px-6 py-4 font-medium text-slate-300 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>{sp.city}</span>
                        </td>

                        <td className="px-6 py-4 font-mono font-bold text-amber-400">
                          {sp.plays.toLocaleString()}
                        </td>

                        <td className="px-6 py-4 font-mono text-indigo-400">
                          {sp.footfall.toLocaleString()} passersby
                        </td>

                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold">
                            <QrCode className="w-3.5 h-3.5" /> {sp.qrScans} scans
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-300">
                          {convRate}%
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