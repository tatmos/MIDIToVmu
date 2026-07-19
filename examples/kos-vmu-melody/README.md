# KallistiOS サンプル: DC ループから VMU メロディ再生

[massie 氏の記事](https://massie0414.com/index.php/retro_game_production/dreamcast/15211/)と同じ系統で、  
**ドリームキャスト側**から `vmu_beep_waveform()` を連続呼び出ししてメロディを鳴らします。

## 環境

- Windows + [DreamSDK](https://dreamsdk.org/) R4（KallistiOS）
- [Flycast](https://github.com/flyinghead/flycast) + [DreamPotato](https://github.com/RikkiGibson/DreamPotato)  
  （または実機 DC + VMU）

## ビルド

DreamSDK のシェルで:

```bash
cd examples/kos-vmu-melody
make
```

生成物: `vmu_melody.elf`（環境に合わせて CDI 化など）

## 操作

| ボタン | 動作 |
|--------|------|
| A | メロディ再生 |
| B | 停止 |
| START | 終了 |

## メロディデータの入れ方

`main.c` の `vmu_melody[]` は MIDIToVMU の **C 出力と同じ形式**です。

```c
uint16_t vmu_melody[] = {
    349, 125,  // Hz, ms
    ...
};
```

[MIDIToVMU](https://tatmos.github.io/MIDIToVmu/) で「C (uint16_t)」を選び、配列を貼り替えてください。

## 注意（音程）

ドック中の Maple ビープは Timer1 が CF 寄りのため、実用帯はだいたい **数 kHz〜** です。  
MIDI の低い Hz をそのままは出せないので、このサンプルでは **相対音程を保ったまま高音域へ写像**しています。  
絶対音高を Web プレビューと揃える用途には、VMU 単体の waterbear `.vms` の方が向いています。
