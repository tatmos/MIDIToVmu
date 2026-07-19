import type { MelodyPair } from './midiToVmu'

/** Timer1 Low のカウント周波数（Marcus Comstedt / ADVM と同じ） */
export const VMU_T1_HZ = 32768 / 6

/** メロディ表の時間単位（ms） */
export const DURATION_TICK_MS = 10

/**
 * VMU 再生時のオクターブ補正。
 * 高音域は Timer1 周期が短く量子化誤差で上ずりやすいので、1つ下げて鳴らす。
 * （ブラウザプレビューの Hz はそのまま）
 */
export const VMU_PLAY_OCTAVE_SHIFT = -12

/**
 * ADVM (jvsTSX) の Note LUT。
 * index 0 = F0 (MIDI 17) … index 0x2C = C#4 (MIDI 61)
 * 実機 VMU 向けに検証済みの T1LR 値。
 */
export const ADVM_NOTE_LUT: number[] = [
  0x06, 0x14, 0x21, 0x2e, 0x39, 0x45, 0x4f, // F0-B0
  0x59, 0x62, 0x6b, 0x73, 0x7c, 0x83, 0x8a, 0x90, 0x97, 0x9d, 0xa2, 0xa8, // C1-B1
  0xac, 0xb1, 0xb6, 0xba, 0xbe, 0xc1, 0xc5, 0xc8, 0xcb, 0xce, 0xd1, 0xd4, // C2-B2
  0xd6, 0xd9, 0xdb, 0xdd, 0xdf, 0xe1, 0xe2, 0xe4, 0xe6, 0xe7, 0xe8, 0xea, // C3-B3
  0xeb, 0xec, // C4-C#4
]

export type WaterbearNote = {
  t1lr: number
  t1lc: number
  durationTicks: number
  durationMs: number
  comment: string
  freqHz: number
  midi: number
}

/** 目標 Hz に対しセント誤差が最小の周期を選ぶ */
function bestPeriodForHz(freqHz: number): number {
  const ideal = VMU_T1_HZ / freqHz
  let best = Math.max(2, Math.min(80, Math.round(ideal)))
  let bestErr = Infinity
  for (const p of [best - 1, best, best + 1]) {
    if (p < 2 || p > 80) continue
    const err = Math.abs(1200 * Math.log2(VMU_T1_HZ / p / freqHz))
    if (err < bestErr) {
      bestErr = err
      best = p
    }
  }
  return best
}

/** MIDI ノート番号 → T1LR（ADVM LUT + 高音はセント最適の Marcus 式） */
export function midiToT1LR(midi: number): number {
  const idx = midi - 17 // F0
  if (idx < 0) return ADVM_NOTE_LUT[0]
  if (idx < ADVM_NOTE_LUT.length) return ADVM_NOTE_LUT[idx]
  const freq = 440 * 2 ** ((midi - 69) / 12)
  return 256 - bestPeriodForHz(freq)
}

/** ADVM と同じ duty 計算の近似（約 50%） */
export function t1lrToT1LC(t1lr: number): number {
  if (t1lr === 0) return 0
  const inv = t1lr ^ 0xff
  const pulse = Math.max(1, Math.floor((inv * 16) / 32))
  return Math.min(255, t1lr + pulse)
}

export function hzToT1LR(freqHz: number): number {
  if (freqHz <= 0) return 0
  return 256 - bestPeriodForHz(freqHz)
}

export function pairsToWaterbearNotes(pairs: MelodyPair[]): WaterbearNote[] {
  return pairs.map((p) => {
    const midi =
      p.midi != null && p.midi > 0
        ? p.midi
        : p.freq > 0
          ? Math.round(69 + 12 * Math.log2(p.freq / 440))
          : 0
    const playMidi = midi > 0 ? midi + VMU_PLAY_OCTAVE_SHIFT : 0
    const t1lr = playMidi > 0 ? midiToT1LR(playMidi) : 0
    const durationTicks =
      p.durationMs <= 0
        ? 0
        : Math.min(255, Math.max(1, Math.round(p.durationMs / DURATION_TICK_MS)))
    return {
      t1lr,
      t1lc: t1lrToT1LC(t1lr),
      durationTicks,
      durationMs: p.durationMs,
      comment: p.comment,
      freqHz: p.freq,
      midi: playMidi,
    }
  })
}

function hexByte(n: number): string {
  return `$${n.toString(16).toUpperCase().padStart(2, '0')}`
}

function padField(s: string, len: number): string {
  const cleaned = s.replace(/"/g, "'").slice(0, len)
  return cleaned + ' '.repeat(len - cleaned.length)
}

function makeBitmap(draw: (set: (x: number, y: number) => void) => void): number[] {
  const px = Array.from({ length: 32 }, () => Array<number>(48).fill(0))
  const set = (x: number, y: number) => {
    if (x >= 0 && x < 48 && y >= 0 && y < 32) px[y][x] = 1
  }
  draw(set)
  const bytes: number[] = []
  for (let y = 0; y < 32; y++) {
    for (let bx = 0; bx < 6; bx++) {
      let b = 0
      for (let bit = 0; bit < 8; bit++) {
        if (px[y][bx * 8 + bit]) b |= 0x80 >> bit
      }
      bytes.push(b)
    }
  }
  return bytes
}

function bitmapToAsm(label: string, bytes: number[]): string {
  const lines: string[] = [`${label}:`]
  for (let i = 0; i < bytes.length; i += 8) {
    const chunk = bytes.slice(i, i + 8).map(hexByte).join(', ')
    lines.push(`\t.byte\t${chunk}`)
  }
  return lines.join('\n')
}

function idleBitmap(): number[] {
  // 枠 + 再生マーク（▶）
  return makeBitmap((set) => {
    for (let x = 0; x < 48; x++) {
      set(x, 0)
      set(x, 31)
    }
    for (let y = 0; y < 32; y++) {
      set(0, y)
      set(47, y)
    }
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x <= Math.floor(y / 2); x++) {
        set(20 + x, 11 + y)
      }
    }
  })
}

function playBitmap(): number[] {
  // 枠 + 静的な簡易バー（装飾）。ノート連動は下部 PitchHud
  return makeBitmap((set) => {
    for (let x = 0; x < 48; x++) {
      set(x, 0)
      set(x, 31)
    }
    for (let y = 0; y < 32; y++) {
      set(0, y)
      set(47, y)
    }
    const heights = [8, 14, 10, 16]
    for (let i = 0; i < heights.length; i++) {
      const x0 = 8 + i * 10
      for (let y = 0; y < heights[i]; y++) {
        set(x0, 26 - y)
        set(x0 + 1, 26 - y)
      }
    }
  })
}

export function melodyToWaterbearSource(
  pairs: MelodyPair[],
  label = 'vmu_melody',
): string {
  const notes = pairsToWaterbearNotes(pairs)
  const safeLabel = label.replace(/[^A-Za-z0-9_]/g, '_') || 'vmu_melody'
  const title = padField('MIDIToVMU', 16)
  const desc = padField('A:Play B:Stop MODE:Exit', 32)

  const dataLines = notes.map((n) => {
    const lo = n.durationTicks & 0xff
    const hzPart = n.freqHz > 0 ? `Hz=${n.freqHz} midi=${n.midi}` : 'rest'
    return `\t.byte\t${hexByte(n.t1lr)}, ${hexByte(n.t1lc)}, ${hexByte(lo)}, $00\t; ${n.comment}  (${hzPart}, T1LR=${n.t1lr})`
  })

  const scrIdle = bitmapToAsm('scr_idle', idleBitmap())
  const scrPlay = bitmapToAsm('scr_play', playBitmap())

  return `; =============================================================================
; MIDIToVMU → waterbear (complete player + LCD)
;
; Assemble:
;   waterbear assemble ${safeLabel}.s -o ${safeLabel}.vms
; Docs: https://wtetzner.github.io/waterbear
;
; A=replay / B=stop / MODE=exit  (auto-plays on start)
; Pitches play 1 octave down (VMU timer quantization).
; LCD: play/idle screens + bottom pitch bar per note.
; Pair count: ${notes.length}
; =============================================================================

ACC	EQU	$100
PSW	EQU	$101
B	EQU	$102
C	EQU	$103
TRL	EQU	$104
TRH	EQU	$105
SP	EQU	$106
IE	EQU	$108
EXT	EQU	$10D
OCR	EQU	$10E
T1CNT	EQU	$118
T1LC	EQU	$11A
T1LR	EQU	$11B
MCR	EQU	$120
XBNK	EQU	$125
VCCR	EQU	$127
P1	EQU	$144
P1DDR	EQU	$145
P1FCR	EQU	$146
P3	EQU	$14C
P3INT	EQU	$14E

BTN_A	EQU	4
BTN_B	EQU	5
BTN_MODE	EQU	6

idx	EQU	$30
t1lr_v	EQU	$31
t1lc_v	EQU	$32
dur_lo	EQU	$33
stop_f	EQU	$35

	.org	0
	jmpf	Start

	.org	$3
	reti
	.org	$b
	reti
	.org	$13
	reti
	.org	$1b
	reti
	.org	$23
	reti
	.org	$2b
	reti
	.org	$33
	reti
	.org	$3b
	reti
	.org	$43
	reti
	.org	$4b
	reti

	.org	$1f0
GoodBye:
	not1	EXT, 0
	jmpf	GoodBye

	.org	$200
	.byte	"${title}"
	.byte	"${desc}"
	.org	$240
	.org	$260
	.org	$280

Start:
	mov	#$7F, SP
	mov	#0, IE
	mov	#%10000000, VCCR
	mov	#%00001001, MCR
	; SoundDemo: Quartz(32kHz)/6 + RC停止 + CF停止
	mov	#$A3, OCR
	mov	#0, P3INT
	mov	#$FF, P3

	; Timer1 Low only + ELDT1C (SoundDemo)。T1HRUN は付けない
	mov	#$80, P1FCR
	clr1	P1, 7
	mov	#$80, P1DDR
	mov	#%00010000, T1CNT
	call	Silence

	; 起動時に1回だけ再生（ループしない）
	mov	#<scr_play, TRL
	mov	#>scr_play, TRH
	call	SetScr
	mov	#0, stop_f
	mov	#<${safeLabel}, TRL
	mov	#>${safeLabel}, TRH
	call	PlayMelody
	call	Silence

	mov	#<scr_idle, TRL
	mov	#>scr_idle, TRH
	call	SetScr

; A の押下エッジでのみ再再生（押しっぱなしでループしない）
MainLoop:
	ld	P3
	bn	ACC, BTN_MODE, GoExit
	bp	ACC, BTN_A, MainLoop
WaitARelease:
	ld	P3
	bn	ACC, BTN_MODE, GoExit
	bn	ACC, BTN_A, WaitARelease
	mov	#<scr_play, TRL
	mov	#>scr_play, TRH
	call	SetScr
	mov	#0, stop_f
	mov	#<${safeLabel}, TRL
	mov	#>${safeLabel}, TRH
	call	PlayMelody
	call	Silence
	mov	#<scr_idle, TRL
	mov	#>scr_idle, TRH
	call	SetScr
	br	MainLoop

GoExit:
	call	Silence
	jmpf	GoodBye

; タイマ停止 + ミュート（再生中の T1LR 書き換えを確実に効かせる）
Silence:
	clr1	T1CNT, 6
	mov	#$FF, T1LR
	mov	#$FF, T1LC
	ret

PlayMelody:
	mov	#0, idx

NextNote:
	ld	P3
	bn	ACC, BTN_B, StopPlay

	ld	idx
	ldc
	st	t1lr_v
	inc	idx
	ld	idx
	ldc
	st	t1lc_v
	inc	idx
	ld	idx
	ldc
	st	dur_lo
	inc	idx
	inc	idx

	ld	t1lr_v
	or	t1lc_v
	or	dur_lo
	bnz	DoNote
	br	StopPlay

DoNote:
	call	PitchHud

	ld	t1lr_v
	bnz	BeepOn
	call	Silence
	br	WaitDur

BeepOn:
	; 停止 → ピッチ設定 → 再開（ラッチを確実に更新）
	clr1	T1CNT, 6
	ld	t1lr_v
	st	T1LR
	; SoundDemo と同じ 50% duty: T1LC = T1LR + ((255-T1LR)>>1)
	mov	#$FF, ACC
	sub	t1lr_v
	clr1	ACC, 0
	ror
	add	t1lr_v
	st	T1LC
	set1	T1CNT, 6

WaitDur:
	ld	P3
	bn	ACC, BTN_B, StopPlay
	ld	stop_f
	bnz	StopPlay
	ld	dur_lo
	bz	NoteGap
	call	DelayTick
	ld	dur_lo
	sub	#1
	st	dur_lo
	br	WaitDur

NoteGap:
	; ノート間の余分な無音は入れない（休符は表の T1LR=0 で処理済み）
	; Web プレビューと同じテンポ感に近づける
	br	NextNote

StopPlay:
	mov	#1, stop_f
	call	Silence
	ret

SetScr:
	push	ACC
	push	XBNK
	push	C
	push	2
	mov	#$80, 2
	xor	ACC
	st	XBNK
	st	C
.SLoop:
	ld	C
	ldc
	st	@R2
	inc	2
	inc	C
	ld	2
	and	#$f
	bne	#$c, .SSkip
	ld	2
	add	#4
	st	2
	bnz	.SSkip
	inc	XBNK
	mov	#$80, 2
.SSkip:
	ld	C
	bne	#$c0, .SLoop
	pop	2
	pop	C
	pop	XBNK
	pop	ACC
	ret

; 画面最下行にピッチバー（幅 = 音の高さ）。休符は点だけ。
PitchHud:
	push	ACC
	push	B
	push	2
	push	XBNK
	mov	#1, XBNK
	mov	#$F0, 2
	mov	#6, B
.PClr:
	mov	#0, @R2
	inc	2
	dec	B
	ld	B
	bnz	.PClr
	ld	t1lr_v
	bnz	.PTone
	mov	#$F0, 2
	mov	#$80, @R2
	br	.PDone
.PTone:
	; T1LR が高いほど高音 → バーを長く（1..6）
	ld	t1lr_v
	ror
	ror
	ror
	ror
	and	#7
	bnz	.PLen
	mov	#1, ACC
.PLen:
	be	#7, .PCap
	br	.POk
.PCap:
	mov	#6, ACC
.POk:
	st	B
	mov	#$F0, 2
.PFill:
	mov	#$FF, @R2
	inc	2
	dec	B
	ld	B
	bnz	.PFill
.PDone:
	mov	#0, XBNK
	pop	XBNK
	pop	2
	pop	B
	pop	ACC
	ret

; 約 10ms @ OCR=$A3 (Quartz 32768/6 ≈ 5461 Hz)
; 目標 ~55 cycle。短すぎると速く、長すぎると遅く聞こえる
DelayTick:
	push	ACC
	push	B
	mov	#2, B
DOuter:
	ld	P3
	bn	ACC, BTN_B, DAbort
	mov	#3, ACC
DInner:
	dec	ACC
	bnz	DInner
	dec	B
	ld	B
	bnz	DOuter
	pop	B
	pop	ACC
	ret
DAbort:
	mov	#1, stop_f
	pop	B
	pop	ACC
	ret

${scrIdle}

${scrPlay}

${safeLabel}:
${dataLines.length > 0 ? dataLines.join('\n') : '\t; (empty)'}
	.byte	$00, $00, $00, $00
`
}
