/** @returns {object} adventurecraft-core module API */
export function coreApi() {
  const mod = game.modules.get("adventurecraft-core");
  if (!mod?.active) {
    throw new Error("AdventureCraft | adventurecraft-core module is not active");
  }
  return mod.api;
}
