import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { getEntry, type CatalogEntry, type UserModelRef } from '../catalog/catalog'
import { getBlob } from '../lib/blobStore'

const cache = new Map<string, Promise<THREE.Object3D>>()

export const MODEL_EXTENSIONS = ['.glb', '.gltf', '.obj', '.fbx']

export function formatFromName(name: string): UserModelRef['format'] | null {
  const ext = name.toLowerCase().split('.').pop()
  return ext === 'glb' || ext === 'gltf' || ext === 'obj' || ext === 'fbx' ? ext : null
}

/** Parse a model file into a three.js object (without any scaling). */
export async function parseModel(blob: Blob, format: UserModelRef['format']): Promise<THREE.Object3D> {
  switch (format) {
    case 'glb':
    case 'gltf': {
      const loader = new GLTFLoader()
      const data = format === 'glb' ? await blob.arrayBuffer() : await blob.text()
      const gltf = await loader.parseAsync(data, '')
      return gltf.scene
    }
    case 'obj': {
      const obj = new OBJLoader().parse(await blob.text())
      // OBJ files without a material library come out flat white; give them a neutral finish.
      obj.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh && (!m.material || (m.material as THREE.Material).type === 'MeshPhongMaterial'))
          m.material = new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.7 })
      })
      return obj
    }
    case 'fbx':
      return new FBXLoader().parse(await blob.arrayBuffer(), '')
  }
}

/** Load (once) and return a fresh, fitted copy of a user's model. */
export function loadUserModel(ref: UserModelRef): Promise<THREE.Object3D> {
  let p = cache.get(ref.key)
  if (!p) {
    p = getBlob(ref.key).then((blob) => {
      if (!blob) throw new Error('Model file not found in this browser')
      return parseModel(blob, ref.format)
    })
    p.catch(() => cache.delete(ref.key))
    cache.set(ref.key, p)
  }
  return p
}

export function forgetUserModel(key: string) {
  cache.delete(key)
}

/**
 * Clone a model, drop embedded lights/hidden nodes, orient it and scale it uniformly so it fits the
 * catalog entry's w×d×h box, standing on the floor and centered on the item position.
 */
export function fitObject(source: THREE.Object3D, entry: CatalogEntry, opts: { hide?: string[]; upAxis?: 'y' | 'z'; rotation?: number } = {}): THREE.Object3D {
  const clone = source.clone(true)
  const remove: THREE.Object3D[] = []
  clone.traverse((o) => {
    if ((o as THREE.Light).isLight || (o as THREE.Camera).isCamera || opts.hide?.includes(o.name)) remove.push(o)
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  for (const o of remove) o.removeFromParent()

  const oriented = new THREE.Group()
  oriented.add(clone)
  if (opts.upAxis === 'z') clone.rotation.x = -Math.PI / 2
  oriented.rotation.y = ((opts.rotation ?? 0) * Math.PI) / 180
  const holder = new THREE.Group()
  holder.add(oriented)
  holder.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(holder)
  const size = box.getSize(new THREE.Vector3())
  // Fit the catalog size without distorting the model, then stretch it if the item was resized.
  const found = getEntry(entry.id)
  const base = found.id === entry.id ? found : entry
  const s = Math.min(base.w / (size.x || 1), base.d / (size.z || 1), base.h / (size.y || 1))
  const k = new THREE.Vector3(s * (entry.w / base.w), s * (entry.h / base.h), s * (entry.d / base.d))
  const center = box.getCenter(new THREE.Vector3())
  holder.scale.copy(k)
  holder.position.set(-center.x * k.x, -box.min.y * k.y, -center.z * k.z)
  const wrapper = new THREE.Group()
  wrapper.add(holder)
  return wrapper
}
