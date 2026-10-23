import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import type { DesoProps, FC, Poi, Transit, Workplace } from '../lib/types'
import { createTransitLayer } from './transitLayer'

export interface MapLayersState {
  transit: boolean
  police: boolean
  groceries: boolean
  schools: boolean
  extrude: boolean
}

interface Props {
  deso: FC<DesoProps>
  regso: FC<{ id: string; name: string; kommunName: string }>
  kommuner: FC<{ id: string; name: string }>
  police: FC<{ name: string; cat: string }>
  transit: Transit
  poi: Poi
  colors: Map<string, { color: string; height: number; dim: boolean }>
  selectedId: string | null
  point: [number, number] | null
  workplaces: (Workplace | null)[]
  layers: MapLayersState
  flyTo: { center: [number, number]; zoom: number; key: number } | null
  /** Delade favoriter per person (blå/rosa) och visningshistorik som punkter */
  personFavs: { color: string; ids: string[]; offset: number }[]
  personHistory: { lon: number; lat: number; color: string }[]
  onPick: (lngLat: [number, number], desoId: string | null) => void
  onHover: (info: { x: number; y: number; id: string } | null) => void
}

const STYLE = 'https://tiles.openfreemap.org/styles/dark'
// Workern serveras som orörd statisk fil (Vite skulle annars injicera sin klient i den)
maplibregl.setWorkerUrl(new URL('maplibre-gl-worker.mjs', document.baseURI).href)

export default function MapView(props: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const transitRef = useRef<ReturnType<typeof createTransitLayer> | null>(null)
  const ready = useRef(false)
  const idIndex = useRef(new Map<string, number>())
  const propsRef = useRef(props)
  propsRef.current = props
  const markers = useRef<maplibregl.Marker[]>([])
  const pointMarker = useRef<maplibregl.Marker | null>(null)

  // Skapa kartan en gång
  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current!,
      style: STYLE,
      center: [18.03, 59.33],
      zoom: 9.6,
      pitch: 48,
      bearing: -12,
      maxPitch: 75,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    })
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = map
    map.on("error", (e) => console.error("map error", e.error?.message ?? e))
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'bottom-right')

    map.on('load', () => {
      const p = propsRef.current
      // Dämpa baskartan så att våra data syns tydligt
      for (const layer of map.getStyle().layers ?? []) {
        if (layer.type === 'symbol' && /poi|housenumber/.test(layer.id)) map.setLayoutProperty(layer.id, 'visibility', 'none')
        // Ortnamn från baskartan krockar med våra kommun- och områdesetiketter
        if (layer.type === 'symbol' && /place|label_city|label_town|label_village|label_other/.test(layer.id))
          map.setLayoutProperty(layer.id, 'visibility', 'none')
        if (layer.type === 'line' && /road|highway|bridge|tunnel|rail|transit/.test(layer.id)) {
          map.setPaintProperty(layer.id, 'line-opacity', 0.28)
        }
      }
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id

      const deso = { ...p.deso, features: p.deso.features.map((f, i) => ({ ...f, id: i })) }
      deso.features.forEach((f, i) => idIndex.current.set(f.properties.id, i))
      map.addSource('deso', { type: 'geojson', data: deso as unknown as GeoJSON.FeatureCollection })
      map.addSource('regso', { type: 'geojson', data: p.regso as unknown as GeoJSON.FeatureCollection })
      map.addSource('kommuner', { type: 'geojson', data: p.kommuner as unknown as GeoJSON.FeatureCollection })
      map.addSource('police', { type: 'geojson', data: p.police as unknown as GeoJSON.FeatureCollection })

      map.addLayer(
        {
          id: 'deso-fill',
          type: 'fill-extrusion',
          source: 'deso',
          paint: {
            'fill-extrusion-color': ['coalesce', ['feature-state', 'c'], '#2a3140'],
            'fill-extrusion-height': ['coalesce', ['feature-state', 'h'], 0],
            'fill-extrusion-opacity': 0.78,
            'fill-extrusion-vertical-gradient': true,
          },
        },
        firstSymbol,
      )
      map.addLayer({
        id: 'deso-line',
        type: 'line',
        source: 'deso',
        minzoom: 11,
        paint: { 'line-color': '#0b0f17', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 15, 1.2], 'line-opacity': 0.6 },
      })
      map.addLayer({
        id: 'regso-line',
        type: 'line',
        source: 'regso',
        minzoom: 10,
        paint: { 'line-color': '#e8edf5', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 14, 1.4], 'line-opacity': 0.35 },
      })
      map.addLayer({
        id: 'kommun-line',
        type: 'line',
        source: 'kommuner',
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 13, 2.4], 'line-opacity': 0.7 },
      })
      map.addLayer({
        id: 'police-line',
        type: 'line',
        source: 'police',
        paint: {
          'line-color': ['match', ['get', 'cat'], 'sarskilt', '#ff3b6b', '#ff7a45'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 3],
          'line-dasharray': [2, 1.5],
        },
      })
      // Delade favoriter: en linje per person, förskjutna så att båda syns om ni gillar samma område
      for (const i of [0, 1]) {
        map.addLayer({
          id: `fav-line-${i}`,
          type: 'line',
          source: 'deso',
          paint: { 'line-color': '#ffffff', 'line-width': 3.2, 'line-offset': 0 },
          filter: ['in', ['get', 'id'], ['literal', []]],
        })
      }
      map.addSource('history', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'history-dots',
        type: 'circle',
        source: 'history',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 14, 6],
          'circle-opacity': 0.85,
          'circle-stroke-color': '#0b0f17',
          'circle-stroke-width': 1,
        },
      })
      map.addLayer({
        id: 'selected-line',
        type: 'line',
        source: 'deso',
        paint: { 'line-color': '#ffffff', 'line-width': 3 },
        filter: ['==', ['get', 'id'], ''],
      })
      // Etiketter
      map.addLayer({
        id: 'kommun-label',
        type: 'symbol',
        source: 'kommuner',
        maxzoom: 10.8,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 10.5, 15],
          'text-letter-spacing': 0.04,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#0b0f17', 'text-halo-width': 1.6 },
      })
      map.addLayer({
        id: 'regso-label',
        type: 'symbol',
        source: 'regso',
        minzoom: 11.2,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-max-width': 8 },
        paint: { 'text-color': '#f3f6fb', 'text-halo-color': '#0b0f17', 'text-halo-width': 1.4 },
      })
      map.addLayer({
        id: 'police-label',
        type: 'symbol',
        source: 'police',
        minzoom: 11,
        layout: {
          'text-field': ['concat', ['get', 'name'], '\n', ['match', ['get', 'cat'], 'sarskilt', 'Särskilt utsatt', 'Utsatt']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 11,
        },
        paint: { 'text-color': '#ff9aa9', 'text-halo-color': '#0b0f17', 'text-halo-width': 1.4 },
      })

      // POI
      const poiFC = (rows: { lon: number; lat: number; props: Record<string, unknown> }[]) => ({
        type: 'FeatureCollection',
        features: rows.map((r) => ({ type: 'Feature', properties: r.props, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } })),
      })
      map.addSource('groceries', {
        type: 'geojson',
        data: poiFC(p.poi.groceries.map(([lon, lat, name, sup]) => ({ lon, lat, props: { name, sup } }))) as GeoJSON.FeatureCollection,
      })
      map.addSource('schools', {
        type: 'geojson',
        data: poiFC(p.poi.schools.map((s) => ({ lon: s.lon, lat: s.lat, props: { name: s.name, merit: s.merit ?? -1 } }))) as GeoJSON.FeatureCollection,
      })
      map.addLayer({
        id: 'groceries',
        type: 'circle',
        source: 'groceries',
        minzoom: 12,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, ['case', ['==', ['get', 'sup'], 1], 3, 2], 16, ['case', ['==', ['get', 'sup'], 1], 7, 4]],
          'circle-color': '#5cc8ff',
          'circle-stroke-color': '#0b0f17',
          'circle-stroke-width': 1,
        },
      })
      map.addLayer({
        id: 'groceries-label',
        type: 'symbol',
        source: 'groceries',
        minzoom: 14.5,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-offset': [0, 1.1], 'text-anchor': 'top' },
        paint: { 'text-color': '#9fdcff', 'text-halo-color': '#0b0f17', 'text-halo-width': 1.2 },
      })
      map.addLayer({
        id: 'schools',
        type: 'circle',
        source: 'schools',
        minzoom: 11.5,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11.5, 3, 16, 8],
          'circle-color': ['case', ['<', ['get', 'merit'], 0], '#9aa4b1', ['interpolate', ['linear'], ['get', 'merit'], 200, '#e5484d', 240, '#f2d15c', 280, '#2bb673']],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.2,
        },
      })
      map.addLayer({
        id: 'schools-label',
        type: 'symbol',
        source: 'schools',
        minzoom: 14,
        layout: {
          'text-field': ['case', ['<', ['get', 'merit'], 0], ['get', 'name'], ['concat', ['get', 'name'], ' · ', ['to-string', ['get', 'merit']]]],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
        },
        paint: { 'text-color': '#ffe7b0', 'text-halo-color': '#0b0f17', 'text-halo-width': 1.2 },
      })

      const transitLayer = createTransitLayer(p.transit)
      transitRef.current = transitLayer
      map.addLayer(transitLayer)

      // Stationsnamn
      map.addSource('hubs', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: p.transit.hubs.map((h) => ({
            type: 'Feature',
            properties: { name: h.name, n: h.lines.length },
            geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
          })),
        },
      })
      map.addLayer({
        id: 'hub-label',
        type: 'symbol',
        source: 'hubs',
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 11,
          'text-offset': [0, -1.4],
          'text-anchor': 'bottom',
        },
        paint: { 'text-color': '#cfe8ff', 'text-halo-color': '#0b0f17', 'text-halo-width': 1.5 },
      })

      map.on('click', (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['deso-fill'] })[0]
        propsRef.current.onPick([e.lngLat.lng, e.lngLat.lat], (f?.properties?.id as string) ?? null)
      })
      map.on('mousemove', 'deso-fill', (e) => {
        const f = e.features?.[0]
        map.getCanvas().style.cursor = 'pointer'
        if (f) propsRef.current.onHover({ x: e.point.x, y: e.point.y, id: f.properties.id as string })
      })
      map.on('mouseleave', 'deso-fill', () => {
        map.getCanvas().style.cursor = ''
        propsRef.current.onHover(null)
      })

      ready.current = true
      applyColors()
      applyLayers()
      applySelected()
      applyPeople()
    })
    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyColors() {
    const map = mapRef.current
    if (!map || !ready.current) return
    const extrude = propsRef.current.layers.extrude
    for (const [id, v] of propsRef.current.colors) {
      const idx = idIndex.current.get(id)
      if (idx == null) continue
      map.setFeatureState({ source: 'deso', id: idx }, { c: v.dim ? '#1c2230' : v.color, h: extrude && !v.dim ? v.height : 0 })
    }
  }
  function applyLayers() {
    const map = mapRef.current
    if (!map || !ready.current) return
    const { layers } = propsRef.current
    const vis = (on: boolean) => (on ? 'visible' : 'none')
    map.setLayoutProperty('police-line', 'visibility', vis(layers.police))
    map.setLayoutProperty('police-label', 'visibility', vis(layers.police))
    map.setLayoutProperty('groceries', 'visibility', vis(layers.groceries))
    map.setLayoutProperty('groceries-label', 'visibility', vis(layers.groceries))
    map.setLayoutProperty('schools', 'visibility', vis(layers.schools))
    map.setLayoutProperty('schools-label', 'visibility', vis(layers.schools))
    map.setLayoutProperty('hub-label', 'visibility', vis(layers.transit))
    transitRef.current?.setVisible(layers.transit)
  }
  function applySelected() {
    const map = mapRef.current
    if (!map || !ready.current) return
    map.setFilter('selected-line', ['==', ['get', 'id'], propsRef.current.selectedId ?? ''])
  }

  useEffect(applyColors, [props.colors, props.layers.extrude])
  useEffect(applyLayers, [props.layers])
  useEffect(applySelected, [props.selectedId])

  function applyPeople() {
    const map = mapRef.current
    if (!map || !ready.current) return
    const { personFavs, personHistory } = propsRef.current
    for (const i of [0, 1]) {
      const pf = personFavs[i]
      map.setFilter(`fav-line-${i}`, ['in', ['get', 'id'], ['literal', pf?.ids ?? []]])
      if (pf) {
        map.setPaintProperty(`fav-line-${i}`, 'line-color', pf.color)
        map.setPaintProperty(`fav-line-${i}`, 'line-offset', pf.offset)
      }
    }
    ;(map.getSource('history') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: personHistory.map((h) => ({
        type: 'Feature',
        properties: { color: h.color },
        geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
      })),
    })
  }
  useEffect(applyPeople, [props.personFavs, props.personHistory])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !props.flyTo) return
    map.flyTo({ center: props.flyTo.center, zoom: props.flyTo.zoom, pitch: 55, speed: 1.2, essential: true })
  }, [props.flyTo])

  // Klickad punkt
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    pointMarker.current?.remove()
    if (props.point) {
      const el = document.createElement('div')
      el.className = 'pin-point'
      pointMarker.current = new maplibregl.Marker({ element: el }).setLngLat(props.point).addTo(map)
    }
  }, [props.point])

  // Arbetsplatser
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markers.current.forEach((m) => m.remove())
    markers.current = props.workplaces
      .map((w, i) => {
        if (!w) return null
        const el = document.createElement('div')
        el.className = 'pin-work'
        el.textContent = String(i + 1)
        el.title = w.label
        return new maplibregl.Marker({ element: el }).setLngLat([w.lon, w.lat]).addTo(map)
      })
      .filter((m): m is maplibregl.Marker => m != null)
  }, [props.workplaces])

  return <div ref={ref} className="map" />
}
