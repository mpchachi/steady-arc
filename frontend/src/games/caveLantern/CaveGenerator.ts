import type { CaveMap, Tile } from './types'

/** Simple seeded PRNG (xorshift32) */
function makePRNG(seed: number) {
  let s = seed >>> 0 || 0xdeadbeef
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }
}

/** Cellular automata cave generation */
export function generateCave(
  screenW: number,
  screenH: number,
  seed: number = Date.now(),
  tileSize = 16,
): CaveMap {
  const cols = Math.floor(screenW / tileSize)
  const rows = Math.floor(screenH / tileSize)
  const rand = makePRNG(seed)

  // 1. Random fill (55% rock)
  let grid: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => rand() < 0.45),
  )

  // 2. Cellular automata smoothing (5 iterations)
  for (let iter = 0; iter < 5; iter++) {
    const next: boolean[][] = grid.map((row, r) =>
      row.map((_, c) => {
        let rockCount = 0
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr
            const nc = c + dc
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
              rockCount++ // border counts as rock
            } else if (grid[nr]![nc]) {
              rockCount++
            }
          }
        }
        return rockCount >= 5
      }),
    )
    grid = next
  }

  // 3. Build tile map
  const tiles: Tile[][] = grid.map((row, r) =>
    row.map((isRock, c): Tile => ({
      type: isRock ? 'rock' : 'path',
      x: c,
      y: r,
    })),
  )

  // 4. Place crystals (~3% of path tiles)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r]![c]!.type === 'path' && rand() < 0.03) {
        tiles[r]![c]!.type = 'crystal'
      }
    }
  }

  // 5. Place treasures (~8 evenly spread)
  const targetTreasures = 8
  const pathTiles: Array<{ r: number; c: number }> = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r]![c]!.type === 'path') pathTiles.push({ r, c })
    }
  }

  const treasures: CaveMap['treasures'] = []
  for (let i = 0; i < targetTreasures && pathTiles.length > 0; i++) {
    const idx = Math.floor(rand() * pathTiles.length)
    const { r, c } = pathTiles.splice(idx, 1)[0]!
    tiles[r]![c]!.type = 'treasure'
    treasures.push({ x: c * tileSize + tileSize / 2, y: r * tileSize + tileSize / 2, found: false })
  }

  return { tiles, width: cols, height: rows, tileSize, treasures }
}

/** Render the cave background onto a canvas (offscreen, called once) */
export function renderCaveToCanvas(map: CaveMap, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!
  const { tileSize } = map

  canvas.width = map.width * tileSize
  canvas.height = map.height * tileSize

  for (let r = 0; r < map.height; r++) {
    for (let c = 0; c < map.width; c++) {
      const tile = map.tiles[r]![c]!
      const px = c * tileSize
      const py = r * tileSize

      switch (tile.type) {
        case 'rock':
          // Dark rock gradient noise
          ctx.fillStyle = `hsl(220, 10%, ${10 + Math.random() * 8}%)`
          ctx.fillRect(px, py, tileSize, tileSize)
          // Cracks / texture lines
          if (Math.random() < 0.2) {
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(px + Math.random() * tileSize, py)
            ctx.lineTo(px + Math.random() * tileSize, py + tileSize)
            ctx.stroke()
          }
          break

        case 'path':
          ctx.fillStyle = `hsl(30, 15%, ${20 + Math.random() * 6}%)`
          ctx.fillRect(px, py, tileSize, tileSize)
          break

        case 'crystal':
          ctx.fillStyle = `hsl(30, 15%, ${20 + Math.random() * 6}%)`
          ctx.fillRect(px, py, tileSize, tileSize)
          // Crystal gem
          ctx.fillStyle = `hsla(${180 + Math.random() * 60}, 80%, 60%, 0.85)`
          const cx = px + tileSize / 2
          const cy = py + tileSize / 2
          ctx.beginPath()
          ctx.moveTo(cx, cy - 5)
          ctx.lineTo(cx + 4, cy)
          ctx.lineTo(cx, cy + 5)
          ctx.lineTo(cx - 4, cy)
          ctx.closePath()
          ctx.fill()
          break

        case 'treasure':
          ctx.fillStyle = `hsl(30, 15%, 22%)`
          ctx.fillRect(px, py, tileSize, tileSize)
          // Treasure chest
          ctx.fillStyle = '#8B4513'
          ctx.fillRect(px + 3, py + 5, tileSize - 6, tileSize - 8)
          ctx.fillStyle = '#FFD700'
          ctx.fillRect(px + 3, py + 5, tileSize - 6, 3)
          ctx.fillStyle = '#FFD700'
          ctx.fillRect(px + tileSize / 2 - 2, py + 8, 4, 4)
          break
      }
    }
  }
}
