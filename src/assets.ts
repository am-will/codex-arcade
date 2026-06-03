import * as THREE from 'three'

function makeCanvas(size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return canvas
}

export function createBallTexture(): THREE.CanvasTexture {
  const canvas = makeCanvas(512)
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(180, 150, 20, 260, 260, 310)
  gradient.addColorStop(0, '#ffd48a')
  gradient.addColorStop(0.34, '#ff7a24')
  gradient.addColorStop(1, '#54170a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(28, 11, 7, 0.92)'
  ctx.lineWidth = 18
  ctx.beginPath()
  ctx.arc(256, 256, 205, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(256, 0)
  ctx.bezierCurveTo(178, 128, 178, 384, 256, 512)
  ctx.moveTo(256, 0)
  ctx.bezierCurveTo(334, 128, 334, 384, 256, 512)
  ctx.moveTo(0, 256)
  ctx.bezierCurveTo(128, 178, 384, 178, 512, 256)
  ctx.moveTo(0, 256)
  ctx.bezierCurveTo(128, 334, 384, 334, 512, 256)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255, 233, 186, 0.38)'
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.arc(180, 150, 64, 0.1, 2.1)
  ctx.stroke()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createFlameTexture(): THREE.CanvasTexture {
  const canvas = makeCanvas(256)
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(128, 160, 10, 128, 128, 120)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.2, 'rgba(255, 230, 100, 0.95)')
  gradient.addColorStop(0.45, 'rgba(255, 82, 28, 0.72)')
  gradient.addColorStop(0.78, 'rgba(255, 20, 112, 0.28)')
  gradient.addColorStop(1, 'rgba(0, 240, 255, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.globalCompositeOperation = 'lighter'
  const plume = ctx.createLinearGradient(128, 28, 128, 210)
  plume.addColorStop(0, 'rgba(0, 240, 255, 0)')
  plume.addColorStop(0.35, 'rgba(255, 255, 255, 0.72)')
  plume.addColorStop(0.68, 'rgba(255, 90, 20, 0.45)')
  plume.addColorStop(1, 'rgba(255, 20, 112, 0)')
  ctx.fillStyle = plume
  ctx.beginPath()
  ctx.moveTo(128, 16)
  ctx.bezierCurveTo(170, 72, 178, 110, 145, 146)
  ctx.bezierCurveTo(190, 142, 202, 202, 128, 230)
  ctx.bezierCurveTo(56, 198, 66, 138, 104, 146)
  ctx.bezierCurveTo(74, 104, 92, 62, 128, 16)
  ctx.fill()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createGlowTexture(color = '#00f0ff'): THREE.CanvasTexture {
  const canvas = makeCanvas(256)
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 126)
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.2, color)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
