import { Midi } from '@tonejs/midi'

export type MelodyPair = {
  freq: number
  durationMs: number
  comment: string
}

export type TrackInfo = {
  index: number
  name: string
  noteCount: number
}

const NOTE_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const NOTE_JP = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'] as const

const UINT16_MAX = 65535

/** MIDIノート番号 → 周波数(Hz)。休符は 0。一般的な整数表に合わせて切り捨て。 */
export function midiNoteToHz(midi: number): number {
  return Math.floor(440 * 2 ** ((midi - 69) / 12))
}

function noteLabel(midi: number): string {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${NOTE_JP[pc]} (${NOTE_EN[pc]}${octave})`
}

function clampUint16(n: number): number {
  return Math.max(0, Math.min(UINT16_MAX, Math.round(n)))
}

export function listTracks(midi: Midi): TrackInfo[] {
  return midi.tracks
    .map((track, index) => ({
      index,
      name: track.name?.trim() || `Track ${index + 1}`,
      noteCount: track.notes.length,
    }))
    .filter((t) => t.noteCount > 0)
}

/**
 * 単音メロディとしてノート列を [Hz, ms] ペアに変換する。
 * 重なるノートは開始時刻が早い方を優先し、次のノート開始で打ち切る。
 */
export function notesToMelodyPairs(
  notes: { midi: number; time: number; duration: number }[],
): MelodyPair[] {
  if (notes.length === 0) return []

  const sorted = [...notes].sort((a, b) => a.time - b.time || b.midi - a.midi)
  const pairs: MelodyPair[] = []
  let cursor = 0

  for (let i = 0; i < sorted.length; i++) {
    const note = sorted[i]
    const nextStart = i + 1 < sorted.length ? sorted[i + 1].time : Infinity

    // ギャップは休符
    if (note.time > cursor + 0.0005) {
      const restMs = clampUint16((note.time - cursor) * 1000)
      if (restMs > 0) {
        pairs.push({
          freq: 0,
          durationMs: restMs,
          comment: `休符 を${restMs}ms`,
        })
      }
    }

    // 次ノート開始までにクリップ（単音化）
    const end = Math.min(note.time + note.duration, nextStart)
    const durationMs = clampUint16((end - note.time) * 1000)
    if (durationMs <= 0) {
      cursor = Math.max(cursor, note.time)
      continue
    }

    // 完全に前のノートに飲み込まれている場合はスキップ
    if (note.time < cursor - 0.0005) {
      continue
    }

    const freq = clampUint16(midiNoteToHz(note.midi))
    pairs.push({
      freq,
      durationMs,
      comment: `${noteLabel(note.midi)} を${durationMs}ms`,
    })
    cursor = end
  }

  return pairs
}

export function melodyToCSource(
  pairs: MelodyPair[],
  arrayName = 'vmu_melody',
): string {
  const lines = pairs.map(
    (p) => `    ${String(p.freq).padEnd(4)}, ${String(p.durationMs).padEnd(4)},  // ${p.comment}`,
  )

  return [
    '// [周波数(Hz), 発音時間(ミリ秒)] のペアの配列',
    `uint16_t ${arrayName}[] = {`,
    ...lines,
    '};',
    '',
    `// 要素数: ${pairs.length * 2} (ペア数: ${pairs.length})`,
  ].join('\n')
}

export async function parseMidiFile(file: File): Promise<Midi> {
  const buffer = await file.arrayBuffer()
  return new Midi(buffer)
}

export function convertTrack(midi: Midi, trackIndex: number): MelodyPair[] {
  const track = midi.tracks[trackIndex]
  if (!track) return []
  return notesToMelodyPairs(track.notes)
}
