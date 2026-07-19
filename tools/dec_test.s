ACC EQU $100
PSW EQU $101
SP EQU $106
dur_lo EQU $23
	.org 0
	jmpf Start
	.org $200
	.byte "Test            "
	.byte "Test                            "
	.org $280
Start:
	mov #$7F, SP
	mov #10, dur_lo
	dec dur_lo
	ld dur_lo
	bne #9, Bad
Good:
	jmpf Good
Bad:
	jmpf Bad
