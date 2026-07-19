# MIDIToVMU

MIDIファイルをドリームキャストVMU向けメロディ配列（Cソース）に変換するブラウザツールです。

## 使い方

```bash
npm install
npm run dev
```

ブラウザで MIDI（`.mid` / `.midi`）をアップロードすると、次のようなコードが生成されます。

```c
// [周波数(Hz), 発音時間(ミリ秒)] のペアの配列
uint16_t vmu_melody[] = {
    261, 500,  // ド (C4) を500ms
    293, 500,  // レ (D4) を500ms
    0,   500,  // 休符 を500ms
};
```

## ビルド

```bash
npm run build
```

`dist/` を静的ホスティングに配置できます。処理はすべてブラウザ内で完結します。

## GitHub Pages

`main` への push で GitHub Actions が自動デプロイします。

公開 URL: https://tatmos.github.io/MIDIToVmu/

初回のみリポジトリの **Settings → Pages → Source** を **GitHub Actions** に設定してください。
