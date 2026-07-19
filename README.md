# MIDIToVMU

MIDIファイルをドリームキャストVMU向けメロディ配列（Cソース）に変換するブラウザツールです。

## 使い方

```bash
npm install
npm run dev
```

ブラウザで MIDI（`.mid` / `.midi`）をアップロードすると、C配列または **waterbear 用の完成プログラム（`.s`）** が生成されます。

waterbear 出力には SFR定義・再生ルーチン・メロディ表が含まれます。

```bash
waterbear assemble vmu_melody.s -o vmu_melody.vms
```

アセンブラの入手・使い方は [waterbear](https://wtetzner.github.io/waterbear) を参照してください（[Releases](https://github.com/wtetzner/waterbear/releases)）。

生成した `.vms` を [DreamPotato](https://github.com/RikkiGibson/DreamPotato)（スタンドアロン）で開けば音を確認できます。

- 起動時に自動再生
- **A** … 再再生
- **B** … 停止
- **MODE** … BIOS に戻る
- 再生中は簡易イコライザ画面、最下行のピッチバーがノートに合わせて変化
- 停止中は ▶ の待機画面

## ビルド

```bash
npm run build
```

`dist/` を静的ホスティングに配置できます。処理はすべてブラウザ内で完結します。

サンプル MIDI: `public/samples/nandodemo.mid`（画面の「サンプルを読み込む」からも利用可）

## GitHub Pages

`main` への push で GitHub Actions が自動デプロイします。

公開 URL: https://tatmos.github.io/MIDIToVmu/

初回のみリポジトリの **Settings → Pages → Source** を **GitHub Actions** に設定してください。

## Dreamcast 本体から鳴らす（KallistiOS）

C 配列を DC ゲーム側で `vmu_beep_waveform` ループ再生する例:

`examples/kos-vmu-melody/`（[解説記事と同じ系統](https://massie0414.com/index.php/retro_game_production/dreamcast/15211/)）
