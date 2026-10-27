import { useEffect, useRef, useState } from 'react'
import { LEVELS } from '../data/types'
import { LEVEL_META } from '../lib/content'
import { getEnglishVoices, isTTSSupported, onVoicesChanged, speak } from '../lib/tts'
import { STORAGE_KEY, useStore } from '../store/progress'
import { STORAGE_BACKEND, requestPersistentStorage, storageInfo } from '../store/storage'
import { Button, Card, Chip, Page, cx } from '../components/ui'

export default function Settings() {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const exportAll = useStore((s) => s.exportAll)
  const importAll = useStore((s) => s.importAll)
  const resetAll = useStore((s) => s.resetAll)
  const progress = useStore((s) => s.progress)
  const daily = useStore((s) => s.daily)
  const [voices, setVoices] = useState(getEnglishVoices())
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [store, setStore] = useState<Awaited<ReturnType<typeof storageInfo>> | null>(null)
  useEffect(() => {
    storageInfo().then(setStore)
  }, [])

  useEffect(() => onVoicesChanged(() => setVoices(getEnglishVoices())), [])

  const counts = { total: Object.keys(progress).length, known: 0, learning: 0, bookmarked: 0 }
  for (const p of Object.values(progress)) {
    if (p.status === 'known') counts.known++
    else if (p.status !== 'new') counts.learning++
    if (p.bookmarked) counts.bookmarked++
  }
  const days = Object.keys(daily).length
  const streak = (() => {
    let n = 0
    const d = new Date()
    for (;;) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const s = daily[k]
      if (s && (s.reviews > 0 || s.quizTotal > 0)) {
        n++
        d.setDate(d.getDate() - 1)
      } else break
    }
    return n
  })()

  function download() {
    const blob = new Blob([exportAll()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eng-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    try {
      const r = importAll(JSON.parse(await f.text()))
      setMsg(r.message)
    } catch {
      setMsg('파일을 읽을 수 없습니다.')
    }
  }

  return (
    <Page title="설정">
      <div className="flex flex-col gap-3">
        <Card>
          <p className="text-sm font-semibold">학습 기록</p>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center">
            <Mini label="아는 단어" v={counts.known} />
            <Mini label="학습 중" v={counts.learning} />
            <Mini label="북마크" v={counts.bookmarked} />
            <Mini label="연속 학습" v={`${streak}일`} />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            총 {days}일 학습 · 기록은 이 브라우저({STORAGE_BACKEND === 'indexeddb' ? 'IndexedDB' : 'localStorage'})에만 저장됩니다. 기기를 바꾸려면 아래에서 내보내기/불러오기를 사용하세요.
          </p>
          {store && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
              {store.persisted === true ? (
                <span className="text-emerald-600">✓ 영구 저장 승인됨</span>
              ) : store.persisted === false ? (
                <>
                  <span className="text-amber-600">영구 저장 미승인 (오래 안 쓰면 브라우저가 지울 수 있음)</span>
                  <button type="button" className="underline" onClick={() => requestPersistentStorage().then(() => storageInfo().then(setStore))}>
                    요청
                  </button>
                </>
              ) : null}
              {store.usage != null && <span>· 사용량 {(store.usage / 1024).toFixed(0)}KB</span>}
            </p>
          )}
        </Card>

        <Card>
          <p className="text-sm font-semibold">음성 (TTS)</p>
          {!isTTSSupported() ? (
            <p className="mt-1 text-sm text-rose-600">이 브라우저는 음성 합성을 지원하지 않습니다.</p>
          ) : (
            <>
              <label className="mt-2 block text-xs text-slate-500">목소리</label>
              <select
                value={settings.voiceURI ?? ''}
                onChange={(e) => setSettings({ voiceURI: e.target.value || undefined })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">자동 (권장 영어 음성)</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang}){v.localService ? '' : ' · 온라인'}
                  </option>
                ))}
              </select>
              {voices.length === 0 && <p className="mt-1 text-xs text-amber-600">영어 음성을 찾지 못했습니다. 기기 설정에서 영어 음성을 설치하면 더 자연스럽게 들립니다.</p>}
              <label className="mt-3 block text-xs text-slate-500">속도: {settings.rate.toFixed(2)}x</label>
              <input type="range" min={0.6} max={1.3} step={0.05} value={settings.rate} onChange={(e) => setSettings({ rate: Number(e.target.value) })} className="mt-1 w-full accent-brand-600" />
              <div className="mt-2 flex items-center justify-between">
                <Button variant="secondary" onClick={() => speak('Could you run that by me one more time?', { rate: settings.rate, voiceURI: settings.voiceURI })}>
                  🔊 미리 듣기
                </Button>
                <Toggle label="카드 뒤집을 때 자동 재생" on={settings.autoSpeak} onChange={(v) => setSettings({ autoSpeak: v })} />
              </div>
            </>
          )}
        </Card>

        <Card>
          <p className="text-sm font-semibold">학습</p>
          <label className="mt-2 block text-xs text-slate-500">하루 새 단어 목표: {settings.dailyNew}개</label>
          <input type="range" min={5} max={50} step={5} value={settings.dailyNew} onChange={(e) => setSettings({ dailyNew: Number(e.target.value) })} className="mt-1 w-full accent-brand-600" />
          <label className="mt-3 block text-xs text-slate-500">플래시카드 앞면</label>
          <div className="mt-1 flex gap-2">
            <Chip active={settings.frontSide === 'en'} onClick={() => setSettings({ frontSide: 'en' })}>영어 단어 → 뜻</Chip>
            <Chip active={settings.frontSide === 'ko'} onClick={() => setSettings({ frontSide: 'ko' })}>한국어 뜻 → 단어</Chip>
          </div>
          <label className="mt-3 block text-xs text-slate-500">기본 레벨</label>
          <div className="no-scrollbar -mx-4 mt-1 flex gap-1.5 overflow-x-auto px-4 sm:flex-wrap sm:overflow-visible">
            {LEVELS.map((lv) => (
              <Chip key={lv} active={settings.level === lv} onClick={() => setSettings({ level: lv })}>{LEVEL_META[lv].label}</Chip>
            ))}
          </div>
          <label className="mt-3 block text-xs text-slate-500">테마</label>
          <div className="mt-1 flex gap-2">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <Chip key={t} active={settings.theme === t} onClick={() => setSettings({ theme: t })}>{{ system: '시스템', light: '라이트', dark: '다크' }[t]}</Chip>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold">백업</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={download}>내보내기 (JSON)</Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>불러오기</Button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          {msg && <p className="mt-2 text-sm text-brand-600 dark:text-brand-100">{msg}</p>}
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            {!confirmReset ? (
              <Button variant="ghost" className="text-rose-600" onClick={() => setConfirmReset(true)}>학습 기록 모두 지우기</Button>
            ) : (
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm text-rose-600">정말 지울까요? 되돌릴 수 없습니다.</p>
                <Button variant="danger" onClick={() => { resetAll(); setConfirmReset(false); setMsg('학습 기록을 지웠습니다.') }}>지우기</Button>
                <Button variant="secondary" onClick={() => setConfirmReset(false)}>취소</Button>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold">제작자 정보</h2>
          <dl className="mt-3 text-sm">
            <div className="flex items-baseline gap-4">
              <dt className="shrink-0 text-slate-500 dark:text-slate-400">제작자</dt>
              <dd className="font-medium">cheolcheo</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Eng는 한국어로 뜻과 예문을 살펴보며, 일상부터 비즈니스까지 영어를 꾸준히 익힐 수 있는 학습 앱입니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <a
              href="https://github.com/zlcjfalsvk"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded text-brand-600 underline underline-offset-4 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600 dark:text-brand-100 dark:hover:text-white"
            >
              GitHub 프로필 <span className="sr-only">(새 탭에서 열기)</span><span aria-hidden="true">↗</span>
            </a>
            <a
              href="https://github.com/zlcjfalsvk/eng-study/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded text-brand-600 underline underline-offset-4 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600 dark:text-brand-100 dark:hover:text-white"
            >
              의견 보내기 <span className="sr-only">(GitHub에서 새 탭으로 열기)</span><span aria-hidden="true">↗</span>
            </a>
          </div>
        </Card>

        <p className="px-1 text-center text-xs text-slate-400">
          Eng v{__APP_VERSION__} · 저장 키 <code className="font-mono">{STORAGE_KEY}</code>
        </p>
      </div>
    </Page>
  )
}

function Mini({ label, v }: { label: string; v: number | string }) {
  return (
    <div className="rounded-xl bg-slate-50 py-2 dark:bg-slate-800/60">
      <p className="text-lg font-bold">{v}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  )
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 text-sm">
      <span className={cx('relative inline-block h-6 w-10 rounded-full transition', on ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700')}>
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition', on ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
    </button>
  )
}
