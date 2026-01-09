import { getStorageData, setStorageData } from './storage';

export interface ErrorLog {
    id: string;
    timestamp: number;
    message: string;
    source: string;
    details?: any;
    network?: string;
}

/**
 * Log an error to storage for the Admin Error Logs view
 * 
 * @param message - Human readable error message
 * @param source - Where the error occurred (e.g., 'Mempool API', 'ICP Canister')
 * @param details - Optional technical details or raw error object
 * @param network - Optional network context
 */
export const logError = async (message: string, source: string, details?: any, network?: string) => {
    try {
        const result = await getStorageData(['error_logs']);
        const logs: ErrorLog[] = result.error_logs || [];

        const newLog: ErrorLog = {
            id: Math.random().toString(36).substring(2, 11),
            timestamp: Date.now(),
            message,
            source,
            details: details instanceof Error ? details.message : details,
            network
        };

        // Keep only the last 50 logs to prevent storage bloat
        const updatedLogs = [newLog, ...logs].slice(0, 50);

        await setStorageData({ error_logs: updatedLogs });
        console.log(`[ErrorLog] Logged: ${message} from ${source}`);
    } catch (e) {
        console.error('Failed to save error log:', e);
    }
};

/**
 * Get all error logs from storage
 */
export const getErrorLogs = async (): Promise<ErrorLog[]> => {
    const result = await getStorageData(['error_logs']);
    return result.error_logs || [];
};

/**
 * Clear all error logs
 */
export const clearErrorLogs = async () => {
    await setStorageData({ error_logs: [] });
};
