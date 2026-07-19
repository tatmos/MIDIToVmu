/*
 * MIDIToVMU → Dreamcast (KallistiOS) sample
 *
 * DC ゲーム側ループから VMU ビープでメロディを再生する例。
 * 参考: https://massie0414.com/index.php/retro_game_production/dreamcast/15211/
 *
 * 必要環境:
 *   - DreamSDK R4 (KallistiOS)
 *   - Flycast + DreamPotato（VMU 接続）または実機 + VMU
 *
 * ビルド例 (DreamSDK シェル):
 *   make
 *
 * 操作:
 *   A      … メロディ再生
 *   B      … 停止
 *   START  … 終了
 *
 * 注意:
 *   ドック中の VMU Timer1 は CF 時計寄りで、Maple beep の実用レンジは
 *   およそ数 kHz〜です。MIDI の Hz をそのままでは低すぎるため、
 *   ここでは相対音程を保ったまま可聴なビープ帯へ写像しています。
 */

#include <kos.h>
#include <dc/maple.h>
#include <dc/maple/controller.h>
#include <dc/maple/vmu.h>
#include <stdio.h>
#include <stdint.h>

KOS_INIT_FLAGS(INIT_DEFAULT);

/* [Hz, ms] — MIDIToVMU の C 出力と同じ形式（nandodemo.mid） */
static const uint16_t vmu_melody[] = {
    349, 125,  /* F4 */
    391, 125,  /* G4 */
    440, 125,  /* A4 */
    523, 250,  /* C5 */
    0,   125,  /* rest */
    349, 125,  /* F4 */
    329, 125,  /* E4 */
    0,   125,  /* rest */
    329, 125,  /* E4 */
    391, 250,  /* G4 */
    587, 125,  /* D5 */
    0,   125,  /* rest */
    523, 500,  /* C5 */
};

#define MELODY_PAIR_COUNT  (sizeof(vmu_melody) / sizeof(vmu_melody[0]) / 2)

/* ドック時 Timer1 ≈ 1 MHz (CF/6) 想定。period = clock / freq */
#define BEEP_TIMER_HZ  1000000u

/* MIDI 音域をビープ帯へ上げる倍率（相対音程は維持） */
#define PITCH_OCTAVE_UP  8u

static volatile int g_stop = 0;

static maple_device_t *first_vmu(void) {
    return maple_enum_type(0, MAPLE_FUNC_CLOCK);
}

static int send_waveform(maple_device_t *vmu, uint8_t period, uint8_t duty) {
    int result;
    int retries = 5;

    if (!vmu)
        return MAPLE_EINVALID;

    do {
        result = vmu_beep_waveform(vmu, period, duty, 0, 0);
        if (result != MAPLE_EAGAIN)
            return result;
        thd_sleep(2);
    } while (--retries);

    return result;
}

static void stop_beep(void) {
    send_waveform(first_vmu(), 0, 0);
}

/**
 * Hz → Maple beep の period / duty（50%）。
 * freq==0 は休符（無音）。
 */
static void hz_to_waveform(uint16_t hz, uint8_t *period, uint8_t *duty) {
    uint32_t f;
    uint32_t p;

    if (hz == 0) {
        *period = 0;
        *duty = 0;
        return;
    }

    f = (uint32_t)hz * PITCH_OCTAVE_UP;
    if (f < 4000u)
        f = 4000u;
    if (f > 200000u)
        f = 200000u;

    p = (BEEP_TIMER_HZ + f / 2u) / f;
    if (p < 2u)
        p = 2u;
    if (p > 255u)
        p = 255u;

    *period = (uint8_t)p;
    *duty = (uint8_t)(p / 2u);
    if (*duty == 0)
        *duty = 1;
    if (*duty >= *period)
        *duty = (uint8_t)(*period - 1);
}

static void play_melody(void) {
    maple_device_t *vmu = first_vmu();
    size_t i;

    if (!vmu) {
        printf("No VMU found. Connect DreamPotato / insert a VMU.\n");
        return;
    }

    g_stop = 0;
    printf("Playing %u notes...\n", (unsigned)MELODY_PAIR_COUNT);

    for (i = 0; i < MELODY_PAIR_COUNT; i++) {
        uint16_t hz = vmu_melody[i * 2];
        uint16_t ms = vmu_melody[i * 2 + 1];
        uint8_t period, duty;
        cont_state_t *st;
        maple_device_t *cont;

        if (g_stop)
            break;

        /* B で中断 */
        cont = maple_enum_type(0, MAPLE_FUNC_CONTROLLER);
        st = cont ? (cont_state_t *)maple_dev_status(cont) : NULL;
        if (st && (st->buttons & CONT_B)) {
            printf("Stopped.\n");
            break;
        }

        hz_to_waveform(hz, &period, &duty);
        if (period == 0)
            stop_beep();
        else
            send_waveform(vmu, period, duty);

        if (ms > 0)
            thd_sleep(ms);
    }

    stop_beep();
    printf("Done.\n");
}

int main(void) {
    uint32_t previous = 0;

    printf("MIDIToVMU / KOS VMU melody sample\n");
    printf("A: play   B: stop   START: quit\n");

    for (;;) {
        maple_device_t *controller = maple_enum_type(0, MAPLE_FUNC_CONTROLLER);
        cont_state_t *state =
            controller ? (cont_state_t *)maple_dev_status(controller) : NULL;
        uint32_t buttons = state ? state->buttons : 0;
        uint32_t pressed = buttons & ~previous;

        previous = buttons;

        if (pressed & CONT_A)
            play_melody();

        if (pressed & CONT_B) {
            g_stop = 1;
            stop_beep();
        }

        if (pressed & CONT_START)
            break;

        thd_sleep(10);
    }

    stop_beep();
    return 0;
}
