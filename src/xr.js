export async function initXR(renderer, { onSessionStart, onSessionEnd } = {}) {
  const button = document.getElementById('xr-button');
  const label = document.getElementById('xr-support-label');

  if (!('xr' in navigator)) {
    label.textContent = 'WebXR not available in this browser';
    return { endSession: () => {} };
  }

  let supported = false;
  try {
    supported = await navigator.xr.isSessionSupported('immersive-vr');
  } catch {
    supported = false;
  }

  if (!supported) {
    label.textContent = 'No VR headset detected \u2014 flat preview only';
    button.disabled = true;
    return { endSession: () => {} };
  }

  label.textContent = 'Headset ready';
  button.disabled = false;

  let currentSession = null;

  async function requestSession() {
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
      });
      currentSession = session;
      await renderer.xr.setSession(session);
      button.textContent = 'Exit VR';
      label.textContent = 'In session';
      session.addEventListener('end', () => {
        currentSession = null;
        button.textContent = 'Enter VR';
        label.textContent = 'Headset ready';
        onSessionEnd?.();
      });
      onSessionStart?.(session);
    } catch (err) {
      label.textContent = `Couldn\u2019t start VR: ${err.message}`;
    }
  }

  button.addEventListener('click', () => {
    if (currentSession) currentSession.end();
    else requestSession();
  });

  return {
    endSession: () => currentSession?.end()
  };
}
