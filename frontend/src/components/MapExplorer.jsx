import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Map as MapIcon,
  Layers,
  Compass,
  Sliders,
  Play,
  BookmarkPlus,
  CheckCircle2,
  Loader2,
  Building,
  Navigation,
  Sparkles,
  Search,
  Scan,
  Maximize2,
  Minimize2,
  Crosshair,
} from 'lucide-react';
import { extractGeodata, createSearchArea } from '../services/api';

// Maximum allowable scanning area dimensions to ensure fast Overpass & Mapillary ingestion
const MAX_SCAN_SPAN_LON = 0.018; // ~1.4 km longitude span
const MAX_SCAN_SPAN_LAT = 0.014; // ~1.5 km latitude span

const DISTRICT_PRESETS = [
  {
    id: 'vancouver_mount_pleasant',
    name: 'Mount Pleasant / Mural District, Vancouver BC',
    center: [-123.1020, 49.2635],
    zoom: 15.5,
  },
  {
    id: 'vancouver_gastown',
    name: 'Gastown & Railtown, Vancouver BC',
    center: [-123.1070, 49.2830],
    zoom: 15.5,
  },
  {
    id: 'vancouver_granville',
    name: 'Granville Island / False Creek, Vancouver BC',
    center: [-123.1340, 49.2710],
    zoom: 15.5,
  },
  {
    id: 'wynwood',
    name: 'Wynwood Art District, Miami FL',
    center: [-80.1993, 25.8015],
    zoom: 15.5,
  },
  {
    id: 'bushwick',
    name: 'Bushwick Collective, Brooklyn NY',
    center: [-73.9240, 40.7065],
    zoom: 15.5,
  },
  {
    id: 'mission',
    name: 'Mission District, San Francisco CA',
    center: [-122.4185, 37.7590],
    zoom: 15.5,
  },
  {
    id: 'shoreditch',
    name: 'Shoreditch Arts, London UK',
    center: [-0.0780, 51.5260],
    zoom: 15.5,
  },
];

export default function MapExplorer({ theme, onSearchAreaCreated }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);

  const [selectedPreset, setSelectedPreset] = useState(DISTRICT_PRESETS[0]);
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [stepDistance, setStepDistance] = useState(20);
  const [maxBuildingDist, setMaxBuildingDist] = useState(35);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showRoads, setShowRoads] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showPoints, setShowPoints] = useState(true);

  // Active scanning polygon & viewport state
  const [activePolygon, setActivePolygon] = useState(null);
  const [scanMetrics, setScanMetrics] = useState({
    isClamped: false,
    zoom: '15.5',
    center: [-123.1020, 49.2635],
    areaKm2: '1.20',
    widthMeters: 1350,
    heightMeters: 1100,
  });

  // Calculate scanning polygon from map viewport or clamped maximum box
  const calculateScanPolygon = useCallback((mapInstance) => {
    if (!mapInstance) return null;

    const bounds = mapInstance.getBounds();
    const center = mapInstance.getCenter();
    const zoom = mapInstance.getZoom();

    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();

    const spanLon = Math.abs(east - west);
    const spanLat = Math.abs(north - south);

    let minLon, maxLon, minLat, maxLat;
    let isClamped = false;

    if (spanLon > MAX_SCAN_SPAN_LON || spanLat > MAX_SCAN_SPAN_LAT) {
      // Zoomed out past maximum scanning threshold -> clamp to maximum area centered on viewport
      isClamped = true;
      const halfLon = MAX_SCAN_SPAN_LON / 2.0;
      const halfLat = MAX_SCAN_SPAN_LAT / 2.0;
      minLon = center.lng - halfLon;
      maxLon = center.lng + halfLon;
      minLat = center.lat - halfLat;
      maxLat = center.lat + halfLat;
    } else {
      // Zoomed in -> scan the exact visible map viewport!
      isClamped = false;
      minLon = west;
      maxLon = east;
      minLat = south;
      maxLat = north;
    }

    const polyGeoJSON = {
      type: 'Polygon',
      coordinates: [
        [
          [minLon, minLat],
          [maxLon, minLat],
          [maxLon, maxLat],
          [minLon, maxLat],
          [minLon, minLat],
        ],
      ],
    };

    const latRad = (center.lat * Math.PI) / 180.0;
    const widthM = Math.round(Math.abs(maxLon - minLon) * 111320 * Math.cos(latRad));
    const heightM = Math.round(Math.abs(maxLat - minLat) * 110540);
    const areaKm2 = ((widthM * heightM) / 1_000_000).toFixed(2);

    return {
      polygon: polyGeoJSON,
      metrics: {
        isClamped,
        zoom: zoom.toFixed(1),
        center: [center.lng, center.lat],
        areaKm2,
        widthMeters: widthM,
        heightMeters: heightM,
      },
    };
  }, []);

  // Update map source & state on map move/zoom
  const updateScanArea = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const res = calculateScanPolygon(map);
    if (!res) return;

    setActivePolygon(res.polygon);
    setScanMetrics(res.metrics);

    const src = map.getSource('search-polygon-source');
    if (src) {
      src.setData(res.polygon);
    }
  }, [calculateScanPolygon]);

  // Handle Live Geocoding Search
  const handleLocationSearch = async (e) => {
    if (e) e.preventDefault();
    if (!customSearchQuery.trim()) return;
    setIsSearchingLocation(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          customSearchQuery
        )}&limit=1`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        const newPreset = {
          id: `custom_${Date.now()}`,
          name: data[0].display_name.split(',').slice(0, 3).join(','),
          center: [lon, lat],
          zoom: 15.5,
        };
        setSelectedPreset(newPreset);
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [lon, lat], zoom: 15.5, speed: 1.4 });
        }
      } else {
        alert('Location not found. Try searching for a specific city or neighborhood (e.g. "Vancouver, Canada" or "Wynwood, Miami")');
      }
    } catch (err) {
      console.error('Geocoder error:', err);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  // Handle Preset Selection
  const handlePresetChange = (preset) => {
    setSelectedPreset(preset);
    setExtractedData(null);
    setSaveSuccess(false);

    if (mapRef.current) {
      mapRef.current.flyTo({ center: preset.center, zoom: preset.zoom, speed: 1.4 });
    }
  };

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const isLight = theme === 'light';
    const tileUrl = isLight
      ? 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png'
      : 'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png';

    const mapStyle = {
      version: 8,
      sources: {
        'base-tiles': {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
        },
      },
      layers: [
        {
          id: 'base-tiles-layer',
          type: 'raster',
          source: 'base-tiles',
          minzoom: 0,
          maxzoom: 20,
          paint: {
            'raster-opacity': 1.0,
          },
        },
      ],
    };

    const initialCenter = selectedPreset.center;
    const initialZoom = selectedPreset.zoom;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      const initialScan = calculateScanPolygon(map);
      const polyData = initialScan ? initialScan.polygon : { type: 'Polygon', coordinates: [] };

      if (initialScan) {
        setActivePolygon(initialScan.polygon);
        setScanMetrics(initialScan.metrics);
      }

      // Add Search Polygon source and layers (~30% opacity blue rectangle)
      map.addSource('search-polygon-source', {
        type: 'geojson',
        data: polyData,
      });

      map.addLayer({
        id: 'search-polygon-fill',
        type: 'fill',
        source: 'search-polygon-source',
        paint: {
          'fill-color': '#2563eb',
          'fill-opacity': 0.30, // ~30% opacity blue rectangle as specified
        },
      });

      map.addLayer({
        id: 'search-polygon-outline',
        type: 'line',
        source: 'search-polygon-source',
        paint: {
          'line-color': '#60a5fa',
          'line-width': 2.5,
          'line-dasharray': [4, 2],
        },
      });

      // Add Roads source & layer
      map.addSource('roads-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'roads-layer',
        type: 'line',
        source: 'roads-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#818cf8',
          'line-width': 3.5,
          'line-opacity': 0.85,
        },
      });

      // Add Buildings source & layers
      map.addSource('buildings-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'buildings-fill-layer',
        type: 'fill',
        source: 'buildings-source',
        paint: {
          'fill-color': '#f59e0b',
          'fill-opacity': 0.25,
        },
      });

      map.addLayer({
        id: 'buildings-line-layer',
        type: 'line',
        source: 'buildings-source',
        paint: {
          'line-color': '#f59e0b',
          'line-width': 1.5,
        },
      });

      // Add Sample Points source & layer
      map.addSource('sample-points-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'sample-points-layer',
        type: 'circle',
        source: 'sample-points-source',
        paint: {
          'circle-radius': 5,
          'circle-color': [
            'case',
            ['<', ['get', 'distance_to_nearest_building_meters'], 15], '#10b981',
            ['<', ['get', 'distance_to_nearest_building_meters'], 30], '#06b6d4',
            '#f59e0b',
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });

      // Interactive Popup on clicking sample point
      map.on('click', 'sample-points-layer', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = feat.properties;
        const coords = feat.geometry.coordinates.slice();

        const html = `
          <div style="font-family: 'Outfit', sans-serif; font-size: 0.82rem; color: #0f172a; padding: 4px;">
            <div style="font-weight: 700; color: #6366f1; margin-bottom: 4px;">📍 Candidate Coordinate</div>
            <div><strong>Road:</strong> ${props.road_name || 'Unnamed Road'}</div>
            <div><strong>Bearing / Heading:</strong> ${props.heading_along_road}°</div>
            <div><strong>Wall Proximity:</strong> ${props.distance_to_nearest_building_meters !== undefined ? props.distance_to_nearest_building_meters + 'm' : 'N/A'}</div>
            <div style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">Lat: ${coords[1].toFixed(5)}, Lon: ${coords[0].toFixed(5)}</div>
          </div>
        `;

        if (popupRef.current) popupRef.current.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
          .setLngLat(coords)
          .setHTML(html)
          .addTo(map);
      });

      map.on('mouseenter', 'sample-points-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'sample-points-layer', () => {
        map.getCanvas().style.cursor = '';
      });

      // Sync scan area on map pan / zoom / drag in real-time!
      map.on('move', updateScanArea);
      map.on('zoom', updateScanArea);
      map.on('resize', updateScanArea);
    });

    return () => {
      map.remove();
    };
  }, [theme, calculateScanPolygon, updateScanArea]);

  // Toggle Layer Visibility
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;
    if (mapRef.current.getLayer('roads-layer')) {
      mapRef.current.setLayoutProperty('roads-layer', 'visibility', showRoads ? 'visible' : 'none');
    }
    if (mapRef.current.getLayer('buildings-fill-layer')) {
      mapRef.current.setLayoutProperty('buildings-fill-layer', 'visibility', showBuildings ? 'visible' : 'none');
      mapRef.current.setLayoutProperty('buildings-line-layer', 'visibility', showBuildings ? 'visible' : 'none');
    }
    if (mapRef.current.getLayer('sample-points-layer')) {
      mapRef.current.setLayoutProperty('sample-points-layer', 'visibility', showPoints ? 'visible' : 'none');
    }
  }, [showRoads, showBuildings, showPoints]);

  // Execute Geographic Extraction on the EXACT polygon currently covered by the blue rectangle
  const handleExtractGeodata = async () => {
    if (!activePolygon) return;
    setIsExtracting(true);
    setSaveSuccess(false);

    try {
      const data = await extractGeodata({
        polygon_geojson: activePolygon,
        step_distance_meters: Number(stepDistance),
        max_building_distance_meters: Number(maxBuildingDist),
        provider: 'osm',
      });

      setExtractedData(data);

      if (mapRef.current) {
        // Update Roads Layer
        if (data.roads_geojson) {
          const rSrc = mapRef.current.getSource('roads-source');
          if (rSrc) rSrc.setData(data.roads_geojson);
        }
        // Update Buildings Layer
        if (data.buildings_geojson) {
          const bSrc = mapRef.current.getSource('buildings-source');
          if (bSrc) bSrc.setData(data.buildings_geojson);
        }
        // Update Sample Points Layer
        const pointsFeatures = (data.sample_points || []).map((pt) => ({
          type: 'Feature',
          properties: {
            id: pt.id,
            road_name: pt.road_name,
            heading_along_road: pt.heading_along_road,
            distance_to_nearest_building_meters: pt.distance_to_nearest_building_meters,
          },
          geometry: {
            type: 'Point',
            coordinates: [pt.longitude, pt.latitude],
          },
        }));

        const pSrc = mapRef.current.getSource('sample-points-source');
        if (pSrc) {
          pSrc.setData({ type: 'FeatureCollection', features: pointsFeatures });
        }
      }
    } catch (e) {
      console.error('Failed to extract geodata:', e);
      alert(`Geodata Extraction Notice: ${e.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // Save Search Area to SQLite DB
  const handleSaveSearchArea = async () => {
    if (!extractedData || !activePolygon) return;
    setIsSaving(true);
    try {
      const areaName = customSearchQuery.trim()
        ? customSearchQuery
        : selectedPreset?.name
        ? `${selectedPreset.name} (Scan ${scanMetrics.areaKm2}km²)`
        : `Target Area (${scanMetrics.center[1].toFixed(4)}, ${scanMetrics.center[0].toFixed(4)})`;

      await createSearchArea({
        name: areaName,
        polygon_geojson: activePolygon,
        total_roads: extractedData.total_roads,
        total_buildings: extractedData.total_buildings,
        sample_points_count: extractedData.total_sample_points,
      });
      setSaveSuccess(true);
      if (onSearchAreaCreated) onSearchAreaCreated();
    } catch (e) {
      console.error('Failed to save search area:', e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header & Preset Selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
              <Scan size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 2: Geographic Search & Wall Sampling
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Pan & zoom to dynamically frame your target scanning area. Extracts real OpenStreetMap road networks and building footprints.
              </p>
            </div>
          </div>
        </div>

        {/* Location Search & Preset Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          
          {/* Live Address / City Search Form */}
          <form onSubmit={handleLocationSearch} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search any city or address (e.g. Vancouver)..."
                value={customSearchQuery}
                onChange={(e) => setCustomSearchQuery(e.target.value)}
                style={{
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 12px 8px 32px',
                  fontFamily: 'var(--font-main)',
                  fontSize: '0.82rem',
                  width: '260px',
                  outline: 'none',
                }}
              />
              <Search size={15} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
            </div>
            <button
              type="submit"
              disabled={isSearchingLocation}
              className="btn-secondary"
              style={{ padding: '8px 12px', fontSize: '0.80rem', fontWeight: 600 }}
            >
              {isSearchingLocation ? <Loader2 size={14} className="spin" /> : 'Fly to City'}
            </button>
          </form>

          {/* Preset Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', fontWeight: 500 }}>or Preset:</span>
            <select
              value={selectedPreset.id}
              onChange={(e) => {
                const p = DISTRICT_PRESETS.find((d) => d.id === e.target.value);
                if (p) handlePresetChange(p);
              }}
              style={{
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 10px',
                fontFamily: 'var(--font-main)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '240px',
              }}
            >
              {DISTRICT_PRESETS.map((p) => (
                <option key={p.id} value={p.id} style={{ background: '#0f172a', color: '#f8fafc' }}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Control Panel: Sliders & Action Buttons */}
      <div style={{
        background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        marginBottom: '18px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
        alignItems: 'center',
      }}>
        
        {/* Step Distance Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Sliders size={13} /> Sampling Interval:
            </span>
            <strong style={{ color: '#38bdf8' }}>{stepDistance} meters</strong>
          </div>
          <input
            type="range"
            min="10"
            max="50"
            step="5"
            value={stepDistance}
            onChange={(e) => setStepDistance(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#06b6d4', cursor: 'pointer' }}
          />
        </div>

        {/* Max Building Distance Slider */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Building size={13} /> Max Building Distance:
            </span>
            <strong style={{ color: '#f59e0b' }}>{maxBuildingDist} meters</strong>
          </div>
          <input
            type="range"
            min="15"
            max="60"
            step="5"
            value={maxBuildingDist}
            onChange={(e) => setMaxBuildingDist(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
          />
        </div>

        {/* Extraction Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            onClick={handleExtractGeodata}
            disabled={isExtracting || !activePolygon}
            className="btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
            }}
          >
            {isExtracting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Querying OpenStreetMap...</span>
              </>
            ) : (
              <>
                <Scan size={16} />
                <span>Extract Roads & Sample ({scanMetrics.areaKm2} km²)</span>
              </>
            )}
          </button>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Scans exact area inside the blue overlay rectangle
          </span>
        </div>

      </div>

      {/* Map Container with Real-Time Viewport & Clamped Scanner */}
      <div style={{ position: 'relative', width: '100%', height: '520px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)', marginBottom: '18px' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Top-Left Live Scanning Area HUD */}
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          background: 'rgba(15, 23, 42, 0.90)',
          backdropFilter: 'blur(14px)',
          border: scanMetrics.isClamped ? '1px solid rgba(59, 130, 246, 0.6)' : '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '10px',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontSize: '0.78rem',
          zIndex: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          maxWidth: '360px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: scanMetrics.isClamped ? '#60a5fa' : '#34d399' }}>
              <Crosshair size={15} />
              <span>{scanMetrics.isClamped ? 'Max Scan Area (Clamped)' : 'Active Viewport Scan'}</span>
            </div>
            <span style={{
              fontSize: '0.70rem',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              background: scanMetrics.isClamped ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              color: scanMetrics.isClamped ? '#93c5fd' : '#6ee7b7',
            }}>
              Zoom {scanMetrics.zoom}
            </span>
          </div>

          <div style={{ fontSize: '0.76rem', color: '#cbd5e1' }}>
            <strong>Coverage:</strong> {scanMetrics.widthMeters.toLocaleString()}m × {scanMetrics.heightMeters.toLocaleString()}m &bull; <strong style={{ color: '#38bdf8' }}>{scanMetrics.areaKm2} km²</strong>
          </div>

          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            <strong>Center:</strong> {scanMetrics.center[1].toFixed(4)}°N, {scanMetrics.center[0].toFixed(4)}°W
          </div>

          <div style={{ fontSize: '0.70rem', color: scanMetrics.isClamped ? '#93c5fd' : '#a7f3d0', marginTop: '2px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px' }}>
            {scanMetrics.isClamped
              ? '🟦 Drag the map to position the blue scanning box over your target district.'
              : '🎯 Scanning entire visible screen area. Zoom out to scan a larger neighborhood.'}
          </div>
        </div>

        {/* Map Overlay Layer Toggles */}
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '54px', // Right before MapLibre navigation buttons
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          padding: '8px 12px',
          display: 'flex',
          gap: '12px',
          fontSize: '0.76rem',
          zIndex: 10,
          alignItems: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#818cf8', fontWeight: 600 }}>
            <input type="checkbox" checked={showRoads} onChange={(e) => setShowRoads(e.target.checked)} />
            <span>Roads</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#f59e0b', fontWeight: 600 }}>
            <input type="checkbox" checked={showBuildings} onChange={(e) => setShowBuildings(e.target.checked)} />
            <span>Buildings</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#34d399', fontWeight: 600 }}>
            <input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} />
            <span>Candidate Pins</span>
          </label>
        </div>

        {/* Legend in bottom left */}
        <div style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          background: 'rgba(15, 23, 42, 0.90)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          fontSize: '0.74rem',
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '8px', background: 'rgba(59, 130, 246, 0.3)', border: '1px solid #60a5fa', borderRadius: '2px' }} />
            <span style={{ color: '#93c5fd' }}>Scan Target Overlay</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
            <span>Wall &lt;15m</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#06b6d4' }} />
            <span>Wall &lt;30m</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
            <span>Wall &gt;30m</span>
          </div>
        </div>
      </div>

      {/* Extraction Metrics & Persistence Card */}
      {extractedData && (
        <div style={{
          background: 'var(--bg-subtle, rgba(255, 255, 255, 0.02))',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>ROAD SEGMENTS</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#818cf8' }}>{extractedData.total_roads}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>BUILDINGS DETECTED</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>{extractedData.total_buildings}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>CANDIDATE COORDINATES</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34d399' }}>{extractedData.total_sample_points}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>EXTRACTION TIME</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{extractedData.duration_seconds}s</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleSaveSearchArea}
              disabled={isSaving || saveSuccess}
              className="btn-secondary"
              style={{
                borderColor: saveSuccess ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)',
                color: saveSuccess ? '#34d399' : 'var(--text-primary)',
              }}
            >
              {saveSuccess ? (
                <>
                  <CheckCircle2 size={16} color="#34d399" />
                  <span>Saved to Database</span>
                </>
              ) : isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <BookmarkPlus size={16} />
                  <span>Save Search Area</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
