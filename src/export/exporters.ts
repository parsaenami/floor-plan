import { jsPDF } from 'jspdf'
import 'svg2pdf.js'
import type { Plan } from '../model/types'
import type { Room } from '../geometry/rooms'
import { downloadBlob } from '../persistence/importExport'
import type { DefMap } from '../render/planGeometry'
import { toDXF } from './dxf'

export function svgBlob(svg: string): Blob {
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' })
}

export async function exportSvg(svg: string, filename: string) {
  downloadBlob(svgBlob(svg), filename)
}

/** Rasterises the sheet at the given DPI. */
export async function exportPng(svg: string, widthMm: number, heightMm: number, dpi: number, filename: string) {
  const url = URL.createObjectURL(svgBlob(svg))
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const w = Math.round((widthMm / 25.4) * dpi)
    const h = Math.round((heightMm / 25.4) * dpi)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const c = canvas.getContext('2d')!
    c.fillStyle = '#fff'
    c.fillRect(0, 0, w, h)
    c.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new Error('Could not render the PNG.')
    downloadBlob(blob, filename)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Vector PDF at the real paper size. */
export async function exportPdf(svg: string, widthMm: number, heightMm: number, filename: string) {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden'
  host.innerHTML = svg
  document.body.appendChild(host)
  try {
    const el = host.querySelector('svg')!
    const doc = new jsPDF({ orientation: widthMm > heightMm ? 'landscape' : 'portrait', unit: 'mm', format: [widthMm, heightMm] })
    doc.setFont('courier')
    await doc.svg(el, { x: 0, y: 0, width: widthMm, height: heightMm })
    doc.save(filename)
  } finally {
    host.remove()
  }
}

/** 1:1 model-space drawing in centimetres; ignores the sheet options. */
export async function exportDxf(plan: Plan, defs: DefMap, rooms: Room[], filename: string) {
  downloadBlob(new Blob([toDXF(plan, defs, rooms)], { type: 'application/dxf' }), filename)
}
