/**
 * nandodemo.mid → waterbear .s（検証用）
 * Usage: npx tsx tools/gen-nandodemo.mts [midPath] [outPath]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import MidiPkg from '@tonejs/midi'
import { notesToMelodyPairs } from '../src/midiToVmu.ts'
import { melodyToWaterbearSource, midiToT1LR } from '../src/waterbear.ts'

const { Midi } = MidiPkg as { Midi: new (data: ArrayBuffer | Buffer) => InstanceType<typeof import('@tonejs/midi').Midi> }

const midiPath =
  process.argv[2] ??
  'd:/Nuendo/home/2026年後半/SGJ20260718/PJ-RetroNoTameNaraSineru/PJ-VMU-Nandodemo/nandodemo.mid'
const outPath = process.argv[3] ?? 'tools/vmu_melody_fixed.s'

const midi = new Midi(readFileSync(midiPath))
const track = midi.tracks.find((t) => t.notes.length > 0)
if (!track) throw new Error('no notes')

const pairs = notesToMelodyPairs(track.notes)
const src = melodyToWaterbearSource(pairs, 'vmu_melody')
writeFileSync(outPath, src)

for (const p of pairs) {
  const midiNote = p.midi ?? 0
  const t1 = midiNote > 0 ? midiToT1LR(midiNote) : 0
  console.log(
    `${p.comment.padEnd(28)} midi=${String(midiNote).padStart(3)} Hz=${String(p.freq).padStart(4)} T1LR=$${t1.toString(16).toUpperCase().padStart(2, '0')}`,
  )
}
console.log(`wrote ${outPath} (${pairs.length} pairs)`)
