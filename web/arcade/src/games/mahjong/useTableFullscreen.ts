import { useEffect, useRef, useState } from 'react';

type OrientationControl = ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };

export function useTableFullscreen() {
  const target = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<'none' | 'native' | 'immersive'>('none');
  const [hint, setHint] = useState('');
  const wanted = useRef(false);
  const mounted = useRef(true);
  const locked = useRef(false);
  const generation = useRef(0);
  const native = useRef(false);
  const lockOwner = useRef<number | null>(null);
  const unlock = () => {
    if (locked.current) {
      locked.current = false;
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* Browser may already have released the lock. */
      }
    }
  };
  const exit = () => {
    wanted.current = false;
    native.current = false;
    generation.current++;
    unlock();
    if (document.fullscreenElement === target.current) void document.exitFullscreen().catch(() => {});
    if (mounted.current) {
      setMode('none');
      setHint('');
    }
  };
  useEffect(() => {
    mounted.current = true;
    const element = target.current;
    const changed = () => {
      if (document.fullscreenElement === element) {
        if (wanted.current) {
          native.current = true;
          setMode('native');
        } else void document.exitFullscreen().catch(() => {});
      } else if (wanted.current && document.fullscreenElement === null) {
        // Only a previously native fullscreen session should react to Escape.
        if (native.current) {
          native.current = false;
          wanted.current = false;
          generation.current++;
          unlock();
          setMode('none');
          setHint('');
        }
      }
    };
    document.addEventListener('fullscreenchange', changed);
    return () => {
      mounted.current = false;
      wanted.current = false;
      generation.current++;
      unlock();
      document.removeEventListener('fullscreenchange', changed);
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (mode === 'none') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mode]);
  const toggle = () => {
    if (wanted.current) {
      exit();
      return;
    }
    const element = target.current;
    if (!element || document.fullscreenElement) return;
    wanted.current = true;
    const token = ++generation.current;
    // Call the native API directly in the click gesture, before any await.
    const request = element.requestFullscreen?.bind(element);
    let entering: Promise<void>;
    try {
      entering = request ? request() : Promise.reject(new Error('unsupported'));
    } catch {
      entering = Promise.reject(new Error('unavailable'));
    }
    setMode('immersive');
    setHint('');
    void entering
      .then(async () => {
        if (!mounted.current || !wanted.current || token !== generation.current) {
          if (!wanted.current && document.fullscreenElement === element)
            await document.exitFullscreen().catch(() => {});
          return;
        }
        if (document.fullscreenElement !== element) {
          wanted.current = false;
          setMode('none');
          return;
        }
        native.current = true;
        setMode('native');
        if (matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600) {
          const orientation = screen.orientation as OrientationControl;
          if (orientation?.lock) {
            lockOwner.current = token;
            try {
              await orientation.lock('landscape');
              if (lockOwner.current !== token) return;
              locked.current = true;
              if (!mounted.current || !wanted.current || token !== generation.current) unlock();
            } catch {
              if (mounted.current && wanted.current && token === generation.current && innerHeight > innerWidth)
                setHint('请手动横屏');
            }
          } else if (innerHeight > innerWidth) setHint('请手动横屏');
        }
      })
      .catch(() => {
        if (mounted.current && wanted.current && token === generation.current) {
          setMode('immersive');
          setHint('页面全屏 · 可手动横屏');
        }
      });
  };
  return { target, mode, hint, toggle, exit };
}
