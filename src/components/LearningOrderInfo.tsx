export function LearningOrderInfo({ className = '' }: { className?: string }) {
  return (
    <details className={`rounded-xl bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400 ${className}`}>
      <summary className="cursor-pointer rounded font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">추천순 기준</summary>
      <p className="mt-2">
        레벨별 핵심 어휘·표현을 먼저 익히고, 이후에는 일반 영어의 사용 빈도를 참고해 학습합니다.
        비즈니스 핵심 목록은 회의·이메일·계약 등 업무 활용도를 반영했습니다.
        표현의 빈도는 구성 단어로 추정하므로 실제 표현의 사용 빈도와 다를 수 있습니다.
      </p>
      <p className="mt-2">
        빈도 자료: wordfreq 3.1.1 · Robyn Speer (약 2021년까지의 자료).{' '}
        <a href={`${import.meta.env.BASE_URL}learning-order-sources.txt`} target="_blank" rel="noopener noreferrer" className="rounded underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          출처·라이선스<span className="sr-only"> (새 탭에서 열기)</span>
        </a>
      </p>
    </details>
  )
}
