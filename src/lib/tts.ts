// 브라우저 내장 Web Speech API 로 영어 예문을 읽어 준다. 서버·API 키 불필요.

let voices: SpeechSynthesisVoice[] = []
const listeners = new Set<() => void>()

function refresh() {
  if (typeof speechSynthesis === 'undefined') return
  voices = speechSynthesis.getVoices()
  listeners.forEach((l) => l())
}

if (typeof speechSynthesis !== 'undefined') {
  refresh()
  speechSynthesis.addEventListener?.('voiceschanged', refresh)
}

export function isTTSSupported() {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function getEnglishVoices(): SpeechSynthesisVoice[] {
  if (!voices.length) refresh()
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name))
}

export function onVoicesChanged(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

// 자연스러운 음성을 우선 고른다 (macOS/iOS: Samantha·Ava, Chrome: Google US English, Windows: Aria/Jenny 등)
const PREFERRED = [/samantha/i, /ava/i, /allison/i, /google us english/i, /aria/i, /jenny/i, /guy/i, /zira/i, /natural/i, /premium/i, /enhanced/i]
function scoreVoice(v: SpeechSynthesisVoice) {
  let s = 0
  if (v.lang.toLowerCase() === 'en-us') s += 20
  else if (v.lang.toLowerCase().startsWith('en-')) s += 10
  if (v.localService) s += 2
  PREFERRED.forEach((re, i) => {
    if (re.test(v.name)) s += 30 - i
  })
  return s
}

export function pickVoice(voiceURI?: string): SpeechSynthesisVoice | undefined {
  const en = getEnglishVoices()
  if (voiceURI) {
    const found = en.find((v) => v.voiceURI === voiceURI)
    if (found) return found
  }
  return en[0]
}

export interface SpeakOptions {
  rate?: number
  voiceURI?: string
  onEnd?: () => void
}

export function speak(text: string, opts: SpeakOptions = {}) {
  if (!isTTSSupported()) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  const v = pickVoice(opts.voiceURI)
  if (v) u.voice = v
  u.rate = opts.rate ?? 0.95
  u.pitch = 1
  if (opts.onEnd) u.onend = opts.onEnd
  // Chrome 버그 회피: cancel 직후 speak 가 무시되는 경우가 있어 한 틱 늦춘다
  setTimeout(() => speechSynthesis.speak(u), 0)
}

export function stopSpeaking() {
  if (isTTSSupported()) speechSynthesis.cancel()
}
