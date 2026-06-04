import { useState, useEffect, useCallback } from 'react';

// useSignal.ts
// A small reusable hook that wraps an arbitrary async fetch function with
// `data`, `loading` and `error` state so components do not have to rewrite
// the same boilerplate. Example usage:
//
// const { data, loading, error } = useSignal(() => getEventVolume('sudan_2023'))
//
// The returned `data` is typed according to the generic parameter `T` and is
// initially `null` until the first successful response arrives.
/**
 * Generic React hook that wraps API calls with loading/error state management
 * @template T The return type of the fetch function
 * @param fetchFn The async function to call for fetching data
 * @returns Object containing data, loading state, and error state
 */
export function useSignal<T>(
  fetchFn: () => Promise<T>
): { data: T | null; loading: boolean; error: string | null } {
  // `data` holds the fetched value of type T. It is `null` before the first
  // successful response and also `null` after an error so components can
  // render an empty state consistently.
  const [data, setData] = useState<T | null>(null);
  // `loading` is true while the request is in progress (from start to
  // completion, regardless of success or failure).
  const [loading, setLoading] = useState(false);
  // `error` is a simple string for easy JSX rendering. The message usually
  // comes from the `throw` in `api.ts`'s get() helper.
  const [error, setError] = useState<string | null>(null);

  // Memoise the fetch function so that useEffect does not re-run on every
  // render. If a new function object is passed each render then the effect
  // dependency would change, triggering an infinite fetch loop (fetch →
  // setState → rerender → new function → fetch). Wrapping fetchFn with
  // useCallback (or passing a stable function from the caller) avoids this.
  const memoizedFetchFn = useCallback(fetchFn, [fetchFn]);

  useEffect(() => {
    // Set indicators synchronously before beginning the async work so the
    // component can render a loading state immediately.
    setLoading(true);
    setError(null);

    memoizedFetchFn()
      .then((result) => {
        // Explicitly clear error on success in case a previous call failed.
        setData(result);
        setError(null);
      })
      .catch((err) => {
        // `err.message || 'An error occurred'` covers cases where thrown
        // values are not standard Error objects.
        setError(err.message || 'An error occurred');
        setData(null);
      })
      .finally(() => {
        // Always clear loading regardless of success or failure.
        setLoading(false);
      });
  }, [memoizedFetchFn]);

  return { data, loading, error };
}
