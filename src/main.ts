import './style.css'
import {
  convertTrack,
  listTracks,
  melodyToCSource,
  parseMidiFile,
  type TrackInfo,
} from './midiToVmu'
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
      <button type="button" id="copy" disabled>コピー</button>
    </div>
    <pre id="output"></pre>
  </div>

  <footer>
    単音メロディ想定。重なるノートは開始が早いものを優先し、次のノート開始で打ち切ります。
  </footer>
`

const dropzone = document.querySelector<HTMLDivElement>('#dropzone')!
const fileInput = document.querySelector<HTMLInputElement>('#file')!
const options = document.querySelector<HTMLDivElement>('#options')!
const trackSelect = document.querySelector<HTMLSelectElement>('#track')!
const arrayNameInput = document.querySelector<HTMLInputElement>('#arrayName')!
const meta = document.querySelector<HTMLParagraphElement>('#meta')!
const errorEl = document.querySelector<HTMLDivElement>('#error')!
const outputSection = document.querySelector<HTMLDivElement>('#outputSection')!
const output = document.querySelector<HTMLPreElement>('#output')!
const copyBtn = document.querySelector<HTMLButtonElement>('#copy')!

let currentMidi: Midi | null = null
let currentFileName = ''
let tracks: TrackInfo[] = []

function showError(message: string) {
  errorEl.textContent = message
  errorEl.classList.remove('hidden')
}

function clearError() {
  errorEl.textContent = ''
  errorEl.classList.add('hidden')
}

function regenerate() {
  if (!currentMidi || tracks.length === 0) return

  const trackIndex = Number(trackSelect.value)
  const arrayName = sanitizeArrayName(arrayNameInput.value)
  const pairs = convertTrack(currentMidi, trackIndex)
  const code = melodyToCSource(pairs, arrayName)

  output.textContent = code
  outputSection.classList.remove('hidden')
  copyBtn.disabled = pairs.length === 0

  const track = tracks.find((t) => t.index === trackIndex)
  meta.textContent = `${currentFileName} / ${track?.name ?? ''} — ノート ${track?.noteCount ?? 0} → ペア ${pairs.length}`
}

function sanitizeArrayName(raw: string): string {
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_]/g, '_')
  if (!cleaned) return 'vmu_melody'
  if (/^[0-9]/.test(cleaned)) return `vmu_${cleaned}`
  return cleaned
}

async function loadFile(file: File) {
  clearError()
  try {
    currentMidi = await parseMidiFile(file)
    currentFileName = file.name
    tracks = listTracks(currentMidi)

    if (tracks.length === 0) {
      showError('ノートを含むトラックが見つかりませんでした。')
      options.classList.add('hidden')
      outputSection.classList.add('hidden')
      copyBtn.disabled = true
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
