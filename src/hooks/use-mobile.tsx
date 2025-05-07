import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Default to false on the server, or before first client-side effect.
  // This avoids 'undefined' which might cause issues if consumed directly.
  const [isMobile, setIsMobile] = React.useState<boolean>(false)

  React.useEffect(() => {
    // This effect runs only on the client.
    const checkDevice = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    checkDevice() // Initial check on client mount

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    mql.addEventListener("change", checkDevice)

    return () => mql.removeEventListener("change", checkDevice)
  }, []) // Empty dependency array ensures this runs once on mount

  return isMobile
}
