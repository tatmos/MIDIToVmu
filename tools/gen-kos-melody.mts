import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import MidiPkg from '@tonejs/midi'
import { notesToMelodyPairs } from '../src/midiToVmu.ts'

const { Midi } = MidiPkg as { Midi: new (data: Buffer) => { tracks: { notes: { midi: number; time: number; duration: number }[] }[] } }

const midi = new Midi(readFileSync('public/samples/nandodemo.mid'))
const track = midi.tracks.find((t) => t.notes.length > 0)
if (!track) throw new Error('no notes')
const pairs = notesToMelodyPairs(track.notes)

const lines = pairs.map(
  (p) =>
    `    ${String(p.freq).padEnd(4)}, ${String(p.durationMs).padEnd(4)},  /* ${p.comment} */`,
)

mkdirSync('examples/kos-vmu-melody', { recursive: true })
writeFileSync('examples/kos-vmu-melody/melody_data.inc', lines.join('\n') + '\n')
console.log('pairs', pairs.length)
