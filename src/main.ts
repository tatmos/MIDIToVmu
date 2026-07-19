import './style.css'
import {
  convertTrack,
  listTracks,
  melodyToCSource,
  parseMidiFile,
  type MelodyPair,
  type TrackInfo,
} from './midiToVmu'
import { MelodyPreview } from './preview'
import type { Midi } from '@tonejs/midi'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <header>
    <h1>MIDIToVMU</h1>
    <p>MIDIファイルをVMU用メロディ配列（Cソース）に変換します</p>
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
        配列名
        <input type="text" id="arrayName" value="vmu_melody" spellcheck="false" />
      </label>
    </div>
    <p class="meta" id="meta"></p>
  </div>

  <div class="error hidden" id="error"></div>

  <div class="hidden" id="outputSection">
    <div class="output-header">
      <h2>生成コード</h2>
      <div class="output-actions">
        <button type="button" id="play" disabled>プレビュー再生</button>
        <button type="button" id="stop" class="secondary" disabled>停止</button>
        <button type="button" id="copy" disabled>コピー</button>
      </div>
    </div>
    <pre id="output"></pre>
  </div>

  <footer>
    単音メロディ想定。重なるノートは開始が早いものを優先し、次のノート開始で打ち切ります。
    プレビューはブラウザ上の矩形波で、実機VMUの音質とは異なります。
  </footer>
`

const dropzone = document.querySelector<HTMLDivElement>('#dropzone')!
const fileInput = document.querySelector<HTMLInputElement>('#file')!
const sampleBtn = document.querySelector<HTMLButtonElement>('#sample')!
const options = document.querySelector<HTMLDivElement>('#options')!
const trackSelect = document.querySelector<HTMLSelectElement>('#track')!
const arrayNameInput = document.querySelector<HTMLInputElement>('#arrayName')!
const meta = document.querySelector<HTMLParagraphElement>('#meta')!
const errorEl = document.querySelector<HTMLDivElement>('#error')!
const outputSection = document.querySelector<HTMLDivElement>('#outputSection')!
const output = document.querySelector<HTMLPreElement>('#output')!
const copyBtn = document.querySelector<HTMLButtonElement>('#copy')!
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

function regenerate() {
  if (!currentMidi || tracks.length === 0) return

  preview.stop()
  setPlayingUi(false)

  const trackIndex = Number(trackSelect.value)
  const arrayName = sanitizeArrayName(arrayNameInput.value)
  currentPairs = convertTrack(currentMidi, trackIndex)
  const code = melodyToCSource(currentPairs, arrayName)

  output.textContent = code
  outputSection.classList.remove('hidden')
  copyBtn.disabled = currentPairs.length === 0
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
