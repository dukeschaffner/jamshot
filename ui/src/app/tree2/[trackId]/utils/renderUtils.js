

export function radToDeg(rad) {
  return rad * (180 / Math.PI);
}

export function degToRad(deg) {
  return deg * (Math.PI / 180);
}

export function polarDegreesToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = degToRad(angleInDegrees);
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export function polarRadiansToCartesian(centerX, centerY, radius, angleInRadians) {
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}
