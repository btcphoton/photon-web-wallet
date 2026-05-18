import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logError, getErrorLogs, clearErrorLogs, type ErrorLog } from './error-logger'

vi.mock('./storage', () => {
    let _store: Record<string, any> = {}
    return {
        getStorageData: vi.fn(async (keys: string[]) => {
            const result: Record<string, any> = {}
            keys.forEach(k => { if (_store[k] !== undefined) result[k] = _store[k] })
            return result
        }),
        setStorageData: vi.fn(async (data: Record<string, any>) => {
            Object.assign(_store, data)
        }),
        _reset: () => { _store = {} },
        _getStore: () => _store,
    }
})

import * as storageMod from './storage'

const resetStore = () => (storageMod as any)._reset()

beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
})

describe('logError', () => {
    it('stores a new log entry', async () => {
        await logError('Something broke', 'Test Source')
        const logs = await getErrorLogs()
        expect(logs).toHaveLength(1)
        expect(logs[0].message).toBe('Something broke')
        expect(logs[0].source).toBe('Test Source')
    })

    it('includes timestamp and id on each log', async () => {
        await logError('err', 'src')
        const logs = await getErrorLogs()
        expect(typeof logs[0].id).toBe('string')
        expect(logs[0].id.length).toBeGreaterThan(0)
        expect(typeof logs[0].timestamp).toBe('number')
        expect(logs[0].timestamp).toBeGreaterThan(0)
    })

    it('stores network field when provided', async () => {
        await logError('err', 'src', undefined, 'regtest')
        const logs = await getErrorLogs()
        expect(logs[0].network).toBe('regtest')
    })

    it('extracts .message when details is an Error object', async () => {
        const err = new Error('native error message')
        await logError('err', 'src', err)
        const logs = await getErrorLogs()
        expect(logs[0].details).toBe('native error message')
    })

    it('stores plain details as-is when not an Error', async () => {
        await logError('err', 'src', { code: 42 })
        const logs = await getErrorLogs()
        expect(logs[0].details).toEqual({ code: 42 })
    })

    it('prepends new logs (most recent first)', async () => {
        await logError('first', 'A')
        await logError('second', 'B')
        const logs = await getErrorLogs()
        expect(logs[0].message).toBe('second')
        expect(logs[1].message).toBe('first')
    })

    it('caps at 50 log entries', async () => {
        for (let i = 0; i < 60; i++) {
            await logError(`error ${i}`, 'src')
        }
        const logs = await getErrorLogs()
        expect(logs).toHaveLength(50)
        expect(logs[0].message).toBe('error 59')
    })

    it('does not throw when storage fails', async () => {
        vi.mocked(storageMod.getStorageData).mockRejectedValueOnce(new Error('storage fail'))
        await expect(logError('err', 'src')).resolves.toBeUndefined()
    })
})

describe('getErrorLogs', () => {
    it('returns empty array when no logs exist', async () => {
        const logs = await getErrorLogs()
        expect(logs).toEqual([])
    })

    it('returns stored logs array', async () => {
        await logError('e1', 's1')
        await logError('e2', 's2')
        const logs = await getErrorLogs()
        expect(logs).toHaveLength(2)
    })
})

describe('clearErrorLogs', () => {
    it('clears all logs', async () => {
        await logError('err', 'src')
        await clearErrorLogs()
        const logs = await getErrorLogs()
        expect(logs).toEqual([])
    })

    it('is safe to call when no logs exist', async () => {
        await expect(clearErrorLogs()).resolves.toBeUndefined()
        expect(await getErrorLogs()).toEqual([])
    })
})
