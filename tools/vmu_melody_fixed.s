; =============================================================================
; MIDIToVMU → waterbear (complete player + LCD)
;
; Assemble:
;   waterbear assemble vmu_melody.s -o vmu_melody.vms
; Docs: https://wtetzner.github.io/waterbear
;
; A=replay / B=stop / MODE=exit  (auto-plays on start)
; Pitches play 1 octave down (VMU timer quantization).
; Pair count: 13
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
note_n	EQU	$36

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
	.byte	"MIDIToVMU       "
	.byte	"A:Play B:Stop MODE:Exit         "
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
	mov	#0, note_n
	mov	#<vmu_melody, TRL
	mov	#>vmu_melody, TRH
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
	mov	#0, note_n
	mov	#<vmu_melody, TRL
	mov	#>vmu_melody, TRH
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
	inc	note_n

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

LcdNoteHud:
	push	ACC
	push	B
	push	2
	push	XBNK
	mov	#1, XBNK
	mov	#$F0, 2
	mov	#6, B
.HudClr:
	mov	#0, @R2
	inc	2
	dec	B
	ld	B
	bnz	.HudClr
	ld	t1lr_v
	bnz	.HudBeep
	mov	#$F0, 2
	mov	#$18, @R2
	br	.HudDone
.HudBeep:
	ld	t1lr_v
	ror
	ror
	ror
	ror
	ror
	and	#7
	bnz	.HudW
	mov	#1, ACC
.HudW:
	st	B
	mov	#$F0, 2
.HudFill:
	mov	#$FF, @R2
	inc	2
	dec	B
	ld	B
	bnz	.HudFill
.HudDone:
	mov	#0, XBNK
	ld	note_n
	st	$180
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

scr_idle:
	.byte	$FF, $FF, $FF, $FF, $FF, $FF, $80, $00
	.byte	$00, $00, $00, $01, $80, $00, $00, $00
	.byte	$00, $01, $80, $00, $00, $00, $00, $01
	.byte	$80, $00, $00, $00, $00, $01, $80, $00
	.byte	$00, $00, $00, $01, $80, $00, $00, $00
	.byte	$00, $01, $80, $00, $00, $00, $00, $01
	.byte	$80, $00, $00, $00, $00, $01, $80, $00
	.byte	$00, $00, $00, $01, $80, $00, $20, $00
	.byte	$00, $01, $80, $00, $30, $00, $00, $01
	.byte	$80, $00, $38, $00, $00, $01, $80, $00
	.byte	$3C, $00, $00, $01, $80, $00, $3E, $00
	.byte	$00, $01, $80, $00, $3F, $00, $00, $01
	.byte	$80, $00, $3F, $80, $00, $01, $80, $00
	.byte	$3F, $C0, $00, $01, $80, $00, $3F, $E0
	.byte	$00, $01, $80, $00, $3F, $F0, $00, $01
	.byte	$80, $00, $3F, $F8, $00, $01, $80, $00
	.byte	$3F, $FC, $00, $01, $80, $00, $00, $00
	.byte	$00, $01, $80, $00, $00, $00, $00, $01
	.byte	$80, $00, $00, $00, $00, $01, $80, $00
	.byte	$00, $00, $00, $01, $80, $00, $00, $00
	.byte	$00, $01, $80, $00, $00, $00, $00, $01
	.byte	$80, $00, $00, $00, $00, $01, $80, $00
	.byte	$00, $00, $00, $01, $80, $00, $00, $00
	.byte	$00, $01, $FF, $FF, $FF, $FF, $FF, $FF

scr_play:
	.byte	$FF, $FF, $FF, $FF, $FF, $FF, $80, $00
	.byte	$00, $00, $00, $01, $80, $00, $00, $00
	.byte	$00, $01, $80, $00, $00, $00, $00, $01
	.byte	$80, $00, $00, $00, $00, $01, $80, $00
	.byte	$00, $00, $00, $01, $80, $00, $00, $00
	.byte	$00, $01, $80, $00, $00, $00, $00, $01
	.byte	$80, $00, $00, $00, $00, $01, $80, $00
	.byte	$00, $00, $00, $71, $80, $00, $00, $00
	.byte	$00, $71, $80, $00, $07, $00, $00, $71
	.byte	$80, $00, $07, $00, $00, $71, $80, $00
	.byte	$07, $01, $C0, $71, $80, $00, $07, $01
	.byte	$C0, $71, $80, $1C, $07, $01, $C0, $71
	.byte	$80, $1C, $07, $01, $C0, $71, $80, $1C
	.byte	$07, $01, $CE, $71, $80, $1C, $07, $01
	.byte	$CE, $71, $80, $1C, $E7, $01, $CE, $71
	.byte	$80, $1C, $E7, $01, $CE, $71, $80, $1C
	.byte	$E7, $39, $CE, $71, $80, $1C, $E7, $39
	.byte	$CE, $71, $83, $9C, $E7, $39, $CE, $71
	.byte	$83, $9C, $E7, $39, $CE, $71, $83, $9C
	.byte	$E7, $39, $CE, $71, $83, $9C, $E7, $39
	.byte	$CE, $71, $83, $9C, $E7, $39, $CE, $71
	.byte	$83, $9C, $E7, $39, $CE, $71, $80, $00
	.byte	$00, $00, $00, $01, $80, $00, $00, $00
	.byte	$00, $01, $FF, $FF, $FF, $FF, $FF, $FF

vmu_melody:
	.byte	$E1, $F0, $0D, $00	; ファ (F4) を125ms  (Hz=349 midi=53, T1LR=225)
	.byte	$E4, $F1, $0D, $00	; ソ (G4) を125ms  (Hz=391 midi=55, T1LR=228)
	.byte	$E7, $F3, $0D, $00	; ラ (A4) を125ms  (Hz=440 midi=57, T1LR=231)
	.byte	$EB, $F5, $19, $00	; ド (C5) を250ms  (Hz=523 midi=60, T1LR=235)
	.byte	$00, $00, $0D, $00	; 休符 を125ms  (rest, T1LR=0)
	.byte	$E1, $F0, $0D, $00	; ファ (F4) を125ms  (Hz=349 midi=53, T1LR=225)
	.byte	$DF, $EF, $0D, $00	; ミ (E4) を125ms  (Hz=329 midi=52, T1LR=223)
	.byte	$00, $00, $0D, $00	; 休符 を125ms  (rest, T1LR=0)
	.byte	$DF, $EF, $0D, $00	; ミ (E4) を125ms  (Hz=329 midi=52, T1LR=223)
	.byte	$E4, $F1, $19, $00	; ソ (G4) を250ms  (Hz=391 midi=55, T1LR=228)
	.byte	$ED, $F6, $0D, $00	; レ (D5) を125ms  (Hz=587 midi=62, T1LR=237)
	.byte	$00, $00, $0D, $00	; 休符 を125ms  (rest, T1LR=0)
	.byte	$EB, $F5, $32, $00	; ド (C5) を500ms  (Hz=523 midi=60, T1LR=235)
	.byte	$00, $00, $00, $00
