// Simple toast notification component
// In production, use a library like react-hot-toast or sonner

export function Toaster() {
  return (
    <div id="toast-container" className="fixed top-4 right-4 z-50 space-y-2">
      {/* Toasts will be rendered here */}
    </div>
  );
}

export function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  // Simple implementation - in production use a proper toast library
  console.log(`[${type.toUpperCase()}]`, message);
}
