"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapDevice {
  storeId: string;
  status: "ONLINE" | "STORE_CLOSED" | "OFFLINE";
  latitude?: number;
  longitude?: number;
  battery_percentage?: number;
  store_open_time?: string;
  store_close_time?: string;
  footfall?: number;
  impressions?: number;
  qrScans?: number;
  adQrScans?: number;
  mysteryQrScans?: number;
}

interface FleetMapProps {
  devices: MapDevice[];
}

export default function FleetMap({ devices }: FleetMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const validDevices = devices.filter(
      (d) =>
        typeof d.latitude === "number" &&
        typeof d.longitude === "number" &&
        !isNaN(d.latitude) &&
        !isNaN(d.longitude) &&
        d.latitude !== 0 &&
        d.longitude !== 0
    );

    const initialLat = validDevices[0]?.latitude ?? 30.901;
    const initialLng = validDevices[0]?.longitude ?? 75.8573;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([initialLat, initialLng], validDevices.length > 0 ? 12 : 7);

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        {
          maxNativeZoom: 16,
          maxZoom: 19,
        }
      ).addTo(map);

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        {
          maxNativeZoom: 16,
          maxZoom: 19,
        }
      ).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear existing markers on re-render
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    const bounds = L.latLngBounds([]);

    validDevices.forEach((device) => {
      const color =
        device.status === "ONLINE"
          ? "#10b981"
          : device.status === "STORE_CLOSED"
          ? "#f59e0b"
          : "#f43f5e";

      const customIcon = L.divIcon({
        className: "custom-leaflet-pin",
        html: `
          <div style="position: relative; width: 24px; height: 24px;">
            <div style="
              position: absolute;
              inset: 0;
              border-radius: 9999px;
              background-color: ${color};
              opacity: 0.3;
              animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
            "></div>
            <div style="
              position: relative;
              width: 20px;
              height: 20px;
              margin: 2px;
              border-radius: 9999px;
              background-color: ${color};
              border: 2px solid #0f172a;
              box-shadow: 0 0 10px ${color}80;
            "></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${device.latitude},${device.longitude}`;

      const popupHtml = `
        <div style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 10px; border: 1px solid #334155; min-width: 200px;">
          <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
            <span>${device.storeId}</span>
            <span style="font-size: 10px; color: ${color}; font-weight: 600;">${device.status}</span>
          </div>
          <div style="font-size: 11px; color: #94a3b8; line-height: 1.6; margin-bottom: 8px;">
            🔋 Battery: <b style="color: #f8fafc;">${device.battery_percentage ?? "--"}%</b><br/>
            👥 Footfall: <b style="color: #818cf8;">${device.footfall ?? 0}</b><br/>
            🎬 Ad Plays: <b style="color: #fbbf24;">${device.impressions ?? 0}</b><br/>
            📱 Total QR Scans: <b style="color: #34d399;">${device.qrScans ?? 0}</b><br/>
            <span style="padding-left: 10px; color: #94a3b8; font-size: 10px;">• Ad QR: <b style="color: #38bdf8;">${device.adQrScans ?? 0}</b></span><br/>
            <span style="padding-left: 10px; color: #94a3b8; font-size: 10px;">• Surprise QR: <b style="color: #f472b6;">${device.mysteryQrScans ?? 0}</b></span><br/>
            ⏰ Hours: ${device.store_open_time || "09:00"} - ${device.store_close_time || "21:30"}
          </div>
          <a
            href="${directionsUrl}"
            target="_blank"
            rel="noopener noreferrer"
            style="
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              width: 100%;
              padding: 7px 10px;
              background-color: #4f46e5;
              color: white;
              border-radius: 6px;
              text-decoration: none;
              font-weight: 600;
              font-size: 11px;
              text-align: center;
              box-sizing: border-box;
              transition: background-color 0.2s;
            "
            onmouseover="this.style.backgroundColor='#4338ca'"
            onmouseout="this.style.backgroundColor='#4f46e5'"
          >
            📍 Navigate / Get Directions ↗
          </a>
        </div>
      `;

      const marker = L.marker([device.latitude!, device.longitude!], {
        icon: customIcon,
      }).bindPopup(popupHtml, {
        className: "dark-leaflet-popup",
      });

      marker.addTo(map);
      bounds.extend([device.latitude!, device.longitude!]);
    });

    if (validDevices.length > 1) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (validDevices.length === 1) {
      map.setView([validDevices[0].latitude!, validDevices[0].longitude!], 14);
    }
  }, [devices]);

  return (
    <div className="relative w-full h-80 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
      <div className="absolute top-3 right-3 z-10 bg-slate-900/90 backdrop-blur border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 shadow">
        Live Tablet GPS Network ({devices.filter((d) => d.latitude && d.longitude).length} Mapped)
      </div>
    </div>
  );
}