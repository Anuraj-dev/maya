interface Window {
  electronAPI?: {
    moveWindow: (deltaX: number, deltaY: number) => void;
    setBubble: (show: boolean) => void;
    togglePin: () => Promise<boolean>;
    closeOverlay: () => void;
  };
}
