import {
  interestBadgeClass,
  interestLabel,
  matchKindBadgeClass,
  matchKindLabel,
  salesFlowBadgeClass,
  salesFlowLabel,
} from '../lib/operatorDisplay'

export function SalesFlowBadge({ state }: { state: string | null | undefined }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${salesFlowBadgeClass(state)}`}
    >
      {salesFlowLabel(state)}
    </span>
  )
}

export function MatchBadge({ matchKind }: { matchKind: string | null | undefined }) {
  const label = matchKindLabel(matchKind)
  if (!label) return null
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${matchKindBadgeClass(matchKind)}`}
    >
      {label}
    </span>
  )
}

export function InterestBadge({ score }: { score: number | null | undefined }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${interestBadgeClass(score)}`}
    >
      {interestLabel(score)}
    </span>
  )
}
