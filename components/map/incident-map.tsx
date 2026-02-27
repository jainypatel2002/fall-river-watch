"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
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
  isActive?: boolean;
  searchTarget?: SearchTarget | null;
  onSelectReport: (id: string) => void;
  onViewportChange: (viewport: {
    center: { lat: number; lng: number };
    bounds: { north: number; south: number; east: number; west: number };
  }) => void;
};

type SearchTarget = {
  id: string;
  label: string;
  lng: number;
  lat: number;
};

const SOURCE_ID = "reports-source";
const LAYER_CLUSTERS = "clusters";
const LAYER_CLUSTER_COUNT = "cluster-count";
const LAYER_POINTS = "unclustered-point";
const SEARCH_PIN_SOURCE_ID = "search-pin-source";
const SEARCH_PIN_LAYER_ID = "search-pin-layer";
const VIEWPORT_DEBOUNCE_MS = 280;
const CAMERA_SYNC_EPSILON = 0.0004;

function shouldReduceMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function normalizeLongitude(value: number) {
  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 ? 180 : normalized;
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidPoint(point: { lng: unknown; lat: unknown } | null | undefined): point is { lng: number; lat: number } {
  if (!point) return false;
  return isFiniteCoordinate(point.lng) && isFiniteCoordinate(point.lat);
}

function buildSearchPinGeoJson(target: SearchTarget | null): GeoJSON.FeatureCollection<GeoJSON.Point, GeoJSON.GeoJsonProperties> {
  if (!target || !isValidPoint(target)) {
    return {
      type: "FeatureCollection",
      features: []
    };
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [target.lng, target.lat]
        },
        properties: {
          id: target.id,
          label: target.label
        }
      }
    ]
  };
}

function hasMeaningfulCenterDelta(current: { lat: number; lng: number }, next: { lat: number; lng: number }) {
  return Math.abs(current.lat - next.lat) > CAMERA_SYNC_EPSILON || Math.abs(current.lng - next.lng) > CAMERA_SYNC_EPSILON;
}

function getFeatureCoordinates(feature: mapboxgl.MapboxGeoJSONFeature | undefined): [number, number] | null {
  if (!feature || feature.geometry.type !== "Point") return null;
  const [lng, lat] = feature.geometry.coordinates;
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  return [lng, lat];
}

export default function IncidentMap({
  reports,
  selectedReportId,
  center,
  userLocation,
  isActive = true,
  searchTarget = null,
  onSelectReport,
  onViewportChange
}: IncidentMapProps) {
  const centerLat = center.lat;
  const centerLng = center.lng;
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const moveEndDebounceRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const isMapLoadedRef = useRef(false);
  const pendingSearchTargetRef = useRef<SearchTarget | null>(null);
  const lastAppliedSearchTargetIdRef = useRef<string | null>(null);
  const geoJsonRef = useRef<GeoJSON.FeatureCollection<GeoJSON.Point, GeoJSON.GeoJsonProperties>>({
    type: "FeatureCollection",
    features: []
  });
  const onSelectReportRef = useRef(onSelectReport);
  const onViewportChangeRef = useRef(onViewportChange);
  const initialCenterRef = useRef(center);
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

  const warnInvalidPoint = useCallback((reason: string, point: unknown) => {
    if (process.env.NODE_ENV !== "development") return;
    console.warn(`[IncidentMap] ${reason}`, point);
  }, []);

  const flyToLocation = useCallback((point: { lng: number; lat: number }, zoom?: number) => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;
    if (!isValidPoint(point)) {
      warnInvalidPoint("Skipping flyTo due to invalid coordinates", point);
      return;
    }

    map.flyTo({
      center: [point.lng, point.lat],
      zoom: zoom ?? Math.max(13, map.getZoom()),
      duration: shouldReduceMotion() ? 0 : 700,
      essential: true
    });
  }, [warnInvalidPoint]);

  const updateSearchPin = useCallback((target: SearchTarget | null) => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;
    const source = map.getSource(SEARCH_PIN_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(buildSearchPinGeoJson(target));
  }, []);

  useEffect(() => {
    onSelectReportRef.current = onSelectReport;
  }, [onSelectReport]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    geoJsonRef.current = geoJson;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(geoJson);
  }, [geoJson]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !token) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [initialCenterRef.current.lng, initialCenterRef.current.lat],
      zoom: 12,
      attributionControl: true
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

    const emitViewport = () => {
      const nextCenter = map.getCenter();
      const nextBounds = map.getBounds();
      if (!nextBounds) return;
      onViewportChangeRef.current({
        center: { lat: nextCenter.lat, lng: normalizeLongitude(nextCenter.lng) },
        bounds: {
          north: nextBounds.getNorth(),
          south: nextBounds.getSouth(),
          east: normalizeLongitude(nextBounds.getEast()),
          west: normalizeLongitude(nextBounds.getWest())
        }
      });
    };

    const scheduleViewportSync = () => {
      if (moveEndDebounceRef.current) window.clearTimeout(moveEndDebounceRef.current);
      moveEndDebounceRef.current = window.setTimeout(() => {
        emitViewport();
      }, VIEWPORT_DEBOUNCE_MS);
    };

    const handleMapLoad = () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: geoJsonRef.current,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 52
      });

      map.addLayer({
        id: LAYER_CLUSTERS,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "rgba(34,211,238,0.45)",
            14,
            "rgba(34,211,238,0.65)",
            36,
            "rgba(217,70,239,0.7)"
          ],
          "circle-radius": ["step", ["get", "point_count"], 18, 15, 23, 40, 29],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(230,246,255,0.85)"
        }
      });

      map.addSource(SEARCH_PIN_SOURCE_ID, {
        type: "geojson",
        data: buildSearchPinGeoJson(null)
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
            "#2dd4bf",
            "disputed",
            "#fb7185",
            "resolved",
            "#38bdf8",
            "expired",
            "#94a3b8",
            "#f59e0b"
          ],
          "circle-radius": 8.5,
          "circle-stroke-width": 1.8,
          "circle-stroke-color": "#ecfeff"
        }
      });

      map.addLayer({
        id: SEARCH_PIN_LAYER_ID,
        type: "circle",
        source: SEARCH_PIN_SOURCE_ID,
        paint: {
          "circle-color": "#d946ef",
          "circle-radius": 9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fdf4ff"
        }
      });

      map.on("mouseenter", LAYER_CLUSTERS, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", LAYER_CLUSTERS, () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", LAYER_POINTS, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", LAYER_POINTS, () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", LAYER_CLUSTERS, (event) => {
        const features = map.queryRenderedFeatures(event.point, { layers: [LAYER_CLUSTERS] });
        const feature = features[0];
        const clusterId = Number(feature?.properties?.cluster_id);
        const coords = getFeatureCoordinates(feature);
        if (!Number.isFinite(clusterId) || !coords) return;

        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error || typeof zoom !== "number") return;
          map.easeTo({ center: [coords[0], coords[1]], zoom, duration: shouldReduceMotion() ? 0 : 200 });
        });
      });

      map.on("click", LAYER_POINTS, (event) => {
        const feature = event.features?.[0];
        const coords = getFeatureCoordinates(feature);
        if (!feature?.properties?.id || !coords) return;

        const id = String(feature.properties.id);
        onSelectReportRef.current(id);

        const title = String(feature.properties.title ?? "Report");
        const status = String(feature.properties.status ?? "unverified");
        const popupNode = document.createElement("div");
        popupNode.style.padding = "10px 12px";
        popupNode.style.minWidth = "180px";
        popupNode.style.display = "grid";
        popupNode.style.gap = "4px";
        const titleNode = document.createElement("strong");
        titleNode.textContent = title;
        const statusNode = document.createElement("div");
        statusNode.style.fontSize = "12px";
        statusNode.style.textTransform = "capitalize";
        statusNode.style.color = "rgba(154,164,189,0.95)";
        statusNode.textContent = status;
        popupNode.append(titleNode, statusNode);

        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: false, offset: 12 })
          .setLngLat(coords)
          .setDOMContent(popupNode)
          .addTo(map);
      });

      isMapLoadedRef.current = true;
      if (pendingSearchTargetRef.current) {
        const pendingTarget = pendingSearchTargetRef.current;
        pendingSearchTargetRef.current = null;
        updateSearchPin(pendingTarget);
        flyToLocation(pendingTarget);
        lastAppliedSearchTargetIdRef.current = pendingTarget.id;
      }

      emitViewport();
      map.resize();
    };

    const handleResize = () => {
      if (resizeRafRef.current !== null) window.cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = window.requestAnimationFrame(() => {
        map.resize();
      });
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mapContainerRef.current);

    map.on("load", handleMapLoad);
    map.on("moveend", scheduleViewportSync);

    return () => {
      if (moveEndDebounceRef.current) window.clearTimeout(moveEndDebounceRef.current);
      if (resizeRafRef.current !== null) window.cancelAnimationFrame(resizeRafRef.current);
      resizeObserver.disconnect();
      popupRef.current?.remove();
      userMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      isMapLoadedRef.current = false;
      userMarkerRef.current = null;
      popupRef.current = null;
      pendingSearchTargetRef.current = null;
      lastAppliedSearchTargetIdRef.current = null;
    };
  }, [flyToLocation, token, updateSearchPin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isActive) return;
    const rafId = window.requestAnimationFrame(() => {
      map.resize();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [isActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedReportId) return;

    const selected = reports.find((report) => report.id === selectedReportId);
    if (!selected) return;

    map.easeTo({
      center: [selected.display_lng, selected.display_lat],
      duration: shouldReduceMotion() ? 0 : 220,
      essential: true
    });
  }, [reports, selectedReportId]);

  useEffect(() => {
    if (!searchTarget) {
      lastAppliedSearchTargetIdRef.current = null;
      pendingSearchTargetRef.current = null;
      updateSearchPin(null);
      return;
    }

    if (!isValidPoint(searchTarget)) {
      warnInvalidPoint("Skipping search target because coordinates are invalid", searchTarget);
      return;
    }

    if (lastAppliedSearchTargetIdRef.current === searchTarget.id) return;

    if (!isMapLoadedRef.current) {
      pendingSearchTargetRef.current = searchTarget;
      return;
    }

    updateSearchPin(searchTarget);
    flyToLocation(searchTarget);
    lastAppliedSearchTargetIdRef.current = searchTarget.id;
  }, [flyToLocation, searchTarget, updateSearchPin, warnInvalidPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isFiniteCoordinate(centerLat) || !isFiniteCoordinate(centerLng)) {
      warnInvalidPoint("Skipping center sync because center is invalid", { lat: centerLat, lng: centerLng });
      return;
    }

    const mapCenter = map.getCenter();
    const current = { lat: mapCenter.lat, lng: normalizeLongitude(mapCenter.lng) };
    const next = { lat: centerLat, lng: normalizeLongitude(centerLng) };
    if (!hasMeaningfulCenterDelta(current, next)) return;

    map.easeTo({
      center: [next.lng, next.lat],
      duration: shouldReduceMotion() ? 0 : 260,
      essential: true
    });
  }, [centerLat, centerLng, warnInvalidPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    if (!userMarkerRef.current) {
      userMarkerRef.current = new mapboxgl.Marker({ color: "#22d3ee" }).setLngLat([userLocation.lng, userLocation.lat]).addTo(map);
      return;
    }

    userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
  }, [userLocation]);

  if (!token) {
    return (
      <div className="grid h-[62vh] min-h-[22rem] place-items-center rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.8)] text-sm text-[color:var(--muted)]">
        Missing `NEXT_PUBLIC_MAPBOX_TOKEN`.
      </div>
    );
  }

  return <div ref={mapContainerRef} className="h-[62vh] min-h-[22rem] w-full overflow-hidden rounded-2xl border border-[var(--border)]" />;
}
