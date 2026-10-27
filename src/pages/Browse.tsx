import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { LEVELS, type EntryType, type Level, type Status } from '../data/types'
import { LEVEL_META, TYPE_LABEL, loadAllIndexes, loadIndex, searchIndex, type IndexItem } from '../lib/content'
import { useAsync, useDebounced } from '../lib/hooks'
import { isDue } from '../lib/srs'
import { useStore } from '../store/progress'
import { EntryList } from '../components/EntryList'
import { Chip, Empty, Page, Spinner } from '../components/ui'

type Filter = 'all' | 'new' | 'learning' | 'known' | 'due' | 'bookmarked'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'due', label: '복습 예정' },
  { key: 'learning', label: '학습 중' },
  { key: 'new', label: '새 단어' },
  { key: 'known', label: '아는 단어' },
  { key: 'bookmarked', label: '★ 북마크' },
]
const PAGE = 60

export default function Browse() {
  const params = useParams<{ level?: string }>()
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const settingsLevel = useStore((s) => s.settings.level)
  const setSettings = useStore((s) => s.setSettings)

  const level = (params.level === 'all' ? 'all' : (LEVELS.find((l) => l === params.level) ?? settingsLevel)) as Level | 'all'
  const filter = (sp.get('filter') as Filter) || 'all'
  const type = (sp.get('type') as EntryType | 'all') || 'all'
  const [q, setQ] = useState(sp.get('q') ?? '')
  const dq = useDebounced(q, 150)
  const [shown, setShown] = useState(PAGE)

  const { data, loading } = useAsync(() => (level === 'all' ? loadAllIndexes() : loadIndex(level)), [level])
  const progress = useStore((s) => s.progress)

  useEffect(() => {
    setShown(PAGE)
  }, [level, filter, type, dq])

  const filtered = useMemo(() => {
    if (!data) return []
    let list: IndexItem[] = data
    if (type !== 'all') list = list.filter((e) => e.t === type)
    if (filter !== 'all') {
      const now = Date.now()
      list = list.filter((e) => {
        const p = progress[e.id]
        const st: Status = p?.status ?? 'new'
        switch (filter) {
          case 'new':
            return st === 'new'
          case 'learning':
            return st === 'learning' || st === 'review'
          case 'known':
            return st === 'known'
          case 'due':
            return isDue(p, now)
          case 'bookmarked':
            return !!p?.bookmarked
        }
        return true
      })
    }
    return searchIndex(list, dq)
  }, [data, filter, type, dq, progress])

  function setParam(k: string, v: string) {
    const next = new URLSearchParams(sp)
    if (!v || v === 'all') next.delete(k)
    else next.set(k, v)
    setSp(next, { replace: true })
  }

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of data ?? []) c[e.t] = (c[e.t] ?? 0) + 1
    return c
  }, [data])

  return (
    <Page title="단어장">
      <div className="sticky top-12 z-10 -mx-4 bg-slate-50/95 px-4 pb-2 backdrop-blur dark:bg-slate-950/95">
        <div className="relative">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setParam('q', e.target.value)
            }}
            placeholder="단어, 뜻, 예문 검색"
            inputMode="search"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-[15px] outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
          />
          <svg className="absolute left-3 top-3 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          {q && (
            <button type="button" aria-label="지우기" onClick={() => { setQ(''); setParam('q', '') }} className="absolute right-2 top-2 rounded-full p-1 text-slate-400">
              ✕
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 sm:flex-wrap sm:overflow-visible">
          {(['all', ...LEVELS] as (Level | 'all')[]).map((lv) => (
            <Chip
              key={lv}
              active={level === lv}
              onClick={() => {
                if (lv !== 'all') setSettings({ level: lv })
                nav(`/browse/${lv}?${sp.toString()}`, { replace: true })
              }}
            >
              {lv === 'all' ? '전체 레벨' : LEVEL_META[lv].label}
            </Chip>
          ))}
        </div>
        <div className="no-scrollbar -mx-4 mt-1.5 flex gap-1.5 overflow-x-auto px-4 sm:flex-wrap sm:overflow-visible">
          {FILTERS.map((f) => (
            <Chip key={f.key} active={filter === f.key} onClick={() => setParam('filter', f.key)} className="!py-1 text-xs">
              {f.label}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
          {(['all', 'word', 'phrasal', 'idiom', 'collocation'] as const).map((t) =>
            t === 'all' || typeCounts[t] ? (
              <Chip key={t} active={type === t} onClick={() => setParam('type', t)} className="!py-1 text-xs">
                {t === 'all' ? '모든 유형' : TYPE_LABEL[t]}
              </Chip>
            ) : null,
          )}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Empty title="결과가 없습니다" desc={data?.length ? '검색어나 필터를 바꿔 보세요.' : '이 레벨의 콘텐츠가 아직 없습니다.'} />
      ) : (
        <>
          <p className="mb-2 mt-1 text-xs text-slate-500">{filtered.length.toLocaleString()}개</p>
          <EntryList items={filtered.slice(0, shown)} showLevel={level === 'all'} />
          {shown < filtered.length && (
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              더 보기 ({filtered.length - shown}개 남음)
            </button>
          )}
        </>
      )}
    </Page>
  )
}
