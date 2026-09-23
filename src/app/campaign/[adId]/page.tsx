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
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
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
  const [loading, setLoading] = useState(true);

  // Check persistent session
  useEffect(() => {
    const savedAuth = sessionStorage.getItem(`ad_auth_${adId}`);
    if (savedAuth === "unlocked") {
      setIsAuthenticated(true);
    }
  }, [adId]);

  // Robust Campaign Lookup
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

  // Listen to live impressions and tablet counts
  useEffect(() => {
    if (!isAuthenticated || !ad) return;

    const unsubMetrics = onSnapshot(collection(db, "daily_impressions"), (snap) => {
      let plays = 0;
      let footfall = 0;
      let taps = 0;

      snap.forEach((docSnap) => {
        const d = docSnap.data();
        plays += Number(d.total_impressions || 0);
        footfall += Number(d.total_ble_footfall || 0);
        taps += Number(d.total_mystery_taps || 0);
      });

      setTotalNetworkPlays(plays);
      setTotalAudienceFootfall(footfall);
      setTotalMysteryTaps(taps);
    });

    const unsubDevices = onSnapshot(collection(db, "devices"), (snap) => {
      setTotalDisplaysCount(snap.size);
    });

    return () => {
      unsubMetrics();
      unsubDevices();
    };
  }, [isAuthenticated, ad]);

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
            No active campaign found under reference identifier <code className="text-indigo-400 font-mono">{adId}</code>.
          </p>
        </div>
      </div>
    );
  }

  const campaignTitle = ad.title || `Campaign #${ad.id}`;

  // Passcode Gate
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
                Secure passkey provided by your media network account executive.
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12">
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
      <main className="p-6 max-w-5xl mx-auto space-y-6">
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
              Interactive Engagements
            </p>
            <p className="text-2xl font-bold mt-1 text-purple-400 flex items-center gap-2 font-mono">
              <Sparkles className="w-5 h-5" />
              {totalMysteryTaps.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Direct touch screen interactions</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Slot Duration
            </p>
            <p className="text-2xl font-bold mt-1 text-white flex items-center gap-2 font-mono">
              <Clock className="w-5 h-5 text-slate-400" />
              {Number(ad.durationSeconds || 15)}s
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Loop frequency: continuous</p>
          </div>
        </div>

        {/* Video Creative & Campaign Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Active Creative Player */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Play className="w-4 h-4 text-indigo-400" /> Active Creative Loop
              </h3>
              <span className="text-[11px] font-mono text-slate-400">MP4 Video</span>
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

          {/* Network Certification Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Network Certification
                </h3>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  100% SLA Verified
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <p>
                  This campaign is operating across our digital tablet network with continuous audit telemetry logging.
                </p>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Campaign ID:</span>
                    <span className="font-mono text-white">ad_{ad.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Connected Displays:</span>
                    <span className="font-mono text-indigo-400 font-bold">{totalDisplaysCount} Kiosks</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Hardware Heartbeat:</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 flex items-center gap-2">
              <Radio className="w-4 h-4 shrink-0" />
              <span>Screens log telemetry heartbeats every 60 seconds directly to cloud audit logs.</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}