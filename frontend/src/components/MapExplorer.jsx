import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import { extractGeodata, createSearchArea } from '../services/api';

const DISTRICT_PRESETS = [
  {
    id: 'vancouver_mount_pleasant',
    name: 'Mount Pleasant / Mural District, Vancouver BC',
    center: [-123.1020, 49.2635],
    zoom: 15.5,
    delta: 0.0038,
  },
  {
    id: 'vancouver_gastown',
    name: 'Gastown & Railtown, Vancouver BC',
    center: [-123.1070, 49.2830],
    zoom: 15.5,
    delta: 0.0035,
  },
  {
    id: 'vancouver_granville',
    name: 'Granville Island / False Creek, Vancouver BC',
    center: [-123.1340, 49.2710],
    zoom: 15.5,
    delta: 0.0035,
  },
  {
    id: 'wynwood',
    name: 'Wynwood Art District, Miami FL',
    center: [-80.1993, 25.8015],
    zoom: 15,
    delta: 0.0035,
  },
  {
    id: 'bushwick',
    name: 'Bushwick Collective, Brooklyn NY',
    center: [-73.9240, 40.7065],
    zoom: 15,
    delta: 0.0035,
  },
  {
    id: 'mission',
    name: 'Mission District, San Francisco CA',
    center: [-122.4185, 37.7590],
    zoom: 15,
    delta: 0.0035,
  },
  {
    id: 'shoreditch',
    name: 'Shoreditch Arts, London UK',
    center: [-0.0780, 51.5260],
    zoom: 15,
    delta: 0.0035,
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

  const handleLocationSearch = async (e) => {
    if (e) e.preventDefault();
    if (!customSearchQuery.trim()) return;
    setIsSearchingLocation(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(customSearchQuery)}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        const newPreset = {
          id: `custom_${Date.now()}`,
          name: data[0].display_name.split(',').slice(0, 3).join(','),
          center: [lon, lat],
          zoom: 15.5,
          delta: 0.0040,
        };
        setSelectedPreset(newPreset);
        handlePresetChange(newPreset);
      } else {
        alert('Location not found. Try searching for "Vancouver, Canada" or "Mount Pleasant, Vancouver"');
      }
    } catch (err) {
      console.error('Geocoder error:', err);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  // Generate GeoJSON polygon for current preset center & delta
  const getActivePolygonGeoJSON = (preset = selectedPreset) => {
    const [lon, lat] = preset.center;
    const d = preset.delta;
    return {
      type: 'Polygon',
      coordinates: [
        [
          [lon - d, lat - d],
          [lon + d, lat - d],
          [lon + d, lat + d],
          [lon - d, lat + d],
          [lon - d, lat - d],
        ],
      ],
    };
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

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: selectedPreset.center,
      zoom: selectedPreset.zoom,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      // Add Search Polygon source and layers
      map.addSource('search-polygon-source', {
        type: 'geojson',
        data: getActivePolygonGeoJSON(selectedPreset),
      });

      map.addLayer({
        id: 'search-polygon-fill',
        type: 'fill',
        source: 'search-polygon-source',
        paint: {
          'fill-color': '#06b6d4',
          'fill-opacity': 0.12,
        },
      });

      map.addLayer({
        id: 'search-polygon-outline',
        type: 'line',
        source: 'search-polygon-source',
        paint: {
          'line-color': '#06b6d4',
          'line-width': 2.5,
          'line-dasharray': [2, 2],
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
    });

    return () => {
      map.remove();
    };
  }, [theme]);

  // Handle Preset District Change
  const handlePresetChange = (preset) => {
    setSelectedPreset(preset);
    setExtractedData(null);
    setSaveSuccess(false);

    if (mapRef.current) {
      mapRef.current.flyTo({ center: preset.center, zoom: preset.zoom, speed: 1.4 });
      const src = mapRef.current.getSource('search-polygon-source');
      if (src) {
        src.setData(getActivePolygonGeoJSON(preset));
      }
      // Reset layers
      const roadsSrc = mapRef.current.getSource('roads-source');
      if (roadsSrc) roadsSrc.setData({ type: 'FeatureCollection', features: [] });
      const bldgSrc = mapRef.current.getSource('buildings-source');
      if (bldgSrc) bldgSrc.setData({ type: 'FeatureCollection', features: [] });
      const ptsSrc = mapRef.current.getSource('sample-points-source');
      if (ptsSrc) ptsSrc.setData({ type: 'FeatureCollection', features: [] });
    }
  };

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

  // Execute Geographic Extraction
  const handleExtractGeodata = async () => {
    setIsExtracting(true);
    setSaveSuccess(false);

    const polyGeoJSON = getActivePolygonGeoJSON(selectedPreset);
    try {
      const data = await extractGeodata({
        polygon_geojson: polyGeoJSON,
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
    if (!extractedData) return;
    setIsSaving(true);
    try {
      await createSearchArea({
        name: selectedPreset.name,
        polygon_geojson: getActivePolygonGeoJSON(selectedPreset),
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
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.12)', color: '#06b6d4' }}>
              <MapIcon size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Phase 2: Geographic Search & Wall Sampling
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                OpenStreetMap road network extraction, line interpolation, heading calculation & building proximity filtering
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
            <span style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', fontWeight: 500 }}>or District:</span>
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
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleExtractGeodata}
            disabled={isExtracting}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {isExtracting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Querying OSM...</span>
              </>
            ) : (
              <>
                <Play size={16} />
                <span>Extract Roads & Sample</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Map Container */}
      <div style={{ position: 'relative', width: '100%', height: '480px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)', marginBottom: '18px' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Map Overlay Layer Toggles */}
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          background: 'var(--bg-header, rgba(7, 10, 18, 0.85))',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          fontSize: '0.78rem',
          zIndex: 10,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={13} /> Active Layers
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#818cf8' }}>
            <input type="checkbox" checked={showRoads} onChange={(e) => setShowRoads(e.target.checked)} />
            <span>Road Network</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#f59e0b' }}>
            <input type="checkbox" checked={showBuildings} onChange={(e) => setShowBuildings(e.target.checked)} />
            <span>Building Footprints</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#34d399' }}>
            <input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} />
            <span>Candidate Coordinates</span>
          </label>
        </div>

        {/* Legend in bottom left */}
        <div style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          background: 'var(--bg-header, rgba(7, 10, 18, 0.85))',
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
