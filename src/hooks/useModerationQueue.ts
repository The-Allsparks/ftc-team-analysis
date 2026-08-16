import { useCallback, useEffect, useState } from 'react';
import type { ModerationRecord } from '../data/teamCorrectionsSchema';
import { parseModerationRecord } from '../data/teamCorrectionsSchema';
import {
  MODERATION_QUEUE_STORAGE_KEY,
  approveSubmission,
  rejectSubmission,
} from '../lib/teamCorrections';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function readQueue(storage: StorageLike): ModerationRecord[] {
  try {
    const raw = storage.getItem(MODERATION_QUEUE_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const records: ModerationRecord[] = [];
    for (const row of parsed) {
      const result = parseModerationRecord(row);
      if (result.ok) {
        records.push(result.data);
      }
    }
    return records;
  } catch {
    return [];
  }
}

function writeQueue(storage: StorageLike, records: ModerationRecord[]): void {
  storage.setItem(MODERATION_QUEUE_STORAGE_KEY, JSON.stringify(records));
}

/**
 * Browser-local moderation queue for MVP (#32).
 * Not a server of record — export JSON / GitHub markdown for durable review.
 */
export function useModerationQueue(storage?: StorageLike | null) {
  const [records, setRecords] = useState<ModerationRecord[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const store =
      storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    if (!store) {
      setRecords([]);
      setReady(true);
      return;
    }
    setRecords(readQueue(store));
    setReady(true);
  }, [storage]);

  const persist = useCallback(
    (next: ModerationRecord[]) => {
      setRecords(next);
      const store =
        storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
      if (store) {
        writeQueue(store, next);
      }
    },
    [storage],
  );

  const addRecord = useCallback(
    (record: ModerationRecord) => {
      persist([record, ...records.filter((row) => row.id !== record.id)]);
    },
    [persist, records],
  );

  const replaceRecord = useCallback(
    (record: ModerationRecord) => {
      persist(records.map((row) => (row.id === record.id ? record : row)));
    },
    [persist, records],
  );

  const approve = useCallback(
    (id: string, moderatorNote?: string | null) => {
      const current = records.find((row) => row.id === id);
      if (!current) {
        return { ok: false as const, message: 'Record not found.' };
      }
      const result = approveSubmission(current, { moderatorNote });
      if (result.ok) {
        replaceRecord(result.data);
      }
      return result;
    },
    [records, replaceRecord],
  );

  const reject = useCallback(
    (id: string, moderatorNote?: string | null) => {
      const current = records.find((row) => row.id === id);
      if (!current) {
        return { ok: false as const, message: 'Record not found.' };
      }
      const result = rejectSubmission(current, { moderatorNote });
      if (result.ok) {
        replaceRecord(result.data);
      }
      return result;
    },
    [records, replaceRecord],
  );

  const clearAll = useCallback(() => {
    persist([]);
  }, [persist]);

  const pending = records.filter((row) => row.status === 'pending');

  return {
    ready,
    records,
    pending,
    addRecord,
    approve,
    reject,
    clearAll,
  };
}
