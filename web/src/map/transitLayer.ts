import * as maplibregl from 'maplibre-gl'
import type { CustomLayerInterface, Map as MlMap } from 'maplibre-gl'
import * as THREE from 'three'
import type { Transit } from '../lib/types'

const ORIGIN: [number, number] = [18.0686, 59.3293]

/**
 * three.js-lager i MapLibre: spårlinjerna ritas som svävande, glödande rör med tåg som rör sig
 * längs linjerna och ljuspelare vid stationerna. Bredden hålls konstant i pixlar oavsett zoom
 * genom att hörnen förskjuts längs normalen i vertex-shadern.
 */
export function createTransitLayer(transit: Transit): CustomLayerInterface & { setVisible(v: boolean): void; setHighlight(refs: string[] | null): void } {
  const origin = maplibregl.MercatorCoordinate.fromLngLat(ORIGIN, 0)
  const scale = origin.meterInMercatorCoordinateUnits()
  const mPerDegLat = 110540
  const mPerDegLon = 111320 * Math.cos((ORIGIN[1] * Math.PI) / 180)
  const toLocal = (lon: number, lat: number, z: number) =>
    new THREE.Vector3((lon - ORIGIN[0]) * mPerDegLon, (lat - ORIGIN[1]) * mPerDegLat, z)

  let map: MlMap
  let renderer: THREE.WebGLRenderer
  const scene = new THREE.Scene()
  const camera = new THREE.Camera()
  const widthUniform = { value: 30.0 } // meter per pixel * önskad bredd, sätts varje frame
  const timeUniform = { value: 0 }
  const trains: { mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; speed: number; offset: number }[] = []
  const lineGroups = new Map<string, THREE.Object3D[]>()
  let visible = true

  function widthMaterial(color: THREE.ColorRepresentation, opacity: number, px: number, additive = false) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false, // ritas alltid ovanpå 3D-områdena
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWidth = widthUniform
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWidth;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * uWidth * ${px.toFixed(2)};`)
    }
    return mat
  }

  function build() {
    const { hubs, lines } = transit
    // Höjd per trafikslag så att parallella linjer inte krockar visuellt
    const height: Record<string, number> = { subway: 70, commuter: 110, regional: 140, light_rail: 50, local_train: 60, tram: 40 }
    const seen = new Set<string>()
    for (const line of lines) {
      // Linjer som delar sträckning (t.ex. 17/18/19) ritas bara en gång per färg och sträcka
      const key = `${line.color}:${line.hubs.join(',')}`
      if (seen.has(key)) continue
      seen.add(key)
      const z = height[line.mode] ?? 60
      const pts = line.hubs.map((h) => toLocal(hubs[h].lon, hubs[h].lat, z))
      if (pts.length < 2) continue
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5)
      const seg = Math.min(1200, pts.length * 24)
      const core = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, 0.5, 6, false), widthMaterial(line.color, 0.95, 1.6))
      const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, 0.5, 6, false), widthMaterial(line.color, 0.18, 5.5, true))
      core.renderOrder = 2
      glow.renderOrder = 1
      scene.add(glow, core)
      const objs = lineGroups.get(line.ref) ?? []
      objs.push(core, glow)
      lineGroups.set(line.ref, objs)
      // Tåg: små ljuspunkter som rör sig längs linjen
      const n = Math.max(2, Math.round(curve.getLength() / 6000))
      for (let i = 0; i < n; i++) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), widthMaterial('#ffffff', 0.95, 3.2))
        mesh.renderOrder = 3
        scene.add(mesh)
        trains.push({ mesh, curve, speed: (line.mode === 'commuter' || line.mode === 'regional' ? 0.012 : 0.02) * (6000 / Math.max(curve.getLength(), 6000)) * 3, offset: i / n })
        objs.push(mesh)
      }
    }
    // Ljuspelare vid stationer
    const pillarMat = widthMaterial('#cfe8ff', 0.55, 1.4, true)
    const hubGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true)
    hubGeom.rotateX(Math.PI / 2)
    for (const h of hubs) {
      const hgt = h.lines.length > 2 ? 260 : 140
      const m = new THREE.Mesh(hubGeom, pillarMat)
      m.scale.set(1, 1, hgt)
      m.position.copy(toLocal(h.lon, h.lat, hgt / 2))
      scene.add(m)
    }
  }

  return {
    id: 'transit-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
      build()
    },
    render(_gl, args) {
      if (!visible) return
      // meter per pixel vid kartans centrum
      const mpp = (40075016.686 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / (512 * Math.pow(2, map.getZoom()))
      widthUniform.value = mpp
      timeUniform.value = performance.now() / 1000
      for (const t of trains) {
        const u = (timeUniform.value * t.speed + t.offset) % 1
        // pendla fram och tillbaka
        const p = u < 0.5 ? u * 2 : 2 - u * 2
        t.mesh.position.copy(t.curve.getPointAt(p))
      }
      const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[])
      const l = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z)
        .scale(new THREE.Vector3(scale, -scale, scale))
      camera.projectionMatrix = m.multiply(l)
      renderer.resetState()
      renderer.render(scene, camera)
      map.triggerRepaint()
    },
    setVisible(v: boolean) {
      visible = v
      map?.triggerRepaint()
    },
    setHighlight(refs: string[] | null) {
      for (const [ref, objs] of lineGroups) {
        const on = !refs || refs.includes(ref)
        for (const o of objs) o.visible = on
      }
      map?.triggerRepaint()
    },
  }
}
