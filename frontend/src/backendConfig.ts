// Empty uses same-origin FastAPI (or Vite's /api development proxy).
export const backendBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
