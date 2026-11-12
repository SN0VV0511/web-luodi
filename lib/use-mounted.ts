"use client";

import { useEffect, useState } from "react";

/** False during SSR and the first client render, true after mount. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
