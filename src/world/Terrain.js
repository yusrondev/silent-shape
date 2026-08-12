export function getGroundHeight(x, z) {
  // Combination of sines/cosines for natural-looking hills and valleys
  const w1 = Math.sin(x * 0.035) * Math.cos(z * 0.035) * 3.5;
  const w2 = Math.sin(x * 0.012) * Math.cos(z * 0.012) * 5.0;
  return w1 + w2;
}
