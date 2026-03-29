interface Props {
  current: number // 0-indexed: 0=Address, 1=Amount, 2=Confirm, 3=Done
}

const STEPS = ['Address', 'Amount', 'Confirm', 'Done']

export function StepIndicator({ current }: Props) {
  return (
    <div className="step-indicator">
      {STEPS.map((label, i) => (
        <div key={i} className="step-item">
          <div className={`step-node ${i < current ? 'done' : i === current ? 'active' : ''}`}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`step-label ${i === current ? 'active' : ''}`}>{label}</span>
          {i < STEPS.length - 1 && (
            <div className={`step-connector ${i < current ? 'done' : ''}`} />
          )}
        </div>
      ))}
    </div>
  )
}
