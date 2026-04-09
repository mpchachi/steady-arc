export interface Tile {
  type: 'rock' | 'path' | 'crystal' | 'treasure'
  x: number  // grid col
  y: number  // grid row
}

export interface CaveMap {
  tiles: Tile[][]
  width: number   // grid cols
  height: number  // grid rows
  tileSize: number // px
  treasures: Array<{ x: number; y: number; found: boolean }>
}

export interface GameState {
  isRunning: boolean
  startTime: number
  percentRevealed: number
  treasuresFound: number
  totalTreasures: number
}
