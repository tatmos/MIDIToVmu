import './style.css'
import {
  convertTrack,
  listTracks,
  melodyToCSource,
  parseMidiFile,
  type MelodyPair,
  type TrackInfo,
} from './midiToVmu'
import { melodyToWaterbearSource } from './waterbear'
import { MelodyPreview } from './preview'
import type { Midi } from '@tonejs/midi'

type OutputFormat = 'c' | 'waterbear'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <header>
    <h1>MIDIToVMU</h1>
    <p>MIDIファイルをVMU用メロディ（C / waterbear）に変換します</p>
  </header>

  <div class="dropzone" id="dropzone">
    <strong>MIDIファイルをドロップ</strong>
    <span>またはクリックして選択（.mid / .midi）</span>
    <input type="file" id="file" accept=".mid,.midi,audio/midi,audio/x-midi" />
  </div>

  <p class="sample-row">
    <button type="button" id="sample" class="secondary">サンプルを読み込む（nandodemo.mid）</button>
  </p>

  <div class="panel hidden" id="options">
    <div class="controls">
      <label>
        トラック
        <select id="track"></select>
      </label>
      <label>
        配列名 / ラベル
        <input type="text" id="arrayName" value="vmu_melody" spellcheck="false" />
      </label>
      <label>
        出力形式
        <select id="format">
          <option value="c">C (uint16_t)</option>
          <option value="waterbear">waterbear (.s)</option>
        </select>
      </label>
    </div>
    <p class="meta" id="meta"></p>
  </div>

  <div class="error hidden" id="error"></div>

  <div class="hidden" id="outputSection">
    <div class="output-header">
      <h2 id="outputTitle">生成コード</h2>
      <div class="output-actions">
        <button type="button" id="play" disabled>プレビュー再生</button>
        <button type="button" id="stop" class="secondary" disabled>停止</button>
        <button type="button" id="copy" disabled>コピー</button>
        <button type="button" id="download" class="secondary" disabled>ファイル保存</button>
      </div>
    </div>
    <div class="usage-hint hidden" id="usageHint"></div>
    <pre id="output"></pre>
  </div>

  <footer>
    単音メロディ想定。重なるノートは開始が早いものを優先し、次のノート開始で打ち切ります。
    プレビューはブラウザ上の矩形波で、実機VMUの音質とは異なります。
    waterbear: <a href="https://wtetzner.github.io/waterbear" target="_blank" rel="noopener noreferrer">公式ドキュメント</a>
  </footer>
`

const dropzone = document.querySelector<HTMLDivElement>('#dropzone')!
const fileInput = document.querySelector<HTMLInputElement>('#file')!
const sampleBtn = document.querySelector<HTMLButtonElement>('#sample')!
const options = document.querySelector<HTMLDivElement>('#options')!
const trackSelect = document.querySelector<HTMLSelectElement>('#track')!
const arrayNameInput = document.querySelector<HTMLInputElement>('#arrayName')!
const formatSelect = document.querySelector<HTMLSelectElement>('#format')!
const meta = document.querySelector<HTMLParagraphElement>('#meta')!
const errorEl = document.querySelector<HTMLDivElement>('#error')!
const outputSection = document.querySelector<HTMLDivElement>('#outputSection')!
const outputTitle = document.querySelector<HTMLHeadingElement>('#outputTitle')!
const output = document.querySelector<HTMLPreElement>('#output')!
const usageHint = document.querySelector<HTMLDivElement>('#usageHint')!
const copyBtn = document.querySelector<HTMLButtonElement>('#copy')!
const downloadBtn = document.querySelector<HTMLButtonElement>('#download')!
const playBtn = document.querySelector<HTMLButtonElement>('#play')!
const stopBtn = document.querySelector<HTMLButtonElement>('#stop')!

const preview = new MelodyPreview()

let currentMidi: Midi | null = null
let currentFileName = ''
let tracks: TrackInfo[] = []
let currentPairs: MelodyPair[] = []

function showError(message: string) {
  errorEl.textContent = message
  errorEl.classList.remove('hidden')
}

function clearError() {
  errorEl.textContent = ''
  errorEl.classList.add('hidden')
}

function setPlayingUi(playing: boolean) {
  playBtn.classList.toggle('playing', playing)
  playBtn.textContent = playing ? '再生中…' : 'プレビュー再生'
  stopBtn.disabled = !playing
}

function currentFormat(): OutputFormat {
  return formatSelect.value === 'waterbear' ? 'waterbear' : 'c'
}

function regenerate() {
  if (!currentMidi || tracks.length === 0) return

  preview.stop()
  setPlayingUi(false)

  const trackIndex = Number(trackSelect.value)
  const arrayName = sanitizeArrayName(arrayNameInput.value)
  currentPairs = convertTrack(currentMidi, trackIndex)

  const format = currentFormat()
  const code =
    format === 'waterbear'
      ? melodyToWaterbearSource(currentPairs, arrayName)
      : melodyToCSource(currentPairs, arrayName)

  outputTitle.textContent =
    format === 'waterbear' ? '生成コード（waterbear）' : '生成コード（C）'
  output.textContent = code

  if (format === 'waterbear') {
    const base = arrayName
    usageHint.innerHTML = `
      <p><strong>使い方</strong>（ファイル保存後）:</p>
      <pre class="inline-cmd">waterbear assemble ${base}.s -o ${base}.vms</pre>
      <p>
        アセンブラ:
        <a href="https://wtetzner.github.io/waterbear" target="_blank" rel="noopener noreferrer">waterbear</a>
         /
        <a href="https://github.com/wtetzner/waterbear/releases" target="_blank" rel="noopener noreferrer">ダウンロード</a>
        。起動時に自動再生。DreamPotato（スタンドアロン）で <strong>A=再再生 / B=停止 / MODE=終了</strong>。再生中は LCD に表示します。
      </p>
    `
    usageHint.classList.remove('hidden')
  } else {
    usageHint.innerHTML = ''
    usageHint.classList.add('hidden')
  }

  outputSection.classList.remove('hidden')
  copyBtn.disabled = currentPairs.length === 0
  downloadBtn.disabled = currentPairs.length === 0
  playBtn.disabled = currentPairs.length === 0

  const track = tracks.find((t) => t.index === trackIndex)
  meta.textContent = `${currentFileName} / ${track?.name ?? ''} — ノート ${track?.noteCount ?? 0} → ペア ${currentPairs.length}`
}

function sanitizeArrayName(raw: string): string {
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_]/g, '_')
  if (!cleaned) return 'vmu_melody'
  if (/^[0-9]/.test(cleaned)) return `vmu_${cleaned}`
  return cleaned
}

async function loadFile(file: File) {
  clearError()
  preview.stop()
  setPlayingUi(false)
  try {
    currentMidi = await parseMidiFile(file)
    currentFileName = file.name
    tracks = listTracks(currentMidi)

    if (tracks.length === 0) {
      currentPairs = []
      showError('ノートを含むトラックが見つかりませんでした。')
      options.classList.add('hidden')
      outputSection.classList.add('hidden')
      copyBtn.disabled = true
      downloadBtn.disabled = true
      playBtn.disabled = true
      return
    }

    trackSelect.innerHTML = tracks
      .map(
        (t) =>
          `<option value="${t.index}">${escapeHtml(t.name)} (${t.noteCount} notes)</option>`,
      )
      .join('')

    options.classList.remove('hidden')
    regenerate()
  } catch (err) {
    currentMidi = null
    tracks = []
    currentPairs = []
    options.classList.add('hidden')
    outputSection.classList.add('hidden')
    showError(
      err instanceof Error
        ? `MIDIの読み込みに失敗しました: ${err.message}`
        : 'MIDIの読み込みに失敗しました。',
    )
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void loadFile(file)
})

sampleBtn.addEventListener('click', async () => {
  clearError()
  sampleBtn.disabled = true
  try {
    const url = `${import.meta.env.BASE_URL}samples/nandodemo.mid`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buffer = await res.arrayBuffer()
    const file = new File([buffer], 'nandodemo.mid', { type: 'audio/midi' })
    await loadFile(file)
  } catch (err) {
    showError(
      err instanceof Error
        ? `サンプルの読み込みに失敗しました: ${err.message}`
        : 'サンプルの読み込みに失敗しました。',
    )
  } finally {
    sampleBtn.disabled = false
  }
})

;['dragenter', 'dragover'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault()
    dropzone.classList.add('dragover')
  })
})

;['dragleave', 'drop'].forEach((ev) => {
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault()
    dropzone.classList.remove('dragover')
  })
})

dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0]
  if (file) void loadFile(file)
})

trackSelect.addEventListener('change', regenerate)
arrayNameInput.addEventListener('input', regenerate)
formatSelect.addEventListener('change', regenerate)

playBtn.addEventListener('click', () => {
  if (preview.isPlaying) {
    preview.stop()
    setPlayingUi(false)
    return
  }
  if (currentPairs.length === 0) return
  clearError()
  void preview
    .play(currentPairs, () => setPlayingUi(false))
    .then(() => setPlayingUi(true))
    .catch((err: unknown) => {
      setPlayingUi(false)
      showError(
        err instanceof Error
          ? `再生に失敗しました: ${err.message}`
          : '再生に失敗しました。',
      )
    })
})

stopBtn.addEventListener('click', () => {
  preview.stop()
  setPlayingUi(false)
})

copyBtn.addEventListener('click', async () => {
  const text = output.textContent ?? ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copyBtn.textContent = 'コピー済み'
    copyBtn.classList.add('copied')
    setTimeout(() => {
      copyBtn.textContent = 'コピー'
      copyBtn.classList.remove('copied')
    }, 1500)
  } catch {
    showError('クリップボードへのコピーに失敗しました。')
  }
})

downloadBtn.addEventListener('click', () => {
  const text = output.textContent ?? ''
  if (!text) return
  const format = currentFormat()
  const base = sanitizeArrayName(arrayNameInput.value)
  const filename = format === 'waterbear' ? `${base}.s` : `${base}.c`
  const mime = format === 'waterbear' ? 'text/plain' : 'text/x-c'
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
})
