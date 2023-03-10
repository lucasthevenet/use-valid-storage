import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import { inferParser, Parser, getParseFn } from "../internals/parser";
import useEventCallback from "../internals/hooks/useEventCallback";
import useEventListener from "../internals/hooks/useEventListener";

declare global {
  interface WindowEventMap {
    "local-storage": CustomEvent;
    "session-storage": CustomEvent;
  }
}

type SetValue<T> = Dispatch<SetStateAction<T>>;

type StorageConfig<T> = {
  key: string;
  initialValue: T;
  type?: "local" | "session";
  schema?: T extends inferParser<infer TParser>["out"] ? TParser : never;
  replace?: boolean;
};

function useValidStorage<T>(config: StorageConfig<T>): [T, SetValue<T>] {
  const { schema, initialValue, replace, key, type ='local' } = config;
  // Get from storage then
  // parse stored json or return initialValue
  const readValue = useCallback((): T => {
    // Prevent build error "window is undefined" but keeps working
    if (typeof window === "undefined") {
      return initialValue;
    }

    try {
      const item = window[`${type}Storage`].getItem(key);

      if (!item) {
        return initialValue;
      }
      
      if (schema) {
        const parse = getParseFn(schema);

        return parse(parseJSON(item)) as T;
      }

      return parseJSON(item) as T;
    } catch (error) {
      console.warn(`Error reading ${type}Storage key “${key}”:`, error);

      if (replace) {
        window[`${type}Storage`].setItem(key, JSON.stringify(initialValue));

        // We dispatch a custom event so every useSessionStorage hook are notified
        window.dispatchEvent(new Event(`${type}-storage`));
      }
      return initialValue;
    }
  }, [initialValue, key]);

  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(readValue);

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue: SetValue<T> = useEventCallback((value) => {
    // Prevent build error "window is undefined" but keeps working
    if (typeof window === "undefined") {
      console.warn(
        `Tried setting ${type}Storage key “${key}” even though environment is not a client`,
      );
    }

    try {
      // Allow value to be a function so we have the same API as useState
      const newValue = value instanceof Function ? value(storedValue) : value;

      // Save to local storage
      window.localStorage.setItem(key, JSON.stringify(newValue));

      // Save state
      setStoredValue(newValue);

      // We dispatch a custom event so every useLocalStorage hook are notified
      window.dispatchEvent(new Event(`${type}-storage`));
    } catch (error) {
      console.warn(`Error setting ${type}Storage key “${key}”:`, error);
    }
  });

  useEffect(() => {
    setStoredValue(readValue());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStorageChange = useCallback(
    (event: StorageEvent | CustomEvent) => {
      if ((event as StorageEvent)?.key && (event as StorageEvent).key !== key) {
        return;
      }
      setStoredValue(readValue());
    },
    [key, readValue],
  );

  // this only works for other documents, not the current one
  useEventListener("storage", handleStorageChange);

  // this is a custom event, triggered in writeValueToLocalStorage
  // See: useLocalStorage()
  useEventListener(`${type}-storage`, handleStorageChange);

  return [storedValue, setValue];
}

export default useValidStorage;

function parseJSON<T>(value: string | null): T | undefined {
  try {
    return value === "undefined" ? undefined : JSON.parse(value ?? "");
  } catch {
    console.log("parsing error on", { value });
    return undefined;
  }
}