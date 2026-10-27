import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { LEVELS, type Level } from '../data/types'
import { LEVEL_META, loadGrammar } from '../lib/content'
import { useAsync } from '../lib/hooks'
import { useStore } from '../store/progress'
import { SpeakButton } from '../components/SpeakButton'
import { Card, Chip, Empty, LevelBadge, Page, Spinner, cx } from '../components/ui'

export default function Grammar() {
  const { data, loading } = useAsync(loadGrammar, [])
  const read = useStore((s) => s.grammarRead)
  const [level, setLevel] = useState<Level | 'all'>('all')
  const [cat, setCat] = useState<string>('all')

  const cats = useMemo(() => Array.from(new Set((data ?? []).map((t) => t.category))), [data])
  const list = (data ?? []).filter((t) => (level === 'all' || t.level === level) && (cat === 'all' || t.category === cat))

  return (
    <Page title="문법 정리">
      <div className="no-scrollbar -mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 sm:flex-wrap sm:overflow-visible">
        <Chip active={level === 'all'} onClick={() => setLevel('all')}>전체</Chip>
        {LEVELS.map((lv) => (
          <Chip key={lv} active={level === lv} onClick={() => setLevel(lv)}>{LEVEL_META[lv].label}</Chip>
        ))}
      </div>
      {cats.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 sm:flex-wrap sm:overflow-visible">
          <Chip active={cat === 'all'} onClick={() => setCat('all')} className="!py-1 text-xs">모든 분류</Chip>
          {cats.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)} className="!py-1 text-xs">{c}</Chip>
          ))}
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title="문법 주제가 없습니다" />
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((t) => (
            <Link key={t.id} to={`/grammar/${t.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <LevelBadge level={t.level} />
                <span className="text-[11px] text-slate-500">{t.category}</span>
                {read[t.id] && <span className="ml-auto text-xs text-emerald-600">✓ 읽음</span>}
              </div>
              <p className="mt-1.5 font-semibold">{t.titleKo}</p>
              <p className="text-xs text-slate-400">{t.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{t.summary}</p>
            </Link>
          ))}
        </div>
      )}
    </Page>
  )
}

export function GrammarDetail() {
  const { id = '' } = useParams()
  const { data, loading } = useAsync(loadGrammar, [])
  const markRead = useStore((s) => s.markGrammarRead)
  const topic = data?.find((t) => t.id === id)
  if (loading) return <Page title=" " back><Spinner /></Page>
  if (!topic) return <Page title="문법" back="/grammar"><Empty title="주제를 찾을 수 없습니다" /></Page>
  const m = LEVEL_META[topic.level]
  const idx = data!.findIndex((t) => t.id === id)
  const next = data![idx + 1]

  return (
    <Page title={topic.titleKo} back="/grammar">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <LevelBadge level={topic.level} />
          <span className="text-xs text-slate-500">{topic.category}</span>
        </div>
        <h2 className="mt-2 text-2xl font-bold">{topic.titleKo}</h2>
        <p className="text-sm text-slate-400">{topic.title}</p>
        <p className="mt-2 text-[15px] text-slate-700 dark:text-slate-200">{topic.summary}</p>
      </div>

      <div className="flex flex-col gap-3">
        {topic.sections.map((sec, i) => (
          <Card key={i}>
            <h3 className={cx('font-semibold', m.color)}>{sec.heading}</h3>
            <div className="mt-1.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
              <Md text={sec.body} />
            </div>
            {sec.examples.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {sec.examples.map((x, j) => (
                  <li key={j} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                    <div className="flex gap-2.5">
                      <SpeakButton text={x.en} size="sm" className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[15px] leading-snug">{x.en}</p>
                        <p className="mt-0.5 text-sm text-slate-500">{x.ko}</p>
                      </div>
                    </div>
                    {x.wrong && (
                      <p className="mt-2 pl-9 text-sm text-rose-600 dark:text-rose-300">
                        ✗ <span className="line-through decoration-rose-400">{x.wrong}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}

        {topic.pitfalls?.length ? (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
            <h3 className="font-semibold text-amber-900 dark:text-amber-100">⚠️ 한국인이 자주 틀리는 포인트</h3>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-amber-900 dark:text-amber-100">
              {topic.pitfalls.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => markRead(topic.id)} className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-[0.98]">
          ✓ 읽음으로 표시
        </button>
        {next && (
          <Link to={`/grammar/${next.id}`} onClick={() => markRead(topic.id)} className="flex-1 rounded-xl bg-white py-3 text-center text-sm font-semibold ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
            다음: {next.titleKo} →
          </Link>
        )}
      </div>
    </Page>
  )
}

/** 아주 작은 마크다운: **굵게**, `코드`, 줄바꿈, "- " 불릿 */
function Md({ text }: { text: string }) {
  const lines = text.split(/\n/)
  return (
    <>
      {lines.map((line, i) => {
        const isBullet = /^\s*[-•]\s+/.test(line)
        const content = line.replace(/^\s*[-•]\s+/, '')
        const parts = content.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, j) => {
          if (p.startsWith('**')) return <b key={j}>{p.slice(2, -2)}</b>
          if (p.startsWith('`')) return <code key={j} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[13px] dark:bg-slate-800">{p.slice(1, -1)}</code>
          return p
        })
        return isBullet ? (
          <p key={i} className="flex gap-1.5 pl-1"><span>•</span><span>{parts}</span></p>
        ) : (
          <p key={i} className={cx(i > 0 && 'mt-1.5')}>{parts}</p>
        )
      })}
    </>
  )
}
