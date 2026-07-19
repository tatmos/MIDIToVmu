ACC EQU $100
	.org 0
	jmpf Start
	.org $200
	.byte "Test            "
	.byte "Test                            "
	.org $280
Start:
	mov #$7F, SP
	callf Foo
	jmpf Start
Foo:
	retf
