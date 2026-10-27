// 표제어 대소문자 보정: pnpm fix:case <dir-or-file.jsonl>...
// 워드리스트는 전부 소문자라 고유명사·약어가 소문자로 들어온다. 표시용 표기로 바꾼다 (id 는 그대로).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Entry } from '../src/data/types.ts'

const MAP: Record<string, string> = {
  english: 'English', pe: 'PE', mr: 'Mr.', mrs: 'Mrs.', ms: 'Ms.', dr: 'Dr.', tv: 'TV', ok: 'OK', dvd: 'DVD', cd: 'CD', pc: 'PC', usa: 'USA', uk: 'UK',
  i: 'I', 't-shirt': 'T-shirt', 'o\'clock': "o'clock", 'i\'m': 'I\'m', 'k-pop': 'K-pop', atm: 'ATM', bbq: 'BBQ', 'x-ray': 'X-ray', 'wi-fi': 'Wi-Fi', wifi: 'Wi-Fi', sns: 'SNS', id: 'ID', 'am': 'a.m.', 'pm': 'p.m.',
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
  january: 'January', february: 'February', march: 'March', april: 'April', june: 'June', july: 'July', august: 'August', september: 'September', october: 'October', november: 'November', december: 'December',
  christmas: 'Christmas', easter: 'Easter', halloween: 'Halloween', "new year's day": "New Year's Day", "valentine's day": "Valentine's Day", 'new year': 'New Year',
  korea: 'Korea', korean: 'Korean', america: 'America', american: 'American', china: 'China', chinese: 'Chinese', japan: 'Japan', japanese: 'Japanese', england: 'England', british: 'British', french: 'French', france: 'France', germany: 'Germany', german: 'German', spanish: 'Spanish', spain: 'Spain', europe: 'Europe', asia: 'Asia', africa: 'Africa', seoul: 'Seoul', internet: 'Internet',
  'the rubicon': 'the Rubicon', 'cross the rubicon': 'cross the Rubicon', 'a sword of damocles': 'a sword of Damocles', 'a pyrrhic victory': 'a Pyrrhic victory', 'achilles heel': 'Achilles heel', "achilles' heel": "Achilles' heel", 'pandora\'s box': 'Pandora\'s box', 'catch-22': 'Catch-22', 'a catch-22': 'a Catch-22',
}
// 비즈니스 약어는 해당 레벨에서만 보정한다. pm은 시간 표기(p.m.)와 구분한다.
const BUSINESS_MAP: Record<string, string> = {
  ...Object.fromEntries([
    'cc', 'bcc', 'fyi', 'asap', 'eod', 'eow', 'cob', 'tbd', 'tba', 'tbc', 'eta', 'ooo', 'batna',
    'rfp', 'rfq', 'msrp', 'rrp', 'arr', 'mrr', 'po', 'usp', 'ctr', 'cpc', 'cpm', 'cpa',
    'roi', 'roas', 'cta', 'seo', 'sku', 'pr', 'p&l', 'cfo', 'cogs', 'capex', 'opex', 'ebitda',
    'ipo', 'yoy', 'vat', 'pto', 'kpi', 'okr', 'pip', 'dei', 'wfh', 'pm', 'api', 'sla',
    '2fa', 'sso', 'wbs', 'mvp', 'poc', 'fte', 'p0', 'qa', 'uat', 'sop', 'nda', 'loi',
    'mou', 'sow', 'llc', 'agm', 'gdpr', 'r&d', 'm&a', 'esg', 'csr', 'fob', 'rma',
    'wip', 'erp', 'oem', 'csat', 'nps', 'clv', 'q&a', 'tgif',
  ].map((word) => [word, word.toUpperCase()])),
  'n/a': 'N/A', 'a/b test': 'A/B test',
  'series a': 'Series A', 'c-suite': 'C-suite', 'gantt chart': 'Gantt chart',
  'plan b': 'plan B', 'band-aid': 'Band-Aid', 'rag status': 'RAG status',
  'act of god': 'act of God', 'swot analysis': 'SWOT analysis',
  'six sigma': 'Six Sigma', incoterms: 'Incoterms',
}
// 문맥에 따라 다른 것: may(5월 vs 조동사), march(3월 vs 행진), august(8월 vs 위엄있는), turkey(터키 vs 칠면조)
function fix(e: Entry): string | null {
  const hw = e.headword
  const lower = hw.toLowerCase()
  if (hw !== lower) return null // 이미 대소문자가 있음
  if (e.level === 'business' && BUSINESS_MAP[lower]) return BUSINESS_MAP[lower]
  if (lower === 'may') return e.senses.some((s) => s.meaningKo.includes('5월')) ? 'May' : null
  if (lower === 'march') return e.senses.some((s) => s.meaningKo.includes('3월')) && !e.senses.some((s) => s.meaningKo.includes('행진')) ? 'March' : null
  if (lower === 'august') return e.senses.some((s) => s.meaningKo.includes('8월')) ? 'August' : null
  if (lower === 'turkey') return e.senses.some((s) => s.meaningKo.includes('터키') || s.meaningKo.includes('튀르키예')) && e.senses.length === 1 ? 'Turkey' : null
  return MAP[lower] ?? null
}

const targets = process.argv.slice(2).flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith('.jsonl')).map((f) => join(p, f)) : [p]))
let changed = 0
for (const file of targets) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const out = lines.map((raw) => {
    if (!raw.trim()) return raw
    const e = JSON.parse(raw) as Entry
    const nh = fix(e)
    if (!nh) return raw
    changed++
    console.log(`  ${file.split('/').pop()}: ${e.headword} → ${nh}`)
    return JSON.stringify({ ...e, headword: nh })
  })
  writeFileSync(file, out.join('\n'))
}
console.log(`대소문자 보정 ${changed}건`)
