interface Props {
  message: string
}

export function ErrorBanner({ message }: Props) {
  return (
    <div className="error-banner">
      <span className="error-banner-icon">⚠</span>
      <span className="error-banner-text">{message}</span>
    </div>
  )
}
