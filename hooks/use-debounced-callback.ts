"use client";

import { useCallback, useEffect, useRef } from "react";

type DebouncedCallback<TArgs extends unknown[]> = {
  run: (...args: TArgs) => void;
  cancel: () => void;
};

export function useDebouncedCallback<TArgs extends unknown[]>(
  callback: (...args: TArgs) => unknown | Promise<unknown>,
  delay = 900
): DebouncedCallback<TArgs> {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
  }, []);

  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    (...args: TArgs) => {
      cancel();

      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        void callbackRef.current(...args);
      }, delay);
    },
    [cancel, delay]
  );

  return { run, cancel };
}
