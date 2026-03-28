document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const selector = button.getAttribute('data-copy')
    if (!selector) return

    const source = document.querySelector(selector)
    if (!source) return

    try {
      await navigator.clipboard.writeText(source.textContent || '')
      const original = button.textContent
      button.textContent = 'Copied'
      setTimeout(() => {
        button.textContent = original
      }, 1200)
    } catch {
      button.textContent = 'Copy failed'
      setTimeout(() => {
        button.textContent = 'Copy'
      }, 1200)
    }
  })
})

const currentPath = window.location.pathname.replace(/index\.html$/, '')
document.querySelectorAll('[data-nav]').forEach((link) => {
  const href = link.getAttribute('href')
  if (!href) return
  const normalized = new URL(href, window.location.origin).pathname.replace(/index\.html$/, '')
  if (normalized === currentPath) {
    link.classList.add('active')
  }
})
