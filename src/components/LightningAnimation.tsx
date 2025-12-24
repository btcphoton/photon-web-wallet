import { useEffect, useRef } from 'react'

interface LightningAnimationProps {
    size?: number
}

export const LightningAnimation = ({ size = 280 }: LightningAnimationProps) => {
    const emojiRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const particlesRef = useRef<any[]>([])
    const sparksRef = useRef<any[]>([])
    const animationIdRef = useRef<number | null>(null)

    const electricColors = [
        '#FFD700', '#FFFF00', '#FFA500', '#FF4500',
        '#FF6347', '#FF0000', '#00FFFF', '#FFFFFF'
    ]

    useEffect(() => {
        let pulseEnabled = true
        let sparksEnabled = true
        let animationSpeed = 1.0

        const createParticle = (x?: number, y?: number) => {
            if (!containerRef.current) return

            const particle = document.createElement('div')
            particle.style.position = 'absolute'
            particle.style.borderRadius = '50%'
            particle.style.pointerEvents = 'none'

            const particleSize = Math.random() * 6 + 2
            particle.style.width = `${particleSize}px`
            particle.style.height = `${particleSize}px`

            if (x && y) {
                particle.style.left = `${x}px`
                particle.style.top = `${y}px`
            } else {
                const containerRect = containerRef.current.getBoundingClientRect()
                particle.style.left = `${Math.random() * containerRect.width}px`
                particle.style.top = `${Math.random() * containerRect.height}px`
            }

            const color = electricColors[Math.floor(Math.random() * electricColors.length)]
            particle.style.backgroundColor = color
            particle.style.opacity = '0.8'

            const duration = (Math.random() * 3 + 2) / animationSpeed
            const angle = Math.random() * Math.PI * 2
            const distance = Math.random() * 100 + 50

            const animationData = {
                startX: parseFloat(particle.style.left),
                startY: parseFloat(particle.style.top),
                angle,
                distance,
                startTime: Date.now(),
                duration: duration * 1000,
                size: particleSize,
            }

                ; (particle as any).animationData = animationData
            containerRef.current.appendChild(particle)
            particlesRef.current.push(particle)

            setTimeout(() => {
                const index = particlesRef.current.indexOf(particle)
                if (index > -1) {
                    particlesRef.current.splice(index, 1)
                    particle.remove()
                }
            }, duration * 1000)
        }

        const createSpark = (x: number, y: number) => {
            if (!sparksEnabled || !containerRef.current) return

            const spark = document.createElement('div')
            spark.style.position = 'absolute'
            spark.style.borderRadius = '2px'
            spark.style.pointerEvents = 'none'

            const width = Math.random() * 15 + 5
            const height = Math.random() * 3 + 1
            spark.style.width = `${width}px`
            spark.style.height = `${height}px`
            spark.style.left = `${x}px`
            spark.style.top = `${y}px`

            const color1 = electricColors[Math.floor(Math.random() * electricColors.length)]
            const color2 = electricColors[Math.floor(Math.random() * electricColors.length)]
            spark.style.background = `linear-gradient(90deg, ${color1}, ${color2})`

            const rotation = Math.random() * 360
            spark.style.transform = `rotate(${rotation}deg)`

            containerRef.current.appendChild(spark)
            sparksRef.current.push(spark)

            const duration = 0.5 / animationSpeed
            spark.animate([
                { transform: `rotate(${rotation}deg) scale(1)`, opacity: 1 },
                { transform: `rotate(${rotation + 180}deg) scale(0)`, opacity: 0 }
            ], {
                duration: duration * 1000,
                easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)'
            })

            setTimeout(() => {
                const index = sparksRef.current.indexOf(spark)
                if (index > -1) {
                    sparksRef.current.splice(index, 1)
                    spark.remove()
                }
            }, duration * 1000)
        }

        const createExplosion = (x: number, y: number) => {
            for (let i = 0; i < 15; i++) {
                createParticle(x, y)
            }
            for (let i = 0; i < 8; i++) {
                setTimeout(() => createSpark(x, y), i * 50)
            }
            if (emojiRef.current) {
                emojiRef.current.style.transform = 'scale(1.2)'
                setTimeout(() => {
                    if (emojiRef.current) emojiRef.current.style.transform = ''
                }, 200)
            }
        }

        const animateParticles = () => {
            const now = Date.now()
            particlesRef.current.forEach(particle => {
                const data = (particle as any).animationData
                if (now < data.startTime) return

                const elapsed = now - data.startTime
                const progress = Math.min(elapsed / data.duration, 1)
                const easeOut = 1 - Math.pow(1 - progress, 3)

                const newX = data.startX + Math.cos(data.angle) * data.distance * easeOut
                const newY = data.startY + Math.sin(data.angle) * data.distance * easeOut

                particle.style.left = `${newX}px`
                particle.style.top = `${newY}px`
                particle.style.opacity = `${0.8 * (1 - progress)}`

                const newSize = data.size * (1 - progress * 0.5)
                particle.style.width = `${newSize}px`
                particle.style.height = `${newSize}px`
            })
        }

        const animate = () => {
            const now = Date.now()

            if (pulseEnabled && emojiRef.current) {
                const pulseScale = 1 + Math.sin(now * 0.003 * animationSpeed) * 0.1
                const brightness = 100 + Math.sin(now * 0.005 * animationSpeed) * 30
                const shadowBlur = 20 + Math.sin(now * 0.004 * animationSpeed) * 10

                emojiRef.current.style.transform = `scale(${pulseScale})`
                emojiRef.current.style.filter = `drop-shadow(0 0 ${shadowBlur}px rgba(255, 215, 0, 0.7)) brightness(${brightness}%)`
            }

            animateParticles()
            animationIdRef.current = requestAnimationFrame(animate)
        }

        // Initialize particles
        for (let i = 0; i < 20; i++) {
            createParticle()
        }

        // Start animation
        animate()

        // Add click handler
        const handleClick = (e: MouseEvent) => {
            if (!containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            createExplosion(x, y)
        }

        emojiRef.current?.addEventListener('click', handleClick)
        const emojiElement = emojiRef.current

        return () => {
            if (animationIdRef.current) {
                cancelAnimationFrame(animationIdRef.current)
            }
            particlesRef.current.forEach(p => p.remove())
            sparksRef.current.forEach(s => s.remove())
            emojiElement?.removeEventListener('click', handleClick)
        }
    }, [])

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: `${size * 1.4}px`,
                height: `${size * 1.4}px`,
                margin: '0 auto',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
            }}
        >
            <div
                ref={emojiRef}
                style={{
                    fontSize: `${size}px`,
                    position: 'absolute',
                    userSelect: 'none',
                    filter: 'drop-shadow(0 0 20px rgba(255, 215, 0, 0.5))',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                }}
            >
                ⚡
            </div>
        </div>
    )
}
