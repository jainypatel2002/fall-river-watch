"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type ReportMapItem = {
  id: string;
  category: string;
  status: string;
  title: string | null;
  severity: number;
  display_lat: number;
  display_lng: number;
};

type IncidentMapProps = {
  reports: ReportMapItem[];
  selectedReportId: string | null;
  center: { lat: number; lng: number };
  userLocation: { lat: number; lng: number } | null;
  onSelectReport: (id: string) => void;
  onCenterChange: (center: { lat: number; lng: number }) => void;
};

const SOURCE_ID = "reports-source";
const LAYER_CLUSTERS = "clusters";
const LAYER_CLUSTER_COUNT = "cluster-count";
const LAYER_POINTS = "unclustered-point";

export default function IncidentMap({
  reports,
  selectedReportId,
  center,
  userLocation,
  onSelectReport,
  onCenterChange
}: IncidentMapProps) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const geoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: reports.map((report) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [report.display_lng, report.display_lat]
        },
        properties: {
          id: report.id,
          category: report.category,
          status: report.status,
          title: report.title ?? "Untitled report",
          severity: report.severity
        }
      }))
    }),
    [reports]
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !token) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [center.lng, center.lat],
      zoom: 12,
      attributionControl: true
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: geoJson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });

      map.addLayer({
        id: LAYER_CLUSTERS,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#0f766e",
          "circle-radius": ["step", ["get", "point_count"], 18, 15, 24, 40, 30],
          "circle-opacity": 0.85
        }
      });

      map.addLayer({
        id: LAYER_CLUSTER_COUNT,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12
        },
        paint: {
          "text-color": "#ffffff"
        }
      });

      map.addLayer({
        id: LAYER_POINTS,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "status"],
            "verified",
            "#15803d",
            "disputed",
            "#be123c",
            "resolved",
            "#475569",
            "expired",
            "#71717a",
            "#f59e0b"
          ],
          "circle-radius": 9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        }
      });

      map.on("click", LAYER_CLUSTERS, (event) => {
        const features = map.queryRenderedFeatures(event.point, { layers: [LAYER_CLUSTERS] });
        const feature = features[0];
        const clusterId = feature?.properties?.cluster_id;
        if (!clusterId) return;

        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return;
          const coords = (feature.geometry as { coordinates: [number, number] }).coordinates;
          map.easeTo({ center: [coords[0], coords[1]], zoom });
        });
      });

      map.on("click", LAYER_POINTS, (event) => {
        const feature = event.features?.[0];
        if (!feature?.properties?.id) return;

        const id = String(feature.properties.id);
        onSelectReport(id);

        const title = String(feature.properties.title ?? "Report");
        const status = String(feature.properties.status ?? "unverified");
        const popupNode = document.createElement("div");
        popupNode.style.padding = "10px 12px";
        popupNode.style.minWidth = "180px";
        const titleNode = document.createElement("strong");
        titleNode.textContent = title;
        const statusNode = document.createElement("div");
        statusNode.style.fontSize = "12px";
        statusNode.style.marginTop = "4px";
        statusNode.style.textTransform = "capitalize";
        statusNode.textContent = status;
        popupNode.append(titleNode, statusNode);

        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: false, offset: 12 })
          .setLngLat((feature.geometry as { coordinates: [number, number] }).coordinates)
          .setDOMContent(popupNode)
          .addTo(map);
      });
    });

    map.on("moveend", () => {
      const mapCenter = map.getCenter();
      onCenterChange({ lat: mapCenter.lat, lng: mapCenter.lng });
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [center.lat, center.lng, geoJson, onCenterChange, onSelectReport, token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData(geoJson);
    }
  }, [geoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedReportId) return;

    const selected = reports.find((report) => report.id === selectedReportId);
    if (!selected) return;

    map.easeTo({ center: [selected.display_lng, selected.display_lat], duration: 300 });
  }, [reports, selectedReportId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    if (!userMarkerRef.current) {
      userMarkerRef.current = new mapboxgl.Marker({ color: "#2563eb" }).setLngLat([userLocation.lng, userLocation.lat]).addTo(map);
      return;
    }

    userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
  }, [userLocation]);

  if (!token) {
    return <div className="grid h-[65vh] place-items-center rounded-xl border border-zinc-300 bg-zinc-100">Missing `NEXT_PUBLIC_MAPBOX_TOKEN`.</div>;
  }

  return <div ref={mapContainerRef} className="h-[65vh] w-full overflow-hidden rounded-xl border border-zinc-200" />;
}
