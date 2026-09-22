import frames from './product-image-frames.json';

export function imageFrameKey(url: string) {
  return url.replace(/\.\d+\.\d+\.(jpg|jpeg|png|webp|gif)(\?|$)/i, '.$1$2');
}

// Original dimensions followed by the content rectangle; no raster is rewritten.
export function fitProductFrame(frame: number[]) {
  const [width, height, x, y, contentWidth, contentHeight] = frame;
  if (
    frame.length !== 6 ||
    !frame.every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    x < 0 ||
    y < 0 ||
    contentWidth <= 0 ||
    contentHeight <= 0 ||
    x + contentWidth > width ||
    y + contentHeight > height
  )
    return null;
  const scale = 82 / Math.max(contentWidth, contentHeight);
  return {
    width: width * scale,
    height: height * scale,
    left: 50 - (x + contentWidth / 2) * scale,
    top: 50 - (y + contentHeight / 2) * scale,
  };
}

export function productImageStyle(url: string) {
  const frame = (frames as Record<string, number[]>)[imageFrameKey(url)];
  const fit = frame && fitProductFrame(frame);
  return fit
    ? {
        width: `${fit.width}%`,
        height: `${fit.height}%`,
        left: `${fit.left}%`,
        top: `${fit.top}%`,
        objectFit: 'fill' as const,
      }
    : {
        width: '100%',
        height: '100%',
        left: 0,
        top: 0,
        objectFit: 'contain' as const,
      };
}
