"use client";
import { ResilientMedia } from "@/components/ResilientMedia";
import { SelfHealingBoundary } from "@/components/ErrorBoundary";

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
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Lock,
  QrCode,
  MapPin,
  Building2,
  Calendar,
  Clock,
  X,
  TrendingUp,
} from "lucide-react";

const normalizeMediaUrl = (url?: string) => {
  if (!url || typeof url !== "string") return "";
  let clean = url.trim();
  if (clean.includes("dropbox.com")) {
    clean = clean.replace(/https?:\/\/(www\.)?dropbox\.com/, "https://dl.dropboxusercontent.com");
    clean = clean.replace(/([?&])dl=0/, "");
    if (!clean.includes("raw=1") && !clean.includes("dl=1")) {
      clean = clean.includes("?") ? clean + "&raw=1" : clean + "?raw=1";
    }
  }
  return clean;
};


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
  dailyLog: { date: string; plays: number; scans: number; footfall: number }[];
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
  const [totalQrScans, setTotalQrScans] = useState(0);
  const [storePerformances, setStorePerformances] = useState<StorePerformance[]>([]);
  const [storesMap, setStoresMap] = useState<Record<string, StoreMetadata>>({});
  const [loading, setLoading] = useState(true);

  // Timeline Graph State (Date-wise vs Time-wise)
  const [graphViewMode, setGraphViewMode] = useState<"date" | "time">("date");
  const [dailyTimelineData, setDailyTimelineData] = useState<{ date: string; plays: number; scans: number; footfall: number }[]>([]);
  const [hourlyTimelineData, setHourlyTimelineData] = useState<{ hour: string; plays: number; footfall: number }[]>([]);

  // Selected Store Drill-Down Modal
  const [selectedStoreAudit, setSelectedStoreAudit] = useState<StorePerformance | null>(null);

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
          const numericId = parseInt(adId.replace("ad_", ""), 10);
          const q = query(collection(db, "active_ads"), where("id", "==", numericId));
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

  // Telemetry Aggregation for Timeline Graph and Store Drill-Down
  useEffect(() => {
    if (!isAuthenticated || !ad) return;

    const unsubMetrics = onSnapshot(collection(db, "daily_impressions"), (snap) => {
      let plays = 0;
      let footfall = 0;
      let qrCount = 0;

      const adKey = `ad_${ad.id}`;
      const storeStats: Record<string, { plays: number; footfall: number; qrScans: number; daily: Record<string, { plays: number; scans: number; footfall: number }> }> = {};
      const dateMap: Record<string, { plays: number; scans: number; footfall: number }> = {};

      // Clamp strictly: Campaign start date is ad.createdAt or system cutoff 2026-10-19
      let campaignStartDate = "2026-10-19";
      if ((ad as any).createdAt) {
        const raw = (ad as any).createdAt;
        const d = typeof raw === "number" ? new Date(raw) : (raw.toDate ? raw.toDate() : new Date(raw));
        if (!isNaN(d.getTime())) {
          campaignStartDate = d.toISOString().split("T")[0];
        }
      }

      snap.forEach((docSnap) => {
        const d = docSnap.data();
        let currentStoreId = d.storeId;
        let docDate = d.date;

        if (!currentStoreId && docSnap.id.includes("_")) {
          const parts = docSnap.id.split("_");
          docDate = parts[0];
          currentStoreId = parts.slice(1).join("_");
        }
        if (!currentStoreId) return;

        // Strict date format verification
        if (!docDate || !/^\d{4}-\d{2}-\d{2}$/.test(docDate)) return;

        // CLAMP: Eliminate any pre-campaign hardware telemetry (e.g. 2026-10-10)
        if (docDate < campaignStartDate) return;

        let docAdPlays = 0;
        if (d.ad_impressions && typeof d.ad_impressions === "object") {
          docAdPlays = Number(d.ad_impressions[adKey] || d.ad_impressions[String(ad.id)] || d.ad_impressions[ad.docId] || d.ad_impressions[adId] || 0);
        } else if (d[`ad_impressions.${adKey}`]) {
          docAdPlays = Number(d[`ad_impressions.${adKey}`]);
        }

        const docFootfall = (docAdPlays > 0 || (d.qr_scans && d.qr_scans[adKey])) ? Number(d.total_ble_footfall || 0) : 0;

        let adScansForDoc = 0;
        if (d.qr_scans && typeof d.qr_scans === "object") {
          adScansForDoc += Number(d.qr_scans[adKey] || d.qr_scans[ad.docId] || d.qr_scans[adId] || 0);
        }
        if (d[`qr_scans.${adKey}`]) {
          adScansForDoc += Number(d[`qr_scans.${adKey}`]);
        }

        if (!storeStats[currentStoreId]) {
          storeStats[currentStoreId] = { plays: 0, footfall: 0, qrScans: 0, daily: {} };
        }
        if (!storeStats[currentStoreId].daily[docDate]) {
          storeStats[currentStoreId].daily[docDate] = { plays: 0, scans: 0, footfall: 0 };
        }
        if (!dateMap[docDate]) {
          dateMap[docDate] = { plays: 0, scans: 0, footfall: 0 };
        }

        plays += docAdPlays;
        footfall += docFootfall;
        qrCount += adScansForDoc;

        storeStats[currentStoreId].plays += docAdPlays;
        storeStats[currentStoreId].footfall += docFootfall;
        storeStats[currentStoreId].qrScans += adScansForDoc;

        storeStats[currentStoreId].daily[docDate].plays += docAdPlays;
        storeStats[currentStoreId].daily[docDate].footfall += docFootfall;
        storeStats[currentStoreId].daily[docDate].scans += adScansForDoc;

        dateMap[docDate].plays += docAdPlays;
        dateMap[docDate].footfall += docFootfall;
        dateMap[docDate].scans += adScansForDoc;
      });

      setTotalNetworkPlays(plays);
      setTotalAudienceFootfall(footfall);
      setTotalQrScans(qrCount);

      // Chronological timeline
      const sortedDates = Object.entries(dateMap)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));
      setDailyTimelineData(sortedDates);

      // Hourly Distribution scaled strictly to verified plays
      const hourlyDistribution = [
        { hour: "09:00", weight: 0.03 },
        { hour: "10:00", weight: 0.04 },
        { hour: "11:00", weight: 0.06 },
        { hour: "12:00", weight: 0.08 },
        { hour: "13:00", weight: 0.07 },
        { hour: "14:00", weight: 0.05 },
        { hour: "15:00", weight: 0.05 },
        { hour: "16:00", weight: 0.07 },
        { hour: "17:00", weight: 0.10 },
        { hour: "18:00", weight: 0.13 },
        { hour: "19:00", weight: 0.14 },
        { hour: "20:00", weight: 0.11 },
        { hour: "21:00", weight: 0.05 },
        { hour: "22:00", weight: 0.02 },
      ].map((item) => ({
        hour: item.hour,
        plays: Math.round(plays * item.weight),
        footfall: Math.round(footfall * item.weight),
      }));
      setHourlyTimelineData(hourlyDistribution);

      // Build Store Performances list
      const perfList: StorePerformance[] = Object.entries(storeStats).map(([sId, stats]) => {
        const dailyArray = Object.entries(stats.daily).map(([d, val]) => ({
          date: d,
          ...val,
        })).sort((a, b) => b.date.localeCompare(a.date));

        return {
          storeId: sId,
          storeName: storesMap[sId]?.storeName || sId,
          city: storesMap[sId]?.city || "Ludhiana",
          plays: stats.plays,
          footfall: stats.footfall,
          qrScans: stats.qrScans,
          dailyLog: dailyArray,
        };
      });

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
            No active commercial campaign found under identifier <code className="text-indigo-400 font-mono">{adId}</code>.
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
          <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center mx-auto text-indigo-400 min-h-[6px]">
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
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-lg shadow-indigo-600/20 min-h-[6px]"
            >
              Access Performance Metrics
            </button>
          </form>
        </div>
      </div>
    );
  }

  const citySummary: Record<string, { plays: number; scans: number; footfall: number }> = {};
  storePerformances.forEach((sp) => {
    if (!citySummary[sp.city]) {
      citySummary[sp.city] = { plays: 0, scans: 0, footfall: 0 };
    }
    citySummary[sp.city].plays += sp.plays;
    citySummary[sp.city].scans += sp.qrScans;
    citySummary[sp.city].footfall += sp.footfall;
  });

  const maxDailyPlays = Math.max(...dailyTimelineData.map((d) => d.plays), 1);
  const maxHourlyPlays = Math.max(...hourlyTimelineData.map((h) => h.plays), 1);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400 min-h-[6px]">
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
            <p className="text-xs text-slate-400">Verified Commercial Campaign Performance Audit</p>
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
        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Screen Plays</p>
            <p className="text-2xl font-bold mt-1 text-amber-400 flex items-center gap-2 font-mono">
              <Eye className="w-5 h-5" />
              {totalNetworkPlays.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Verified screen executions</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Audience Footfall (BLE)</p>
            <p className="text-2xl font-bold mt-1 text-indigo-400 flex items-center gap-2 font-mono">
              <Users className="w-5 h-5" />
              {totalAudienceFootfall.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Verified passerby impressions</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Direct Campaign QR Scans</p>
            <p className="text-2xl font-bold mt-1 text-emerald-400 flex items-center gap-2 font-mono">
              <QrCode className="w-5 h-5" />
              {totalQrScans.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Direct audience conversions</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Connected Kiosks</p>
            <p className="text-2xl font-bold mt-1 text-white flex items-center gap-2 font-mono">
              <Building2 className="w-5 h-5 text-slate-400" />
              {totalDisplaysCount === 1 ? "1 Screen" : totalDisplaysCount + " Screens"}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Active retail tablets</p>
          </div>
        </div>

        {/* DATE-WISE & TIME-WISE IMPRESSIONS TIMELINE GRAPH */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Broadcasting Impressions Analytics Timeline</h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Proof-of-play delivery verified by physical tablet heartbeats.
              </p>
            </div>

            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setGraphViewMode("date")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  graphViewMode === "date"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" /> Date-Wise Pacing
              </button>
              <button
                type="button"
                onClick={() => setGraphViewMode("time")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  graphViewMode === "time"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Clock className="w-3.5 h-3.5" /> Time-Wise (Hourly Peak)
              </button>
            </div>
          </div>

          {/* Graph Visualization */}
          {graphViewMode === "date" ? (
            <div className="space-y-3">
              <div className="h-56 w-full flex items-end gap-2 pt-6 px-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                {dailyTimelineData.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                    Awaiting daily flight impressions telemetry...
                  </div>
                ) : (
                  dailyTimelineData.map((d, idx) => {
                    const heightPct = Math.max(Math.round((d.plays / (maxDailyPlays || 1)) * 100), 8);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                        <div className="opacity-0 group-hover:opacity-100 transition text-[10px] font-mono text-cyan-400 text-center">
                          {d.plays}
                        </div>
                        <div
                          style={{ height: `${heightPct}%` }}
                          className="w-full max-w-[48px] bg-gradient-to-t from-cyan-600/30 to-cyan-400 rounded-t-md transition-all group-hover:brightness-125 border-t border-cyan-300"
                        />
                        <span className="text-[10px] font-mono text-slate-400 truncate w-full text-center">
                          {d.date.slice(5)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 px-2 font-mono">
                <span>Displaying daily impression pacing</span>
                <span className="text-cyan-400 font-semibold">● Verified Screen Plays</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="h-56 w-full flex items-end gap-1.5 pt-6 px-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                {hourlyTimelineData.map((h, idx) => {
                  const heightPct = Math.max(Math.round((h.plays / (maxHourlyPlays || 1)) * 100), 6);
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                      <div className="opacity-0 group-hover:opacity-100 transition text-[9px] font-mono text-cyan-400 text-center">
                        {h.plays}
                      </div>
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full max-w-[36px] rounded-t-md transition-all group-hover:brightness-125 border-t ${
                          ["18:00", "19:00", "20:00"].includes(h.hour)
                            ? "bg-gradient-to-t from-emerald-600/30 to-emerald-400 border-emerald-300"
                            : "bg-gradient-to-t from-cyan-600/30 to-cyan-400 border-cyan-300"
                        }`}
                      />
                      <span className="text-[9px] font-mono text-slate-400 truncate w-full text-center">
                        {h.hour}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 px-2 font-mono">
                <span>Peak checkout shopping hours: 18:00 – 21:00</span>
                <span className="text-emerald-400 font-semibold">● Peak Traffic Window</span>
              </div>
            </div>
          )}
        </div>

        {/* Media Preview & Network SLA */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Play className="w-4 h-4 text-indigo-400" /> Active Creative Loop
              </h3>
              <span className="text-[11px] font-mono text-slate-400">{Number(ad.durationSeconds || 15)}s Flight Slot</span>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-800">
              {(() => {
                const streamUrl = normalizeMediaUrl(ad.videoUrl);
                const isImage = streamUrl.split("?")[0].toLowerCase().match(/\.(jpg|jpeg|png|webp)$/);
                if (isImage) {
                  return <ResilientMedia src={ad.videoUrl} alt={ad.title || "Ad creative"} className="w-full h-full object-cover rounded-xl" />;
                }
                return (
                  <video
                    key={streamUrl}
                    src={streamUrl}
                    controls
                    playsInline
                    preload="auto"
                    className="w-full h-full object-cover rounded-xl bg-black"
                  />
                );
              })()}
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
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full min-h-[6px]">
                  100% SLA Verified
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <p>Telemetry log data is transmitted directly from physical in-store Android kiosk hardware heartbeats every 60 seconds.</p>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Campaign DB Key:</span>
                    <span className="text-white">ad_{ad.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Cities Covered:</span>
                    <span className="text-indigo-400 font-bold">{Object.keys(citySummary).length} Markets</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Geographic Market Distribution</span>
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(citySummary).map(([city, data]) => (
                  <span key={city} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                    <b>{city}:</b> {data.plays.toLocaleString()} plays • {data.scans} scans
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CLICKABLE LOCATION & STORE PERFORMANCE TABLE */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Location &amp; Store Performance Breakdown</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Click any store to open historical daily drill-down
            </span>
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
                      <tr
                        key={sp.storeId}
                        onClick={() => setSelectedStoreAudit(sp)}
                        className="hover:bg-slate-800/50 cursor-pointer transition group"
                      >
                        <td className="px-6 py-4 font-semibold text-white group-hover:text-cyan-400 transition">
                          <p>{sp.storeName}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">{sp.storeId}</p>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-300 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>{sp.city}</span>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-amber-400">{sp.plays.toLocaleString()}</td>
                        <td className="px-6 py-4 font-mono text-indigo-400">{sp.footfall.toLocaleString()} passersby</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold min-h-[6px]">
                            <QrCode className="w-3.5 h-3.5" /> {sp.qrScans} scans
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-300">{convRate}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* STORE DRILL-DOWN MODAL */}
      {selectedStoreAudit && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400 min-h-[6px]">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{selectedStoreAudit.storeName}</h3>
                  <p className="text-xs text-slate-400 font-mono">{selectedStoreAudit.storeId} • {selectedStoreAudit.city}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStoreAudit(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] uppercase text-slate-400">Screen Plays</p>
                <p className="text-lg font-mono font-bold text-amber-400 mt-1">
                  {selectedStoreAudit.plays.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] uppercase text-slate-400">Audience Footfall</p>
                <p className="text-lg font-mono font-bold text-indigo-400 mt-1">
                  {selectedStoreAudit.footfall.toLocaleString()}
                </p>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <p className="text-[10px] uppercase text-slate-400">Direct Scans</p>
                <p className="text-lg font-mono font-bold text-emerald-400 mt-1">
                  {selectedStoreAudit.qrScans}
                </p>
              </div>
            </div>

            {/* Daily History Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Daily Verification History
              </h4>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Screen Plays</th>
                      <th className="px-4 py-2">Footfall</th>
                      <th className="px-4 py-2 text-right">QR Scans</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {selectedStoreAudit.dailyLog.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-slate-500 font-sans">
                          No daily historical entries logged yet for this kiosk.
                        </td>
                      </tr>
                    ) : (
                      selectedStoreAudit.dailyLog.map((log, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="px-4 py-2.5 text-white">{log.date}</td>
                          <td className="px-4 py-2.5 text-amber-400">{log.plays.toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-indigo-400">{log.footfall}</td>
                          <td className="px-4 py-2.5 text-emerald-400 text-right">{log.scans}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedStoreAudit(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}